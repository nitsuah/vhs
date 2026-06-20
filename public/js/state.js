// ── PROMPTS ──────────────────────────────────────────────────────────────
const VISION_PROMPT_FAST = `Read all text visible on VHS tape spines or labels in this image.
A VHS spine is the narrow edge of the cassette. The printed title text is often rotated 90 degrees sideways — tilt your head or rotate the image mentally to read it.
Focus only on reading the actual text characters. Return your best reading even if partially obscured.
Output ONLY a JSON array: [{"title":"exact title text"}]
One object per distinct tape. Return [] only if you truly cannot make out any text.`;

const VISION_PROMPT_FULL = `Read all text on VHS tape spines and labels in this image.
VHS spines are the narrow edges of cassettes — title text is often printed sideways (rotated 90°).
For each tape, read: title (the main text, required), year (4 digits if visible), label (studio name if visible), format (almost always "VHS").
Output ONLY a JSON array: [{"title":"Title Here","year":"1984","label":"Orion","format":"VHS"}]
Include every tape you can make out, even partial readings. Return [] only if truly unreadable.`;

// ── STATE ────────────────────────────────────────────────────────────────
let apiKey      = localStorage.getItem('vhs-apikey')       || '';
let ollamaUrl   = localStorage.getItem('vhs-ollama-url')   || defaultOllamaUrl();
let ollamaModel = localStorage.getItem('vhs-ollama-model') || 'llava:7b';
let fastMode    = localStorage.getItem('vhs-fast-mode') !== 'false';
let ollamaAvail = false;
let inventory      = [];
let cards          = [];   // pending review: [{uid, data, thumb, expanded, source}]
let captureQueue   = [];   // staged captures: [{base64, thumb}]
let uidSeq         = 0;
let isCapturing    = false;
let barcodeMode    = false;
let barcodeRdr  = null;
let lastCode    = { val:'', t:0 };
let wallViewOn  = false;
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
