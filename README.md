# Movie Recommender UI

A FastAPI-based movie recommendation app with a cinematic frontend for exploring similar films from a precomputed similarity matrix.

## Features

- Search movies by title, director, or genre
- Load a featured movie with poster, backdrop, cast, genres, and production details
- Generate configurable recommendation sets from a similarity matrix
- Browse recommendations in a responsive, styled web interface
- Access JSON API endpoints for search, movie details, recommendations, and health checks

## Tech Stack

- Python
- FastAPI
- Jinja2 templates
- Pandas
- Vanilla JavaScript
- CSS

## Project Structure

```text
Movie_Reccomender_UI/
|-- app/
|   |-- app.py
|   |-- data/
|   |   |-- movie_info.pkl
|   |   `-- similarity.pkl
|   |-- static/
|   |   |-- app.js
|   |   `-- styles.css
|   `-- templates/
|       `-- index.html
|-- requirements.txt
|-- setup.sh
`-- Procfile
```

## Requirements

- Python 3.10 or newer recommended
- The dataset files below must exist:
  - `app/data/movie_info.pkl`
  - `app/data/similarity.pkl`

## Installation

1. Create a virtual environment:

```bash
python -m venv .venv
```

2. Activate it:

```bash
.venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

You can also use the included setup script:

```bash
sh setup.sh
```

## Run The App

Start the development server with:

```bash
uvicorn app.app:app --reload
```

Then open:

```text
http://127.0.0.1:8000
```

## API Endpoints

### `GET /`

Serves the main movie discovery interface.

### `GET /api/health`

Checks that the movie dataset and similarity matrix can be loaded.

### `GET /api/movies`

Searches movies by query string.

Example:

```text
/api/movies?query=batman&limit=20
```

### `GET /api/movies/{movie_index}`

Returns details for a movie by its internal dataset index.

### `GET /api/recommendations`

Returns recommendations for a selected movie.

Example:

```text
/api/recommendations?movie_index=0&limit=6
```

## How It Works

- `movie_info.pkl` stores the movie metadata used by the UI and API
- `similarity.pkl` stores precomputed similarity scores between movies
- The backend loads both files, validates them, and serves recommendation data
- The frontend fetches movie search and recommendation results dynamically with JavaScript

## Notes

- `similarity.pkl` is large, so startup and deployment should account for memory usage
- Recommendation counts are limited in the app to keep the interface responsive
- Poster and backdrop images are loaded using TMDB image URLs stored in the dataset

## Start Command

The included `Procfile` uses:

```text
web: sh setup.sh && uvicorn app.app:app --reload
```
