// ── RENDER HELPERS ────────────────────────────────────────────────────────────
export const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// includeRotate: pass true only when this image is also getting the
// StacksUp-mode sideways layout rotation (.su-img-spine's CSS class) —
// an inline crop-adjustment style overrides that CSS transform outright,
// so it must replicate the same rotation there or the image would render
// upright-in-a-sideways-card. Every other context (table thumbnail, plain
// Spine-landscape view, cover art) must pass false/omit it, since those
// never apply a layout rotation and stacking one on top of a crop
// adjustment would visibly rotate the image incorrectly.
export function _cropStyle(t, role, includeRotate) {
  const c = (t.photo_crop || {})[role];
  if (!c) return '';
  const x = c.x ?? 50, y = c.y ?? 50, s = c.s ?? 1;
  if (x === 50 && y === 50 && s <= 1) return '';
  const parts = [];
  if (includeRotate) parts.push('rotate(90deg)');
  if (s > 1) parts.push(`scale(${s})`);
  return ` style="object-position:${x}% ${y}%${parts.length ? `;transform:${parts.join(' ')}` : ''}"`;
}

export function _eggAttrs(t) {
  const attrs = [];
  if (/jaws/i.test(t.title)) attrs.push('data-jaws');
  if (/ghostbusters/i.test(t.title)) attrs.push('data-ghostbusters');
  if (/night of the living dead/i.test(t.title)) attrs.push('data-notld');
  if (/speed racer/i.test(t.title)) attrs.push('data-speedracer');
  return attrs.length ? ' ' + attrs.join(' ') : '';
}

export function statusLabel(s) {
  return {
    in_collection: 'In Coll.',
    for_sale: 'For Sale',
    sold: 'Sold',
    donated: 'Donated',
    missing: 'Missing',
    wanted: 'Wanted'
  }[s] || s;
}

const GENRES = ['Horror','Comedy','Action','Drama','Sci-Fi','Thriller','Documentary','Animation','Romance','Mystery','Western','Musical','Fantasy','Crime','Family','Foreign','Anime','SOV','Cult','Sports'];

export function renderTagChips(activeTags, editable = true) {
  return GENRES.map(g => {
    const on = activeTags.includes(g);
    return `<span class="tag-chip${on ? ' on' : ''}" data-tag="${esc(g)}">${esc(g)}</span>`;
  }).join('') +
  (editable ? `<input class="tag-add-input" placeholder="custom…" title="Add custom tag" style="margin-left:2px" value="">` : '') +
  (activeTags.filter(t => !GENRES.includes(t)).map(t =>
    `<span class="tag-chip on" data-tag="${esc(t)}">${esc(t)} ×</span>`).join(''));
}
