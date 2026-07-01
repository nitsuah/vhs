// ── ROUTES: LOOKUP ────────────────────────────────────────────────────────────
const { pool } = require('../db');
const { callOmdb, enhancedLookup } = require('../omdb');
const { OMDB_API_KEY, OLLAMA, OLLAMA_MODEL } = require('../config');
const { parseJsonObject } = require('../json-parser');

async function lookupBarcodeHandler(req, res) {
  const code = req.params.code.trim().replace(/\s/g, '');
  if (!code) return res.status(400).json({ error: 'code required' });
  const omdbKey = (req.headers['x-omdb-key'] || OMDB_API_KEY).trim();

  let found = null;

  // 1. UPC Item DB — covers most North American retail product codes
  try {
    const r = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`
    );
    if (r.ok) {
      const d = await r.json();
      if (d.items?.length) {
        const item = d.items[0];
        found = {
          title: item.title || '',
          year: '',
          label: item.brand || '',
          format: 'VHS',
          imdb_id: '',
          barcode: code,
          source: 'upcitemdb',
        };
      }
    }
  } catch (e) {
    console.warn('UPC lookup error:', e.message);
  }

  // 2. Open Library fallback (ISBN/EAN)
  if (!found) {
    try {
      const r = await fetch(`https://openlibrary.org/api/volumes/brief/isbn/${encodeURIComponent(code)}.json`);
      if (r.ok) {
        const d = await r.json();
        const rec = d.records?.[Object.keys(d.records || {})[0]];
        if (rec?.title) {
          found = {
            title: rec.title,
            year: (rec.publish_date || '').match(/\d{4}/)?.[0] || '',
            label: '',
            format: 'VHS',
            imdb_id: '',
            barcode: code,
            source: 'openlibrary',
          };
        }
      }
    } catch (e) {
      console.warn('Open Library lookup:', e.message);
    }
  }

  if (!found) return res.status(404).json({ error: 'not found' });

  // 3. Enrich with OMDb authoritative year + IMDB id
  if (omdbKey && found.title) {
    const omdb = await callOmdb({ title: found.title }, omdbKey).catch(() => null);
    if (omdb?.imdb_id) {
      found = { ...found, year: omdb.year || found.year, imdb_id: omdb.imdb_id };
    }
  }

  res.json(found);
}

async function lookupTitleHandler(req, res) {
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const omdbKey = (req.headers['x-omdb-key'] || OMDB_API_KEY).trim();
  const noai = req.query.noai === '1';

  // Escape prompt content for JSON structure to prevent injection
	  const escapedTitle = title
	    .replace(/\\/g, '\\\\')  // Escape backslashes first
	    .replace(/`/g, '\\`')
	    .replace(/\${/g, '\\${');
	  // Escape prompt content for JSON structure to prevent injection
  const escapedTitle = title
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');
  const prompt = `You are VHS collectibles expert. For title: "${escapedTitle}"
Return ONLY JSON object — no other text:
{"year":"1984","label":"Orion Pictures","format":"VHS","value_low":"8","value_high":"25"}
Rules: year=4-digit release year, label=VHS distributor/studio, value_low/value_high=USD resale range in good condition.
Omit fields you unsure about. Return {} if completely unknown.`;

  const ollamaPromise = noai
    ? Promise.resolve({})
    : fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_predict: 128 } }),
      })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);

  const [ollamaRes, omdb] = await Promise.all([
    ollamaPromise,
    callOmdb({ title }, omdbKey).catch(() => null)
  ]);

  const ollamaMeta = parseJsonObject(ollamaRes?.response || '{}');
  const aiMeta = { ...ollamaMeta, ...omdb };
  if (!aiMeta.label) aiMeta.label = '';
  if (!aiMeta.year) aiMeta.year = '';

  res.json({ title, ...aiMeta });
}

async function trailerHandler(req, res) {
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const query = encodeURIComponent(`${title} - official trailer`);
    const r = await fetch(`https://www.youtube.com/results?search_query=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.json({ videoId: null });
    const html = await r.text();
    const m = html.match(/"videoRenderer"\s*:\s*\{"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    const fallback = m ? null : html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    res.json({ videoId: (m || fallback)?.[1] || null });
  } catch (e) {
    res.json({ videoId: null });
  }
}

module.exports = { lookupBarcodeHandler, lookupTitleHandler, trailerHandler };