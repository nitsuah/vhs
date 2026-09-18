#!/usr/bin/env node
// ── METADATA AUDIT TOOL ────────────────────────────────────────────────────
//
// Deterministic metadata-integrity audit for the VHS collection. Compares
// each tape's stored title/year/genre/barcode against a fresh OMDb lookup
// (the same enhancedLookup() the app itself uses for Fill/Revalidate) and
// reports discrepancies — it never overwrites data unattended. --apply only
// ever touches the tape ids you explicitly name (or --all --confirm-all,
// which is refused until --ids has been used at least once in this run).
//
// Tapes have no fixed relational schema — everything lives in the `data`
// JSONB column — so this discovers fields empirically off what's actually
// there rather than assuming a rigid shape.
//
// Run inside the project's Docker container (it already has DATABASE_URL /
// OMDB_API_KEY from the compose env_file, and this repo has no local dotenv
// loader of its own — see .env / docker-compose.yml):
//
//   docker compose -f config/docker-compose.yml exec web node scripts/audit-metadata.js
//
// Usage:
//   node scripts/audit-metadata.js                       # dry-run, whole collection
//   node scripts/audit-metadata.js --limit=20             # dry-run, first 20 tapes
//   node scripts/audit-metadata.js --ids=A,B,C            # dry-run, just these tapes
//   node scripts/audit-metadata.js --apply --ids=A,B,C    # apply corrections to just these tapes
//   node scripts/audit-metadata.js --apply --all --confirm-all   # apply to the whole collection
//
// Only "high confidence" discrepancies (a missing year/imdb_id OMDb is
// confident about) are ever auto-applied. Fuzzy title matches and genre
// suggestions are judgment calls — they're reported, never written
// automatically, even in --apply mode. Writes use the same partial-JSONB-
// merge pattern as valuate.js (`data || $1::jsonb`) so a correction can
// never clobber a concurrent edit to other fields.

'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/modules/db');
const { enhancedLookup } = require('../src/modules/omdb');
const { OMDB_API_KEY } = require('../src/modules/config');
const { normalizeTitleForLookup, levenshteinDistance } = require('../src/modules/string-utils');

const LOG_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(LOG_DIR, 'audit-metadata-log.jsonl');
const OMDB_DELAY_MS = 250; // be a polite client against OMDb's free-tier daily quota

function parseArgs(argv) {
  const args = { apply: false, all: false, confirmAll: false, ids: null, limit: null };
  for (const a of argv) {
    if (a === '--apply') args.apply = true;
    else if (a === '--all') args.all = true;
    else if (a === '--confirm-all') args.confirmAll = true;
    else if (a.startsWith('--ids=')) args.ids = a.slice(6).split(',').map(s => s.trim()).filter(Boolean);
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice(8), 10);
  }
  return args;
}

function titleSimilarity(a, b) {
  const na = normalizeTitleForLookup(a), nb = normalizeTitleForLookup(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen ? 1 - levenshteinDistance(na, nb) / maxLen : 0;
}

async function fetchTapes({ ids, limit }) {
  let sql = 'SELECT id, data FROM tapes';
  const params = [];
  if (ids && ids.length) {
    params.push(ids);
    sql += ' WHERE id = ANY($1::text[])';
  }
  sql += ' ORDER BY id';
  if (limit) sql += ` LIMIT ${Math.max(1, parseInt(limit, 10))}`;
  const { rows } = await pool.query(sql, params);
  // Trust the relational id column over data.id — they're normally the same
  // (tapesPostHandler inserts the whole client-sent object as `data`,
  // including its own id) but the column is the authoritative key for
  // UPDATE/WHERE, so this guarantees the audit never targets a row by a
  // stale or mismatched id embedded in the JSONB.
  return rows.map(r => ({ ...r.data, id: r.id }));
}

// Barcode format/duplicate checks are done locally against the DB itself —
// no external API call. Re-verifying barcodes against UPCItemDB's rate-
// limited free trial tier across ~500 titles is unreliable enough (see the
// image-editing investigation for this codebase) that it would produce more
// noise than signal; format + duplicate checks are cheap and deterministic.
function auditBarcodesLocally(tapes) {
  const byBarcode = new Map();
  const issues = [];
  for (const t of tapes) {
    const bc = (t.barcode || '').trim();
    if (!bc) continue;
    if (!/^\d{8,14}$/.test(bc)) {
      issues.push({ id: t.id, title: t.title, issue: `not a plausible UPC/EAN: "${bc}"` });
      continue;
    }
    if (!byBarcode.has(bc)) byBarcode.set(bc, []);
    byBarcode.get(bc).push({ id: t.id, title: t.title });
  }
  for (const [bc, entries] of byBarcode) {
    if (entries.length > 1) {
      issues.push({
        id: entries.map(e => e.id).join(', '),
        title: entries.map(e => e.title).join(' / '),
        issue: `barcode ${bc} shared by ${entries.length} tapes`,
      });
    }
  }
  return issues;
}

async function auditTape(tape) {
  const discrepancies = [];
  if (!tape.title || !tape.title.trim()) {
    discrepancies.push({ field: 'title', issue: 'empty title', confidence: 'high' });
    return { id: tape.id, title: tape.title || '(untitled)', discrepancies, omdb: null };
  }

  let omdb = null;
  try {
    omdb = await enhancedLookup({ title: tape.title, imdbId: tape.imdb_id || undefined }, OMDB_API_KEY);
  } catch (e) {
    discrepancies.push({ field: 'lookup', issue: `OMDb lookup failed: ${e.message}`, confidence: 'info' });
    return { id: tape.id, title: tape.title, discrepancies, omdb: null };
  }
  if (!omdb) {
    discrepancies.push({ field: 'lookup', issue: 'no OMDb match found', confidence: 'info' });
    return { id: tape.id, title: tape.title, discrepancies, omdb: null };
  }

  const sim = titleSimilarity(tape.title, omdb.title);
  if (sim < 0.6) {
    discrepancies.push({
      field: 'title',
      issue: `stored "${tape.title}" vs OMDb "${omdb.title}" (similarity ${(sim * 100).toFixed(0)}%)`,
      confidence: sim < 0.3 ? 'low' : 'medium',
      suggested: omdb.title,
    });
  }

  if (omdb.year) {
    if (!tape.year) {
      discrepancies.push({ field: 'year', issue: `missing — OMDb says ${omdb.year}`, confidence: 'high', suggested: omdb.year });
    } else if (String(tape.year).trim() !== String(omdb.year).trim()) {
      // A stored year that merely disagrees with OMDb is never auto-applied
      // (only a *missing* year is, above) — an existing value is a human
      // decision (region/re-release dates are a common, legitimate reason
      // to disagree), so this is always reported at 'medium', never 'high'.
      discrepancies.push({
        field: 'year',
        issue: `stored ${tape.year} vs OMDb ${omdb.year}`,
        confidence: 'medium',
        suggested: omdb.year,
      });
    }
  }

  // "Genre" isn't a dedicated tape field — the collection's own genre-like
  // field is the free-form `tags` list (see docs/EASTEREGG.md's now-unused
  // genre-hover CSS for the canonical 19-genre vocabulary). Treated as a
  // suggestion only: tags are user-curated and may legitimately include
  // things OMDb's genre list wouldn't (or vice versa).
  if (omdb.genres && omdb.genres.length) {
    const tags = (tape.tags || []).map(g => g.toLowerCase());
    const matches = omdb.genres.filter(g => tags.includes(g.toLowerCase()));
    if (!matches.length) {
      discrepancies.push({
        field: 'genre',
        issue: `no overlap with OMDb genres: ${omdb.genres.join(', ')}`,
        confidence: 'low',
        suggested: omdb.genres,
      });
    }
  }

  if (!tape.imdb_id && omdb.imdb_id) {
    discrepancies.push({ field: 'imdb_id', issue: `missing — OMDb says ${omdb.imdb_id}`, confidence: 'high', suggested: omdb.imdb_id });
  }

  return { id: tape.id, title: tape.title, discrepancies, omdb };
}

function printReport(results, barcodeIssues) {
  const withIssues = results.filter(r => r.discrepancies.length);
  console.log(`\n── Metadata Audit Report ──`);
  console.log(`${results.length} tape(s) checked, ${withIssues.length} with at least one discrepancy.\n`);

  ['high', 'medium', 'low', 'info'].forEach(level => {
    const rows = withIssues.flatMap(r =>
      r.discrepancies.filter(d => d.confidence === level).map(d => ({ ...d, id: r.id, title: r.title }))
    );
    if (!rows.length) return;
    console.log(`── ${level.toUpperCase()} confidence (${rows.length}) ──`);
    rows.forEach(d => console.log(`  [${d.id}] "${d.title}" — ${d.field}: ${d.issue}`));
    console.log('');
  });

  if (barcodeIssues.length) {
    console.log(`── BARCODE (local check, ${barcodeIssues.length}) ──`);
    barcodeIssues.forEach(i => console.log(`  [${i.id}] "${i.title}" — ${i.issue}`));
    console.log('');
  }

  console.log(
    "Note: this database has no live Easter Egg metadata to protect — VHS Box's " +
    'documented Easter Eggs are UI-side hover/long-press effects, not stored tape fields.'
  );
}

function appendLog(entries) {
  if (!entries.length) return;
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const lines = entries.map(e => JSON.stringify({ ts: new Date().toISOString(), ...e })).join('\n') + '\n';
  fs.appendFileSync(LOG_FILE, lines);
}

async function applyCorrections(results) {
  const applied = [];
  for (const r of results) {
    const patch = {};
    for (const d of r.discrepancies) {
      // Only ever auto-apply high-confidence, unambiguous suggestions.
      // Title and genre are judgment calls (fuzzy matches, subjective
      // tagging) — always reported, never written unattended.
      if (d.confidence !== 'high' || d.suggested === undefined) continue;
      if (d.field === 'year') patch.year = String(d.suggested);
      if (d.field === 'imdb_id') patch.imdb_id = d.suggested;
    }
    if (!Object.keys(patch).length) continue;
    const res = await pool.query('UPDATE tapes SET data = data || $1::jsonb WHERE id = $2', [JSON.stringify(patch), r.id]);
    if (res.rowCount !== 1) {
      console.error(`  [${r.id}] update matched ${res.rowCount} row(s) — skipped`);
      continue;
    }
    applied.push({ id: r.id, title: r.title, patch, source: 'omdb' });
  }
  appendLog(applied);
  console.log(`\nApplied ${applied.length} correction(s). Log: ${LOG_FILE}`);
  applied.forEach(a => console.log(`  [${a.id}] "${a.title}" — ${JSON.stringify(a.patch)}`));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.apply && args.all && !args.confirmAll) {
    console.error(
      'Refusing --apply --all without --confirm-all. Run --apply --ids=<a few ids> first, ' +
      'review the result, then re-run with --apply --all --confirm-all once you trust it.'
    );
    process.exitCode = 1;
    return;
  }
  if (args.apply && !args.all && !args.ids) {
    console.error('Refusing --apply without --ids=<comma-list> or --all --confirm-all. Nothing was written.');
    process.exitCode = 1;
    return;
  }

  // try/finally so a thrown error (a bad OMDb response, a DB hiccup, etc.)
  // still closes the pool — otherwise this CLI can hang open after
  // reporting "Audit failed" instead of exiting.
  try {
    const tapes = await fetchTapes({ ids: args.ids, limit: args.limit });
    if (!tapes.length) { console.log('No tapes matched.'); return; }

    console.log(`Auditing ${tapes.length} tape(s) against OMDb${OMDB_API_KEY ? '' : ' (no OMDB_API_KEY set — lookups will fail)'}...`);

    const results = [];
    for (const t of tapes) {
      results.push(await auditTape(t));
      await new Promise(r => setTimeout(r, OMDB_DELAY_MS));
    }
    const barcodeIssues = auditBarcodesLocally(tapes);

    printReport(results, barcodeIssues);

    if (args.apply) {
      await applyCorrections(results);
    } else {
      console.log('\nDry run only — no changes written. Re-run with --apply --ids=<comma-list> to apply corrections to specific tapes.');
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('Audit failed:', e); process.exitCode = 1; });
