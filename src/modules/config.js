// ── CONFIG ────────────────────────────────────────────────────────────────────
const LOG_LIMIT = 200;
const MAX_RETRIES = 3;

const PORT = parseInt(process.env.PORT || '8080', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '8443', 10);
const OLLAMA = process.env.OLLAMA_UPSTREAM || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava:7b';
const HOST_IP = (process.env.HOST_IP || '').trim();
const CERT_DIR = '/app/certs';
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
Output ONLY a JSON array — no other text:
[{"title":"Title Here","year":"1984","label":"Orion","format":"VHS","confidence":"high"}]
Rules: SPINE = mentally rotate 90° to read vertical text. COVER = largest/most prominent text is the title.
Do NOT hallucinate titles — only output text you can actually see in the image.
A "low" confidence entry is better than omitting it. Return [] only if truly unreadable.`;

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
};