// ── CONFIG ────────────────────────────────────────────────────────────────────
const LOG_LIMIT = 200;
const MAX_RETRIES = 3;

const PORT = parseInt(process.env.PORT || '8080', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '8443', 10);
const OLLAMA = process.env.OLLAMA_UPSTREAM || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava:7b';
const HOST_IP = (process.env.HOST_IP || '').trim();
const CERT_DIR = '/app/certs';

const WORKERS_AI_MODEL = (process.env.WORKERS_AI_VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct').trim();
// Safe default: 200 scans/day. Pricing for llama-3.2-11b-vision-instruct is
// 4,410 neurons per M input tokens and 61,493 per M output tokens. A typical
// scan (~2,500 input tokens for one image + short prompt, ~200 output tokens)
// is about 23 neurons. A conservative 40 neurons/scan with a 20% buffer on the
// 10,000 neuron free daily allocation is 200 scans. Override with VISION_DAILY_CAP.
const VISION_DAILY_CAP = Math.max(1, parseInt(process.env.VISION_DAILY_CAP || '200', 10) || 200);
const NEURONS_PER_SCAN_EST = 40;

const OMDB_API_KEY = (process.env.OMDB_API_KEY || '').trim();

const SCAN_PROMPT = `You are cataloging VHS tapes from a photo for a collection database.
First, determine what the image shows:
- SPINE view: narrow vertical tape edge, text printed sideways/rotated 90° along the edge
- COVER view: full box face with artwork and prominently placed title text
For each tape visible, extract:
- title: the main title text (REQUIRED — your best reading even if partially obscured)
- year: 4-digit release year only if clearly visible (omit if uncertain)
- label: studio or distributor name only if clearly readable (omit if uncertain)
- format: almost always "VHS"
- confidence: "high" if clearly readable, "medium" if partially legible, "low" if a best guess
- condition: great/good/fair/poor only if wear is visible (omit if you cannot tell)
- condition_notes: a short note on damage, fading, or tears only if visible
Output ONLY a JSON array — no other text:
[{"title":"Title Here","year":"1984","label":"Orion","format":"VHS","confidence":"high"}]
Rules: SPINE = mentally rotate 90° to read vertical text. COVER = largest/most prominent text is the title.
Do NOT hallucinate titles — only output text you can actually see in the image.
A "low" confidence entry is better than omitting it. Return [] only if truly unreadable.`;

// ── eBay Browse API (sold-listing valuation) ─────────────────────────────────
const EBAY_CLIENT_ID       = (process.env.EBAY_CLIENT_ID       || '').trim();
const EBAY_CLIENT_SECRET   = (process.env.EBAY_CLIENT_SECRET   || '').trim();
const EBAY_ENVIRONMENT     = (process.env.EBAY_ENVIRONMENT     || 'production').trim();
const EBAY_MARKETPLACE_ID  = (process.env.EBAY_MARKETPLACE_ID  || 'EBAY_US').trim();

const GOOGLE_CLIENT_ID     = (process.env.GOOGLE_CLIENT_ID     || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const JWT_SECRET           = (process.env.JWT_SECRET           || '').trim();
const APP_BASE_URL         = (process.env.APP_BASE_URL         || 'http://localhost:8080').replace(/\/$/, '');

module.exports = {
  LOG_LIMIT,
  MAX_RETRIES,
  PORT,
  HTTPS_PORT,
  OLLAMA,
  OLLAMA_MODEL,
  HOST_IP,
  CERT_DIR,
  OMDB_API_KEY,
  SCAN_PROMPT,
  WORKERS_AI_MODEL,
  VISION_DAILY_CAP,
  NEURONS_PER_SCAN_EST,
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_ENVIRONMENT,
  EBAY_MARKETPLACE_ID,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  JWT_SECRET,
  APP_BASE_URL,
};
