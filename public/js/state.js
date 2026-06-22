// ── PROMPTS ──────────────────────────────────────────────────────────────
const VISION_PROMPT_FAST = `You are reading VHS tape titles from a photo for a cataloging system.

The image may show:
- SPINE: narrow tape edge with text printed sideways/rotated 90° — mentally rotate to read vertical text
- COVER: full box face with artwork — the title is the largest/most prominent text

Output ONLY a JSON array:
[{"title":"exact title text","confidence":"high"|"medium"|"low"}]

One entry per distinct tape. Include a "low" confidence guess rather than omitting it.
Do NOT hallucinate — only read text actually visible. Return [] only if truly unreadable.`;

const VISION_PROMPT_FULL = `You are cataloging VHS tapes from a photo.

Determine what the image shows:
- SPINE view: narrow vertical tape edge, text printed sideways/rotated 90° along the edge
- COVER view: full box face with artwork and prominently placed title text

For each tape visible, extract:
- title: the main title text (REQUIRED — best reading even if partial)
- year: 4-digit year only if clearly visible (omit if uncertain)
- label: studio/distributor only if clearly readable (omit if uncertain)
- format: almost always "VHS"
- confidence: "high" | "medium" | "low" based on how clearly you can read the title

Output ONLY a JSON array:
[{"title":"Title Here","year":"1984","label":"Orion","format":"VHS","confidence":"high"}]

Do NOT hallucinate titles — only output text you can actually see.
A "low" confidence entry is better than omitting it — the user will verify.
Return [] only if genuinely unreadable.`;

// ── STATE ────────────────────────────────────────────────────────────────
let apiKey      = localStorage.getItem('vhs-apikey')       || '';
let ollamaUrl   = localStorage.getItem('vhs-ollama-url')   || defaultOllamaUrl();
let ollamaModel = localStorage.getItem('vhs-ollama-model') || 'llava:7b';
let fastMode    = localStorage.getItem('vhs-fast-mode') !== 'false';
let omdbKey     = localStorage.getItem('vhs-omdb-key')     || '';
let ollamaAvail = false;
let inventory      = [];
let cards          = [];   // pending review: [{uid, data, thumb, expanded, source}]
let captureQueue   = [];   // staged captures: [{base64, thumb}]
let uidSeq         = 0;
let isCapturing    = false;
let barcodeMode    = false;
let barcodeRdr  = null;
let lastCode    = { val:'', t:0 };
let wallMode    = 0; // 0=list, 1=cover wall, 2=spine landscape, 3=stacksup (upright)
let selectedId  = null;
let isNewTape   = false;
let selectedIds = new Set();
let cropFrac    = { x:.12, y:.08, w:.76, h:.84 };
let bcZoom      = 0.7;
let torchOn     = false;
let dragging=false, resizing=false, dragOrig={};
let editingId=null;
const pendingEdits=new Map();

function defaultOllamaUrl() {
  return location.protocol==='file:' ? 'http://localhost:11434' : '/api/ollama';
}

// ── CONSTANTS ────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const FORMAT_LIST = ['VHS','DVD','Blu-ray','Betamax','LaserDisc','8mm/Hi8','Digital','Other'];
const colFilters = {title:'',label:'',format:'',condition:'',status:'',tags:'',yrFrom:'',yrTo:''};
const GENRES = ['Horror','Comedy','Action','Drama','Sci-Fi','Thriller','Documentary','Animation','Romance','Mystery','Western','Musical','Fantasy','Crime','Family','Foreign','Anime','SOV','Cult','Sports'];
const CROP_PRESETS = {
  default:{x:.05,y:.05,w:.9,h:.9},
  cover:{x:.2,y:.1,w:.6,h:.78},
  spine:{x:.38,y:.12,w:.24,h:.66},
  multispine:{x:.05,y:.15,w:.9,h:.7},
};
