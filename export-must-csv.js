#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiMWRiNjExNzc2OTdhMjA2MzBiMmMzMmQyMDA5ODY5YyIsIm5iZiI6MTcyOTAyMjAxOS4xODkwMywic3ViIjoiNjRjYTYxMTgwYjc0ZTkwMGFjNjZjMmE5Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.rslpnPCxpGLXcdYfTyNAuL9Qbd9Zrhy0FjSZG-HRwTw';
const MOVIE_CSV_HEADERS = 'imdbID,Title,Year,Rating10,WatchedDate,Review';
const SHOW_CSV_HEADERS = 'List,ShowMustID,ShowTitle,ShowReleaseDate,Status,Rating10,EpisodesWatched,EpisodeCount,FirstUnwatchedEpisodeID,FirstUnwatchedEpisodeTitle,FirstUnwatchedEpisodeReleaseDate,ModifiedAt';
const SEASON_CSV_HEADERS = 'List,SeasonMustID,SeasonTitle,SeasonReleaseDate,Status,Rating10,EpisodesWatched,EpisodeCount,FirstUnwatchedEpisode,ModifiedAt';
const LOOKUP_BATCH_SIZE = 25;
const TMDB_CONCURRENCY = 5;

let profileID = null;
let mustHeaders = {};
const errorList = [];
const warnList = [];

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.username) {
        printHelp();
        process.exit(args.help ? 0 : 1);
    }

    const username = normalizeUsername(args.username);
    const outDir = path.resolve(args.outDir || '.');
    const diary = args.diary || 'all';
    const tmdbToken = process.env.TMDB_BEARER_TOKEN || DEFAULT_TMDB_TOKEN;

    if (!['all', 'reviewed', 'none'].includes(diary)) {
        throw new Error('--diary must be one of: all, reviewed, none');
    }

    await fs.mkdir(outDir, { recursive: true });

    console.log(`Fetching Must data for ${username}...`);
    const mustData = await exportMustData(username);
    const { movies, shows, seasons } = splitMustDataByType(mustData);
    const showRows = await buildShowRows(shows);
    const csvRows = await convertMustDataToCsvRows(movies, {
        diary,
        tmdbOptions: {
            method: 'GET',
            headers: {
                accept: 'application/json',
                Authorization: `Bearer ${tmdbToken}`
            }
        }
    });

    const wantPath = path.join(outDir, `${username}_want.csv`);
    const watchedPath = path.join(outDir, `${username}_watched.csv`);
    const showsPath = path.join(outDir, `${username}_shows.csv`);
    const seasonsPath = path.join(outDir, `${username}_seasons.csv`);

    await fs.writeFile(wantPath, `${MOVIE_CSV_HEADERS}\n${csvRows.want.join('\n')}\n`, 'utf8');
    await fs.writeFile(watchedPath, `${MOVIE_CSV_HEADERS}\n${csvRows.watched.join('\n')}\n`, 'utf8');
    await fs.writeFile(showsPath, `${SHOW_CSV_HEADERS}\n${showRows.join('\n')}\n`, 'utf8');
    await fs.writeFile(seasonsPath, `${SEASON_CSV_HEADERS}\n${seasons.map(toSeasonCSVRow).join('\n')}\n`, 'utf8');

    console.log(`Wrote ${wantPath}`);
    console.log(`Wrote ${watchedPath}`);
    console.log(`Wrote ${showsPath}`);
    console.log(`Wrote ${seasonsPath}`);
    console.log(`Processed ${csvRows.want.length + csvRows.watched.length} movies. Failed: ${errorList.length}. Uncertain: ${warnList.length}.`);
    console.log(`Exported ${shows.length} show progress rows.`);
    console.log(`Exported ${seasons.length} season progress rows.`);

    if (warnList.length) {
        console.log('\nMovies that might need checking:');
        warnList.forEach(item => console.log(`- ${formatIssue(item)}`));
    }

    if (errorList.length) {
        console.log('\nMovies without IMDb matches:');
        errorList.forEach(item => console.log(`- ${formatIssue(item)}`));
    }
}

function parseArgs(argv) {
    const args = {};

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            args.help = true;
        } else if (arg === '--out-dir') {
            args.outDir = argv[++i];
        } else if (arg.startsWith('--out-dir=')) {
            args.outDir = arg.slice('--out-dir='.length);
        } else if (arg === '--diary') {
            args.diary = argv[++i];
        } else if (arg.startsWith('--diary=')) {
            args.diary = arg.slice('--diary='.length);
        } else if (!args.username) {
            args.username = arg;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function printHelp() {
    console.log(`Usage: node export-must-csv.js <must-username-or-profile-url> [options]

Options:
  --out-dir <path>        Directory for CSV files. Defaults to current directory.
  --diary <mode>          all, reviewed, or none. Defaults to all.
  -h, --help              Show this help.

Examples:
  node export-must-csv.js jane_doe --out-dir exports
  node export-must-csv.js https://mustapp.com/@jane_doe --diary none

Optional:
  TMDB_BEARER_TOKEN=...   Use your own TMDB API bearer token.
`);
}

function normalizeUsername(value) {
    return String(value || '')
        .trim()
        .replace(/^https?:\/\/(?:www\.)?mustapp\.com\/@?/i, '')
        .replace(/^@/, '')
        .split(/[/?#]/)[0]
        .trim();
}

function splitMustDataByType(mustData) {
    const movies = {};
    const shows = [];
    const seasons = [];

    for (const listName of Object.keys(mustData)) {
        movies[listName] = [];
        for (const item of mustData[listName]) {
            if (item.product?.type === 'season') {
                seasons.push({ ...item, listName });
            } else if (item.product?.type === 'show') {
                shows.push({ ...item, listName });
            } else {
                movies[listName].push(item);
            }
        }
    }

    return { movies, shows, seasons };
}

async function exportMustData(username) {
    const profile = await fetchJson(`https://mustapp.com/api/users/uri/${encodeURIComponent(username)}`, {}, 'Must profile');
    if (profile.error) {
        throw new Error(profile.error.message || `Must user "${username}" was not found.`);
    }
    if (profile.is_private || !profile.lists) {
        throw new Error('This Must profile is private or does not expose movie lists. Make the profile public before exporting.');
    }

    profileID = profile.id;
    mustHeaders = {
        accept: '*/*',
        'accept-language': 'en',
        bearer: '3a77331c-943f-44e8-b636-5deebcbe33b9',
        'content-type': 'application/json;v=1873',
        'x-client-version': 'frontend_site/2.24.2-390.390',
        'x-requested-with': 'XMLHttpRequest'
    };

    return {
        want: await mustIDtoData(profile.lists.want || []),
        shows: await mustIDtoData(profile.lists.shows || []),
        watched: await mustIDtoData(profile.lists.watched || [])
    };
}

async function mustIDtoData(listIDs) {
    if (!listIDs.length) {
        return [];
    }

    const idBatches = [];
    for (let i = 0; i < listIDs.length; i += 100) {
        idBatches.push(listIDs.slice(i, i + 100));
    }

    const filmList = await Promise.all(idBatches.map(async ids => {
        const items = await fetchJson(`https://mustapp.com/api/users/id/${profileID}/products?embed=product`, {
            headers: mustHeaders,
            body: JSON.stringify({ ids }),
            method: 'POST'
        }, 'Must movie details');
        return getReviews(items, ids);
    }));

    return filmList.flat();
}

async function fetchProductsByIDs(productIDs) {
    const uniqueIDs = [...new Set(productIDs.filter(Boolean))];
    const products = new Map();

    for (let i = 0; i < uniqueIDs.length; i += 100) {
        const ids = uniqueIDs.slice(i, i + 100);
        const items = await fetchJson(`https://mustapp.com/api/users/id/${profileID}/products?embed=product`, {
            headers: mustHeaders,
            body: JSON.stringify({ ids }),
            method: 'POST'
        }, 'Must product lookup');

        for (const item of items) {
            products.set(item.product.id, item.product);
        }
    }

    return products;
}

async function getReviews(items, ids) {
    let reviews;
    try {
        reviews = await fetchJson(`https://mustapp.com/api/users/id/${profileID}/products?embed=review`, {
            headers: mustHeaders,
            body: JSON.stringify({ ids }),
            method: 'POST'
        }, 'Must reviews', { retries: 2 });
    } catch (error) {
        warnList.push(`Reviews for ${ids.length} movies`);
        items.forEach(item => {
            item.product.review = '';
        });
        return items;
    }

    for (let i = 0; i < reviews.length; i += 1) {
        items[i].product.review = reviews[i].user_product_info.review?.body ?? '';
    }
    return items;
}

async function convertMustDataToCsvRows(mustData, options) {
    const imdbRows = { want: [], watched: [] };
    const total = mustData.want.length + mustData.watched.length;
    let processed = 0;

    for (const listName of Object.keys(mustData)) {
        for (let i = 0; i < mustData[listName].length; i += LOOKUP_BATCH_SIZE) {
            const subArray = mustData[listName].slice(i, i + LOOKUP_BATCH_SIZE);
            const subRows = await convertInfoToIMDbIDs(subArray, options);
            imdbRows[listName] = imdbRows[listName].concat(subRows);
            processed += subRows.length;
            console.log(`Processed ${processed}/${total} (${listName})`);

            if (i + LOOKUP_BATCH_SIZE < mustData[listName].length) {
                await sleep(2000);
            }
        }
    }

    return imdbRows;
}

async function convertInfoToIMDbIDs(list, options) {
    return mapWithConcurrency(list, TMDB_CONCURRENCY, async item => {
        if (!item.product.release_date) {
            item.product.release_date = '';
            warnList.push(item.product.title);
        }

        let when = item.user_product_info.modified_at.substring(0, 10);
        if (when && options.diary === 'reviewed') {
            when = item.product.review !== '' ? when : '';
        } else if (options.diary === 'none') {
            when = '';
        }

        try {
            const search = await searchOnTMDB(item, options.tmdbOptions);
            if (!search || search.results.length === 0) {
                errorList.push([item.product.title, item.product.release_date]);
                return toCSVRow('', item, when, item.product.review);
            }

            let id = search.results[0]?.id || null;
            if (search.results.length > 1) {
                id = await guessMovie(search, item);
            }

            return getIMDBid(id, item, options.tmdbOptions, when, item.product.review);
        } catch (error) {
            warnList.push(`${item.product.title}: ${error.message}`);
            errorList.push([item.product.title, item.product.release_date]);
            return toCSVRow('', item, when, item.product.review);
        }
    });
}

async function searchOnTMDB(item, options) {
    let title = item.product.title;
    const year = item.product.release_date.substring(0, 4);

    for (let i = 0; i < 3; i += 1) {
        let search = await fetchJson(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&include_adult=true&year=${year}&page=1`, options, `TMDB search for ${item.product.title}`);

        if (typeof search !== 'undefined') {
            if (search.results.length === 0) {
                search = await fetchJson(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&include_adult=true&page=1`, options, `TMDB search for ${item.product.title}`);
            }
            if (search.results.length !== 0) {
                return search;
            }
            title = title.substring(0, title.length - 1);
        }
    }
}

async function getIMDBid(id, item, options, when, review) {
    if (!id) {
        errorList.push([item.product.title, item.product.release_date]);
        return toCSVRow('', item, when, review);
    }

    const film = await fetchJson(`https://api.themoviedb.org/3/movie/${id}/external_ids`, options, `TMDB IMDb lookup for ${item.product.title}`);

    if (film.imdb_id == null) {
        errorList.push([item.product.title, item.product.release_date]);
        film.imdb_id = '';
    }

    return toCSVRow(film.imdb_id, item, when, review);
}

async function guessMovie(search, item) {
    let results = search.results.filter(movie => movie.title === item.product.title);
    if (results.length === 0) {
        results = search.results.filter(movie => movie.release_date === item.product.release_date);
        if (results.length === 0) {
            return search.results[0]?.id || null;
        }
    } else if (results.length > 1) {
        let filtered = results.filter(movie => movie.release_date === item.product.release_date);
        if (filtered.length === 0) {
            filtered = results;
        }
        if (filtered.length > 1) {
            return filtered.find(movie => movie.popularity === Math.max(...filtered.map(m => m.popularity)))?.id || null;
        }
        return filtered[0]?.id || null;
    } else {
        return results[0]?.id || null;
    }
}

function toCSVRow(imdbID, item, when, review) {
    return [
        imdbID,
        item.product.title,
        item.product.release_date.substring(0, 4),
        item.user_product_info.rate ?? '',
        when,
        review
    ].map(csvEscape).join(',');
}

function toSeasonCSVRow(item) {
    const seasonInfo = item.user_product_info?.user_season_info || {};
    return [
        item.listName,
        item.product?.id ?? item.user_product_info?.product_id ?? '',
        item.product?.title ?? '',
        item.product?.release_date ?? '',
        item.user_product_info?.status ?? '',
        item.user_product_info?.rate ?? '',
        seasonInfo.episodes_watched ?? '',
        item.product?.items_count ?? '',
        seasonInfo.first_unwatched_episode ?? '',
        item.user_product_info?.modified_at ?? ''
    ].map(csvEscape).join(',');
}

async function buildShowRows(shows) {
    const firstUnwatchedEpisodeIDs = shows
        .map(item => item.user_product_info?.user_show_info?.first_unwatched_episode)
        .filter(Boolean);
    const firstUnwatchedEpisodes = await fetchProductsByIDs(firstUnwatchedEpisodeIDs);

    return shows.map(item => toShowCSVRow(item, firstUnwatchedEpisodes));
}

function toShowCSVRow(item, firstUnwatchedEpisodes) {
    const showInfo = item.user_product_info?.user_show_info || {};
    const firstUnwatchedEpisode = firstUnwatchedEpisodes.get(showInfo.first_unwatched_episode) || {};

    return [
        item.listName,
        item.product?.id ?? item.user_product_info?.product_id ?? '',
        item.product?.title ?? '',
        item.product?.release_date ?? '',
        item.user_product_info?.status ?? '',
        item.user_product_info?.rate ?? '',
        showInfo.episodes_watched ?? '',
        item.product?.items_count ?? '',
        showInfo.first_unwatched_episode ?? '',
        firstUnwatchedEpisode.title ?? '',
        firstUnwatchedEpisode.release_date ?? '',
        item.user_product_info?.modified_at ?? ''
    ].map(csvEscape).join(',');
}

function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function formatIssue(item) {
    return Array.isArray(item) ? item.filter(Boolean).join(' ') : item;
}

async function fetchJson(url, options, label, retryOptions = {}) {
    const retries = retryOptions.retries ?? 5;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const error = new Error(`${label} returned HTTP ${response.status}`);
                error.status = response.status;
                error.retryAfter = Number(response.headers.get('retry-after')) || null;
                throw error;
            }
            return response.json();
        } catch (error) {
            lastError = error;
            if (!shouldRetry(error) || attempt === retries) {
                throw error;
            }

            const waitMs = getRetryDelayMs(error, attempt);
            console.log(`${label} failed (${error.message}). Retrying in ${Math.round(waitMs / 1000)}s...`);
            await sleep(waitMs);
        }
    }

    throw lastError;
}

function shouldRetry(error) {
    if (!error.status) {
        return true;
    }

    return error.status === 408 || error.status === 429 || error.status >= 500;
}

function getRetryDelayMs(error, attempt) {
    if (error.retryAfter) {
        return error.retryAfter * 1000;
    }

    return Math.min(30000, 1000 * (2 ** attempt));
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await mapper(items[currentIndex], currentIndex);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
    await Promise.all(workers);
    return results;
}

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

main().catch(error => {
    console.error(`Export failed: ${error.message}`);
    process.exit(1);
});
