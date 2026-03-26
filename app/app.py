from __future__ import annotations

import json
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
MOVIE_INFO_PATH = DATA_DIR / "movie_info.pkl"
SIMILARITY_PATH = DATA_DIR / "similarity.pkl"
POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500"
BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/original"
DEFAULT_RECOMMENDATION_COUNT = 6
MAX_RECOMMENDATION_COUNT = 12
MAX_SEARCH_RESULTS = 20000


app = FastAPI(
    title="Movie Discovery Studio",
    description="A FastAPI-powered movie recommender with a cinematic frontend.",
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


def resolve_pickle_payload(payload: Any) -> Any:
    if callable(payload) and hasattr(payload, "__self__"):
        return payload.__self__
    return payload


@lru_cache(maxsize=1)
def load_movie_frame() -> pd.DataFrame:
    with MOVIE_INFO_PATH.open("rb") as file:
        raw_movies = resolve_pickle_payload(pickle.load(file))

    if isinstance(raw_movies, pd.DataFrame):
        movies_df = raw_movies.copy()
    elif isinstance(raw_movies, dict):
        movies_df = pd.DataFrame(raw_movies)
    else:
        raise TypeError(f"Unsupported movie data format: {type(raw_movies)!r}")

    required_columns = [
        "id",
        "title",
        "overview",
        "genres",
        "cast",
        "production_companies",
        "directors",
        "poster_path",
        "backdrop_path",
    ]
    missing_columns = [column for column in required_columns if column not in movies_df.columns]
    if missing_columns:
        missing = ", ".join(missing_columns)
        raise ValueError(f"Movie info is missing columns: {missing}")

    cleaned = (
        movies_df[required_columns]
        .fillna("")
        .dropna(subset=["title"])
        .reset_index(drop=True)
    )
    return cleaned


@lru_cache(maxsize=1)
def load_similarity_matrix():
    with SIMILARITY_PATH.open("rb") as file:
        similarity_matrix = pickle.load(file)

    if len(similarity_matrix) != len(load_movie_frame()):
        raise ValueError("The similarity matrix does not match the movie dataset.")

    return similarity_matrix


@lru_cache(maxsize=1)
def load_search_catalog() -> list[dict[str, Any]]:
    movies_df = load_movie_frame()
    catalog: list[dict[str, Any]] = []

    for movie_index, row in movies_df[["id", "title", "directors", "genres", "poster_path"]].iterrows():
        title = str(row["title"])
        directors = str(row["directors"])
        genres = str(row["genres"])

        catalog.append(
            {
                "movie_index": movie_index,
                "title": title,
                "subtitle": directors or "Director unknown",
                "poster_url": build_image_url(POSTER_BASE_URL, str(row["poster_path"])),
                "tmdb_id": int(row["id"]),
                "title_normalized": title.casefold(),
                "subtitle_normalized": directors.casefold(),
                "genres_normalized": genres.casefold(),
            }
        )

    return catalog


def build_image_url(base_url: str, image_path: str) -> str | None:
    return f"{base_url}{image_path}" if image_path else None


def short_text(value: str, limit: int) -> str:
    cleaned = " ".join(str(value or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def serialize_movie(movie_index: int, score: float | None = None) -> dict[str, Any]:
    movies_df = load_movie_frame()
    if movie_index < 0 or movie_index >= len(movies_df):
        raise IndexError("Movie index out of bounds")

    row = movies_df.iloc[movie_index]
    movie = {
        "movie_index": movie_index,
        "id": int(row["id"]),
        "title": str(row["title"]),
        "overview": str(row["overview"]),
        "genres": str(row["genres"]),
        "cast": str(row["cast"]),
        "production_companies": str(row["production_companies"]),
        "directors": str(row["directors"]),
        "poster_path": str(row["poster_path"]),
        "backdrop_path": str(row["backdrop_path"]),
        "poster_url": build_image_url(POSTER_BASE_URL, str(row["poster_path"])),
        "backdrop_url": build_image_url(BACKDROP_BASE_URL, str(row["backdrop_path"])),
        "overview_short": short_text(str(row["overview"]), 190),
        "genres_short": short_text(str(row["genres"]), 72),
        "directors_short": short_text(str(row["directors"]), 72),
        "cast_short": short_text(str(row["cast"]), 120),
    }
    if score is not None:
        movie["score"] = round(float(score), 4)
    return movie


def search_movies(query: str, limit: int = MAX_SEARCH_RESULTS) -> list[dict[str, Any]]:
    normalized = query.strip().casefold()
    results: list[tuple[tuple[int, int, int, str], dict[str, Any]]] = []

    for item in load_search_catalog():
        title_normalized = str(item["title_normalized"])
        subtitle_normalized = str(item["subtitle_normalized"])
        genres_normalized = str(item["genres_normalized"])

        if not normalized:
            in_title = True
            in_subtitle = False
            in_genres = False
        else:
            in_title = normalized in title_normalized
            in_subtitle = normalized in subtitle_normalized
            in_genres = normalized in genres_normalized
        if not (in_title or in_subtitle or in_genres):
            continue

        results.append(
            (
                (
                    0 if title_normalized.startswith(normalized) else 1,
                    0 if in_title else (1 if in_subtitle else 2),
                    abs(len(title_normalized) - len(normalized)),
                    title_normalized,
                ),
                {
                    "movie_index": item["movie_index"],
                    "title": item["title"],
                    "subtitle": item["subtitle"],
                    "poster_url": item["poster_url"],
                    "tmdb_id": item["tmdb_id"],
                },
            )
        )

    results.sort(key=lambda item: item[0])
    return [item[1] for item in results[:limit]]


def recommend_movies(movie_index: int, limit: int) -> list[dict[str, Any]]:
    if limit < 1 or limit > MAX_RECOMMENDATION_COUNT:
        raise HTTPException(status_code=400, detail="Invalid recommendation count.")

    similarity_matrix = load_similarity_matrix()
    distances = list(enumerate(similarity_matrix[movie_index]))
    sorted_movies = sorted(distances, key=lambda item: item[1], reverse=True)

    recommendations: list[dict[str, Any]] = []
    for index, score in sorted_movies[1 : limit + 1]:
        recommendations.append(serialize_movie(index, score=float(score)))

    return recommendations


def app_stats() -> dict[str, Any]:
    movies_df = load_movie_frame()
    unique_directors = movies_df["directors"].replace("", pd.NA).dropna().nunique()
    unique_genres = set()
    for value in movies_df["genres"]:
        unique_genres.update(part.strip() for part in str(value).split(",") if part.strip())

    return {
        "movie_count": int(len(movies_df)),
        "director_count": int(unique_directors),
        "genre_count": int(len(unique_genres)),
        "data_source": MOVIE_INFO_PATH.name,
    }


@app.get("/", response_class=HTMLResponse)
async def home(request: Request) -> HTMLResponse:
    selected_movie = serialize_movie(0)
    initial_state = {
        "stats": app_stats(),
        "selectedMovie": selected_movie,
        "recommendations": recommend_movies(0, DEFAULT_RECOMMENDATION_COUNT),
        "searchResults": [],
        "recommendationCount": DEFAULT_RECOMMENDATION_COUNT,
    }
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "request": request,
            "initial_state": json.dumps(initial_state),
        },
    )


@app.get("/api/health")
async def healthcheck() -> dict[str, str]:
    load_movie_frame()
    load_similarity_matrix()
    return {"status": "ok"}


@app.get("/api/movies")
async def movies(
    query: str = Query(default="", max_length=100),
    limit: int = Query(default=MAX_SEARCH_RESULTS, ge=1, le=MAX_SEARCH_RESULTS),
) -> dict[str, Any]:
    return {"results": search_movies(query, limit=limit)}


@app.get("/api/movies/{movie_index}")
async def movie_detail(movie_index: int) -> dict[str, Any]:
    try:
        movie = serialize_movie(movie_index)
    except IndexError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return movie


@app.get("/api/recommendations")
async def recommendations(
    movie_index: int = Query(..., ge=0),
    limit: int = Query(default=DEFAULT_RECOMMENDATION_COUNT, ge=1, le=MAX_RECOMMENDATION_COUNT),
) -> dict[str, Any]:
    movies_df = load_movie_frame()
    if movie_index >= len(movies_df):
        raise HTTPException(status_code=404, detail="Movie index out of bounds.")

    selected_movie = serialize_movie(movie_index)
    return {
        "selected_movie": selected_movie,
        "recommendations": recommend_movies(movie_index, limit),
        "recommendation_count": limit,
    }
