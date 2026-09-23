// ── TMDb LOOKUP ───────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { pool } = require('./db');
const { levenshteinDistance, normalizeTitleForLookup } = require('./string-utils');
const { withRetry } = require('./retry');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

async function tmdbSearch(title, apiKey) {
  const params = new URLSearchParams({
    api_key: apiKey,
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1'
  });
  const r = await fetch(`${TMDB_BASE}/search/movie?${params}`, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'VHS-Scanner/1.0' }
  });
  if (!r.ok) return null;
  return r.json();
}

async function tmdbDetails(movieId, apiKey) {
  const params = new URLSearchParams({
    api_key: apiKey,
    append_to_response: 'external_ids,videos',
    language: 'en-US'
  });
  const r = await fetch(`${TMDB_BASE}/movie/${movieId}?${params}`, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'VHS-Scanner/1.0' }
  });
  if (!r.ok) return null;
  return r.json();
}

function extractVHSLabel(productionCompanies) {
  // Prefer companies that look like VHS distributors
  const vhsKeywords = ['video', 'home', 'entertainment', 'pictures', 'films', 'releasing', 'distribution'];
  for (const c of productionCompanies || []) {
    const name = (c.name || '').toLowerCase();
    if (vhsKeywords.some(k => name.includes(k))) return c.name;
  }
  return productionCompanies?.[0]?.name || '';
}

async function tmdbLookup({ title, imdbId }, apiKey) {
  if (!apiKey) return null;

  const titleHash = crypto.createHash('md5').update(title.toLowerCase()).digest('hex');
  const normalizedTitle = normalizeTitleForLookup(title);

  // Cache read-through
  try {
    const { rows } = await pool.query(
      `SELECT lookup_data, year, label, imdb_id, poster, genres, source, success
       FROM tmdb_lookups WHERE title_hash = $1 AND normalized_title = $2
       ORDER BY last_attempt DESC LIMIT 1`,
      [titleHash, normalizedTitle]
    );
    if (rows.length > 0 && rows[0].success) {
      const cached = rows[0];
      return {
        title:   (cached.lookup_data && cached.lookup_data.original_title) || title,
        year:    cached.year || '',
        label:   cached.label || '',
        imdb_id: cached.imdb_id || '',
        poster:  cached.poster || '',
        genres:  cached.genres || [],
        source:  cached.source || 'cache',
      };
    }
  } catch (e) {
    console.warn('TMDb cache read-through failed:', e.message);
  }

  let result = null;
  let source = 'tmdb_exact';

  // Search by IMDB ID if provided
  if (imdbId) {
    try {
      const searchParams = new URLSearchParams({ api_key: apiKey, external_source: 'imdb_id' });
      const r = await fetch(`${TMDB_BASE}/find/${imdbId}?${searchParams}`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'VHS-Scanner/1.0' }
      });
      if (r.ok) {
        const d = await r.json();
        if (d.movie_results?.length) {
          const movie = d.movie_results[0];
          const details = await tmdbDetails(movie.id, apiKey);
          if (details) {
            result = {
              title:   details.title,
              year:    (details.release_date || '').slice(0, 4) || '',
              label:   extractVHSLabel(details.production_companies),
              imdb_id: details.external_ids?.imdb_id || imdbId,
              poster:  details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : '',
              genres:  details.genres?.map(g => g.name) || [],
              source:  'tmdb_imdb'
            };
          }
        }
      }
    } catch (e) {
      console.warn('TMDb IMDB lookup failed:', e.message);
    }
  }

  // Fallback: search by title
  if (!result) {
    try {
      const search = await tmdbSearch(normalizedTitle, apiKey);
      if (search?.results?.length) {
        // Find best match using fuzzy matching
        let bestMatch = search.results[0];
        let bestScore = Infinity;
        for (const m of search.results) {
          const score = levenshteinDistance(normalizedTitle, normalizeTitleForLookup(m.title));
          if (score < bestScore) {
            bestScore = score;
            bestMatch = m;
          }
        }
        const details = await tmdbDetails(bestMatch.id, apiKey);
        if (details) {
          result = {
            title:   details.title,
            year:    (details.release_date || '').slice(0, 4) || '',
            label:   extractVHSLabel(details.production_companies),
            imdb_id: details.external_ids?.imdb_id || '',
            poster:  details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : '',
            genres:  details.genres?.map(g => g.name) || [],
            source:  'tmdb_search'
          };
        }
      }
    } catch (e) {
      console.warn('TMDb search lookup failed:', e.message);
    }
  }

  // Persist lookup result
  try {
    const success = result !== null;
    await pool.query(
      'INSERT INTO tmdb_lookups (id, title_hash, original_title, normalized_title, lookup_data,' +
        'year, label, imdb_id, poster, genres, source, found_at, attempts, last_attempt, success) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ' +
      'ON CONFLICT (id) DO UPDATE SET ' +
        'lookup_data = EXCLUDED.lookup_data, year = EXCLUDED.year, label = EXCLUDED.label,' +
        'imdb_id = EXCLUDED.imdb_id, poster = EXCLUDED.poster, genres = EXCLUDED.genres,' +
        'source = EXCLUDED.source, found_at = EXCLUDED.found_at, attempts = EXCLUDED.attempts,' +
        'last_attempt = EXCLUDED.last_attempt, success = EXCLUDED.success',
      [
        `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${Math.random().toString(36).slice(2, 4)}`,
        titleHash,
        title,
        normalizedTitle,
        JSON.stringify({ original_title: title, normalized_title: normalizedTitle, timestamp: new Date().toISOString() }),
        result?.year || null,
        result?.label || null,
        result?.imdb_id || null,
        result?.poster || null,
        JSON.stringify(result?.genres || []),
        result?.source || 'tmdb_search',
        success ? new Date() : null,
        1,
        new Date(),
        success
      ]
    );
  } catch (e) {
    console.warn('TMDb cache write failed:', e.message);
  }

  return result;
}

module.exports = { tmdbLookup };