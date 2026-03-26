const state = {
    selectedMovie: window.__INITIAL_STATE__.selectedMovie,
    recommendations: window.__INITIAL_STATE__.recommendations,
    recommendationCount: window.__INITIAL_STATE__.recommendationCount,
    searchResults: window.__INITIAL_STATE__.searchResults,
};

const elements = {
    heroBackdrop: document.getElementById("hero-backdrop"),
    searchInput: document.getElementById("movie-search"),
    searchResults: document.getElementById("search-results"),
    recommendationCount: document.getElementById("recommendation-count"),
    recommendationCountValue: document.getElementById("recommendation-count-value"),
    refreshButton: document.getElementById("refresh-button"),
    selectionTitle: document.getElementById("selection-title"),
    selectionSubtitle: document.getElementById("selection-subtitle"),
    moviePoster: document.getElementById("movie-poster"),
    posterFallback: document.getElementById("poster-fallback"),
    movieTitle: document.getElementById("movie-title"),
    movieOverview: document.getElementById("movie-overview"),
    detailChips: document.getElementById("detail-chips"),
    movieGenres: document.getElementById("movie-genres"),
    movieDirectors: document.getElementById("movie-directors"),
    movieCast: document.getElementById("movie-cast"),
    movieProduction: document.getElementById("movie-production"),
    recommendationTitle: document.getElementById("recommendation-title"),
    recommendationMeta: document.getElementById("recommendation-meta"),
    recommendationsGrid: document.getElementById("recommendations-grid"),
};

let searchAbortController = null;
let recommendationAbortController = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderSelectedMovie() {
    const movie = state.selectedMovie;
    elements.searchInput.value = movie.title;
    elements.selectionTitle.textContent = movie.title;
    elements.selectionSubtitle.textContent = movie.directors || "Director unknown";
    elements.movieTitle.textContent = movie.title;
    elements.movieOverview.textContent = movie.overview || "Overview not available.";
    elements.movieGenres.textContent = movie.genres || "Not available";
    elements.movieDirectors.textContent = movie.directors || "Not available";
    elements.movieCast.textContent = movie.cast || "Not available";
    elements.movieProduction.textContent = movie.production_companies || "Not available";

    elements.detailChips.innerHTML = [
        movie.genres_short || "Genre info unavailable",
        movie.cast_short || "Cast info unavailable",
        movie.directors_short || "Director info unavailable",
    ]
        .map((value) => `<span class="chip">${escapeHtml(value)}</span>`)
        .join("");

    if (movie.poster_url) {
        elements.moviePoster.src = movie.poster_url;
        elements.moviePoster.alt = `${movie.title} poster`;
        elements.moviePoster.style.display = "block";
        elements.posterFallback.style.display = "none";
    } else {
        elements.moviePoster.removeAttribute("src");
        elements.moviePoster.style.display = "none";
        elements.posterFallback.style.display = "grid";
    }

    const heroImage = movie.backdrop_url || movie.poster_url || "";
    elements.heroBackdrop.style.backgroundImage = heroImage ? `url("${heroImage}")` : "";
    elements.heroBackdrop.style.opacity = heroImage ? "0.3" : "0";
}

function recommendationCard(movie, index) {
    const posterSource = movie.poster_url || movie.backdrop_url;
    const posterMarkup = posterSource
        ? `<img src="${escapeHtml(posterSource)}" alt="${escapeHtml(movie.title)} poster">`
        : "";

    return `
        <article class="recommendation-card" data-movie-index="${movie.movie_index}" style="animation-delay:${index * 70}ms">
            <div class="recommendation-poster">${posterMarkup}</div>
            <div class="recommendation-body">
                <h3 class="recommendation-title">${escapeHtml(movie.title)}</h3>
                <p class="recommendation-copy">${escapeHtml(movie.overview_short || "Overview not available.")}</p>
                <p class="recommendation-copy"><span class="recommendation-label">Genres:</span> ${escapeHtml(movie.genres_short || "Not available")}</p>
                <p class="recommendation-copy"><span class="recommendation-label">Director:</span> ${escapeHtml(movie.directors_short || "Not available")}</p>
            </div>
        </article>
    `;
}

function renderRecommendations() {
    elements.recommendationTitle.textContent = `More Like ${state.selectedMovie.title}`;
    elements.recommendationMeta.textContent = `${state.recommendationCount} curated recommendations for ${state.selectedMovie.title}`;

    if (!state.recommendations.length) {
        elements.recommendationsGrid.innerHTML = '<div class="status-note">No recommendations were found for this movie.</div>';
        return;
    }

    elements.recommendationsGrid.innerHTML = state.recommendations
        .map((movie, index) => recommendationCard(movie, index))
        .join("");
}

function closeSearchResults() {
    elements.searchResults.classList.remove("is-open");
}

function renderSearchResults() {
    if (!state.searchResults.length) {
        elements.searchResults.innerHTML = "";
        closeSearchResults();
        return;
    }

    elements.searchResults.innerHTML = state.searchResults
        .map(
            (movie) => `
                <button class="search-result" type="button" data-movie-index="${movie.movie_index}">
                    <span class="search-result-poster">
                        ${movie.poster_url ? `<img src="${escapeHtml(movie.poster_url)}" alt="${escapeHtml(movie.title)} poster" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), {className:'search-result-placeholder', textContent:'No poster'}));">` : '<span class="search-result-placeholder">No poster</span>'}
                    </span>
                    <span class="search-result-copy">
                        <span class="search-result-title">${escapeHtml(movie.title)}</span>
                        <span class="search-result-subtitle">${escapeHtml(movie.subtitle)}</span>
                        <span class="search-result-subtitle">TMDB ID ${escapeHtml(movie.tmdb_id)}</span>
                    </span>
                </button>
            `
        )
        .join("");
    elements.searchResults.classList.add("is-open");
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
}

async function searchTitles(query) {
    if (searchAbortController) {
        searchAbortController.abort();
    }
    searchAbortController = new AbortController();

    try {
        const data = await fetchJson(`/api/movies?query=${encodeURIComponent(query)}&limit=20000`, {
            signal: searchAbortController.signal,
        });
        state.searchResults = data.results;
        renderSearchResults();
    } catch (error) {
        if (error.name !== "AbortError") {
            elements.searchResults.innerHTML = '<div class="status-note">Search is temporarily unavailable.</div>';
            elements.searchResults.classList.add("is-open");
        }
    }
}

async function loadRecommendations(movieIndex) {
    if (recommendationAbortController) {
        recommendationAbortController.abort();
    }
    recommendationAbortController = new AbortController();

    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = "Loading...";

    try {
        const data = await fetchJson(
            `/api/recommendations?movie_index=${encodeURIComponent(movieIndex)}&limit=${encodeURIComponent(state.recommendationCount)}`,
            { signal: recommendationAbortController.signal }
        );
        state.selectedMovie = data.selected_movie;
        state.recommendations = data.recommendations;
        renderSelectedMovie();
        renderRecommendations();
        closeSearchResults();
    } catch (error) {
        if (error.name !== "AbortError") {
            elements.recommendationsGrid.innerHTML = '<div class="status-note">Could not load recommendations right now.</div>';
        }
    } finally {
        elements.refreshButton.disabled = false;
        elements.refreshButton.textContent = "Refresh recommendations";
    }
}

function bindEvents() {
    let searchDebounce = null;

    elements.searchInput.addEventListener("input", (event) => {
        const query = event.target.value.trim();
        window.clearTimeout(searchDebounce);
        searchDebounce = window.setTimeout(() => {
            searchTitles(query);
        }, 90);
    });

    elements.searchInput.addEventListener("focus", () => {
        searchTitles(elements.searchInput.value.trim());
    });

    elements.searchResults.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-movie-index]");
        if (!trigger) {
            return;
        }

        const movieIndex = Number(trigger.dataset.movieIndex);
        loadRecommendations(movieIndex);
    });

    document.addEventListener("click", (event) => {
        const withinSearch = event.target.closest(".search-shell");
        if (!withinSearch) {
            closeSearchResults();
        }
    });

    elements.recommendationCount.addEventListener("input", (event) => {
        state.recommendationCount = Number(event.target.value);
        elements.recommendationCountValue.textContent = String(state.recommendationCount);
    });

    elements.refreshButton.addEventListener("click", () => {
        loadRecommendations(state.selectedMovie.movie_index);
    });

    elements.recommendationsGrid.addEventListener("click", (event) => {
        const trigger = event.target.closest("[data-movie-index]");
        if (!trigger) {
            return;
        }

        const movieIndex = Number(trigger.dataset.movieIndex);
        loadRecommendations(movieIndex).then(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

function init() {
    elements.recommendationCount.value = String(state.recommendationCount);
    elements.recommendationCountValue.textContent = String(state.recommendationCount);
    elements.moviePoster.addEventListener("error", () => {
        elements.moviePoster.removeAttribute("src");
        elements.moviePoster.style.display = "none";
        elements.posterFallback.style.display = "grid";
    });
    renderSelectedMovie();
    renderRecommendations();
    bindEvents();
}

init();
