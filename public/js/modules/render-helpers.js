// ── RENDER HELPERS ────────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');

function _cropStyle(t, role, includeRotate) {
  const c = (t.photo_crop || {})[role];
  if (!c) return '';
  const x = c.x ?? 50, y = c.y ?? 50, s = c.s ?? 1;
  if (x === 50 && y === 50 && s <= 1) return '';
  const parts = [];
  if (includeRotate) parts.push('rotate(90deg)');
  if (s > 1) parts.push(`scale(${s})`);
  return ` style="object-position:${x}% ${y}%${parts.length ? `;transform:${parts.join(' ')}` : ''}"`;
}

function _eggAttrs(t) {
  const attrs = [];
  if (/jaws/i.test(t.title)) attrs.push('data-jaws');
  if (/ghostbusters/i.test(t.title)) attrs.push('data-ghostbusters');
  if (/night of the living dead/i.test(t.title)) attrs.push('data-notld');
  if (/speed racer/i.test(t.title)) attrs.push('data-speedracer');
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

function statusLabel(s) {
  return {
    in_collection: 'In Coll.',
    for_sale: 'For Sale',
    sold: 'Sold',
    donated: 'Donated',
    missing: 'Missing',
    wanted: 'Wanted'
  }[s] || s;
}

function renderTagChips(activeTags, editable = true) {
  const GENRES = ['Horror','Comedy','Action','Drama','Sci-Fi','Thriller','Documentary','Animation','Romance','Mystery','Western','Musical','Fantasy','Crime','Family','Foreign','Anime','SOV','Cult','Sports'];
  return GENRES.map(g => {
    const on = activeTags.includes(g);
    return `<span class="tag-chip${on ? ' on' : ''}" data-tag="${esc(g)}">${esc(g)}</span>`;
  }).join('') +
  (editable ? `<input class="tag-add-input" placeholder="custom…" title="Add custom tag" style="margin-left:2px" value="">` : '') +
  (activeTags.filter(t => !GENRES.includes(t)).map(t =>
    `<span class="tag-chip on" data-tag="${esc(t)}">${esc(t)} ×</span>`).join(''));
}

module.exports = { esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips };