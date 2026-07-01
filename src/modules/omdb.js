// ── OMDb LOOKUP ───────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { OMDB_API_KEY } = require('./config');
const { pool } = require('./db');
const { levenshteinDistance, normalizeTitleForLookup } = require('./string-utils');
const { withRetry } = require('./retry');

// Enhanced lookup function with fuzzy matching and fallbacks
async function enhancedLookup({ title, imdbId }, apiKey = OMDB_API_KEY) {
  if (!apiKey) return null;

  const titleHash = crypto.createHash('md5').update(title.toLowerCase()).digest('hex');
  const normalizedTitle = normalizeTitleForLookup(title);

  const now = new Date();

  // Cache read-through: check omdb_lookups before hitting OMDb API
  try {
    const { rows } = await pool.query(
      `SELECT lookup_data, year, label, imdb_id, poster, genres, source, success
       FROM omdb_lookups WHERE title_hash = $1 AND normalized_title = $2
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
    console.warn('Cache read-through failed:', e.message);
  }

  const lookupId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${Math.random().toString(36).slice(2, 4)}`;
  const lookupData = {
    original_title: title,
    normalized_title: normalizedTitle,
    timestamp: now.toISOString(),
    attempts: 1
  };

  // First attempt: try exact match with normalized title
  const params1 = new URLSearchParams({ apikey: apiKey });
  if (imdbId) {
    params1.set('i', imdbId);
  } else {
    params1.set('t', normalizedTitle);
    params1.set('type', 'movie');
  }

  let result = null;
  let source = 'omdb_exact';

  try {
    let r = await fetch(`https://www.omdbapi.com/?${params1}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'VHS-Scanner/1.0' }
    });

    if (r.ok) {
      const d = await r.json();
      if (d.Response === 'False' || !d.Title) {
        source = 'omdb_fuzzy';
        result = await tryVHSVariations(title, apiKey);
      } else {
        result = {
          title:   d.Title,
          year:    (d.Year || '').match(/\d{4}/)?.[0] || '',
          label:   d.Production || '',
          imdb_id: d.imdbID || '',
          poster:  d.Poster && d.Poster !== 'N/A' ? d.Poster : '',
          genres:  d.Genre ? d.Genre.split(',').map(g => g.trim()).filter(Boolean) : [],
          source: source
        };
      }
    }
  } catch (e) {
    console.warn('OMDb exact lookup failed:', e.message);
    source = 'omdb_fuzzy';
  }

  // Fallback: try VHS variations if exact match failed
  if (!result) {
    result = await tryVHSVariations(title, apiKey);
  }

  // Persist lookup result (success or failure) with collision-safe ID
  try {
    const success = result !== null;
    await pool.query(
      'INSERT INTO omdb_lookups (id, title_hash, original_title, normalized_title, lookup_data,' +
        'year, label, imdb_id, poster, genres, source, found_at, attempts, last_attempt, success) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ' +
      'ON CONFLICT (id) DO NOTHING',
      [
        lookupId,
        titleHash,
        title,
        normalizedTitle,
        JSON.stringify(lookupData),
        (result && result.year) || '',
        (result && result.label) || '',
        (result && result.imdb_id) || '',
        (result && result.poster) || '',
        (result && result.genres) || [],
        source,
        now.toISOString(),
        1,
        now.toISOString(),
        success
      ]
    );
  } catch (e) {
    // Safe error logging without externally-controlled format string
    console.warn('Failed to persist OMDb lookup:', e.message);
  }

  return result;
}

async function tryVHSVariations(originalTitle, apiKey) {
  const variations = [
    originalTitle,
    originalTitle.replace('(VHS)', '').trim(),
    originalTitle.replace('(VHS Collectible)', '').trim(),
    originalTitle.replace('(VHS Special Edition)', '').trim(),
    originalTitle.replace('(SDE)', '').trim(),
    normalizeTitleForLookup(originalTitle),
    originalTitle.includes('(') ? originalTitle.split('(')[0].trim() : originalTitle,
    originalTitle + ' (Movie)',
    originalTitle + ' (Film)',
    originalTitle.replace(/DVD|BLUE-RAY|BLURAY|VHS/i, '')
  ].filter(v => v && v.trim() && v !== originalTitle);

  const params = new URLSearchParams({ apikey: apiKey, type: 'movie' });

  for (const variant of variations.slice(0, 5)) { // Try up to 5 variations
    try {
      params.set('t', variant);
      const r = await fetch(`https://www.omdbapi.com/?${params}`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'VHS-Scanner/1.0' }
      });

      if (r.ok) {
        const d = await r.json();
        if (d.Response === 'False' || !d.Title) continue;

        // Store alternative lookup with real computed similarity
        const normOrig = normalizeTitleForLookup(originalTitle);
        const normVar = normalizeTitleForLookup(variant);
        const maxLen = Math.max(normOrig.length, normVar.length);
        const similarity = maxLen > 0 ? 1 - levenshteinDistance(normOrig, normVar) / maxLen : 0.5;

        try {
          await pool.query(
            'INSERT INTO lookup_alternatives (id, original_title, alternative_title, alternative_type, similarity, source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [
              `alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              originalTitle,
              variant,
              'fuzzy_match',
              similarity,
              'omdb_fuzzy',
              new Date().toISOString()
            ]
          );
        } catch (e) {
          console.warn(`Failed to persist lookup_alternative for "${originalTitle}" -> "${variant}": ${e.message}`);
        }

        return {
          title:   d.Title,
          year:    (d.Year || '').match(/\d{4}/)?.[0] || '',
          label:   d.Production || '',
          imdb_id: d.imdbID || '',
          poster:  d.Poster && d.Poster !== 'N/A' ? d.Poster : '',
          genres:  d.Genre ? d.Genre.split(',').map(g => g.trim()).filter(Boolean) : [],
          source: 'omdb_fuzzy'
        };
      }
    } catch (e) {
      console.warn(`OMDb variant lookup failed for "${variant}":`, e.message);
    }
  }

  return null;
}

async function cleanupOldLookups(daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString();

    await pool.query('DELETE FROM omdb_lookups WHERE last_attempt < $1', [cutoffStr]);
    await pool.query('DELETE FROM lookup_alternatives WHERE created_at < $1', [cutoffStr]);
    console.log(`Cleaned up OMDb lookup records older than ${cutoffStr}`);
  } catch (e) {
    console.warn('Failed to cleanup old OMDb lookups:', e.message);
  }
}

// Keep existing callOmdb for backward compatibility
async function callOmdb({ title, imdbId }, apiKey = OMDB_API_KEY) {
  if (!apiKey) return null;
  const params = new URLSearchParams({ apikey: apiKey });
  if (imdbId) { params.set('i', imdbId); }
  else { params.set('t', title); params.set('type', 'movie'); }
  const r = await fetch(`https://www.omdbapi.com/?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const d = await r.json();
  if (d.Response === 'False' || !d.Title) return null;
  return {
    title:   d.Title,
    year:    (d.Year || '').match(/\d{4}/)?.[0] || '',
    label:   d.Production || '',
    imdb_id: d.imdbID || '',
    poster:  d.Poster && d.Poster !== 'N/A' ? d.Poster : '',
    genres:  d.Genre ? d.Genre.split(',').map(g => g.trim()).filter(Boolean) : [],
  };
}

module.exports = { enhancedLookup, callOmdb, cleanupOldLookups, tryVHSVariations, normalizeTitleForLookup, levenshteinDistance };