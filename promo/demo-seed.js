'use strict';
// Fictional demo collection for the journeys and visual-docs screenshots.
// Same tapes, colours, labels and years as the brag-20s launch video
// (promo/brag-20s/composition.html TAPES), so the screenshots and the video
// show one collection. Conditions, statuses and values are illustrative.
// No real accounts or people: auth is mocked off.

// [title, spine bg, ink, band, year, label, condition, status, value_low, value_high, tags]
const ROWS = [
  ['Jaws', '#0d2a5c', '#f2efe6', '#e84040', 1975, 'MCA', 'good', 'in_collection', 12, 18, ['Thriller']],
  ['Ghostbusters', '#f2efe6', '#111111', '#c22a2a', 1984, 'RCA/Columbia', 'great', 'in_collection', 14, 22, ['Comedy']],
  ['Akira', '#c22a2a', '#fff3d6', '#111111', 1988, 'Streamline', 'good', 'for_sale', 28, 40, ['Anime', 'Sci-Fi']],
  ['The Goonies', '#e8b300', '#1a1205', '#7a1f12', 1985, 'Warner', 'great', 'in_collection', 16, 24, ['Adventure']],
  ['Gremlins', '#1f5130', '#f2efe6', '#f0c040', 1984, 'Warner', 'fair', 'for_sale', 6, 10, ['Horror', 'Comedy']],
  ['Big Trouble in Little China', '#3a0f12', '#ffcf6a', '#e84040', 1986, 'CBS/Fox', 'good', 'wanted', 12, 18, ['Action']],
  ['Night of the Living Dead', '#191919', '#e6e6e6', '#3dbb3d', 1968, 'Media', 'good', 'in_collection', 18, 28, ['Horror']],
  ['The Terminator', '#123d6b', '#f0f4ff', '#c22a2a', 1984, 'Thorn EMI', 'great', 'for_sale', 15, 22, ['Sci-Fi', 'Action']],
  ['Labyrinth', '#3b1d5e', '#f6e1ff', '#f0c040', 1986, 'Embassy', 'good', 'in_collection', 16, 24, ['Fantasy']],
  ['Predator', '#2e3b1a', '#e9f0c8', '#c22a2a', 1987, 'CBS/Fox', 'fair', 'in_collection', 8, 14, ['Action']],
  ['Beetlejuice', '#e9e3d0', '#1b1b1b', '#5b2a86', 1988, 'Warner', 'great', 'for_sale', 12, 18, ['Comedy']],
  ['Tron', '#06131f', '#5fe6ff', '#1d8fd6', 1982, 'Walt Disney', 'good', 'in_collection', 20, 32, ['Sci-Fi']],
  ['Aliens', '#0f1f17', '#d8f5c8', '#3dbb3d', 1986, 'CBS/Fox', 'good', 'in_collection', 10, 16, ['Sci-Fi', 'Horror']],
  ['RoboCop', '#5a6470', '#ffffff', '#14246b', 1987, 'Orion', 'great', 'in_collection', 14, 20, ['Action', 'Sci-Fi']],
  ['Back to the Future', '#f2efe6', '#c22a2a', '#e8b300', 1985, 'MCA', 'good', 'sold', 10, 16, ['Sci-Fi', 'Comedy']],
  ['E.T.', '#1b2a5c', '#ffe9a8', '#ff6fb5', 1982, 'MCA', 'good', 'in_collection', 8, 12, ['Family']],
  ['The Princess Bride', '#6b2440', '#ffe6ef', '#f0c040', 1987, 'Nelson', 'great', 'in_collection', 18, 26, ['Fantasy', 'Comedy']],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A flat SVG spine-style "cover" in the tape's colours, as a data URI.
 * Tall and narrow (the wall crops covers to about 1:3), one word per line,
 * each line sized to fit. */
function cover(title, bg, ink, band) {
  const words = title.toUpperCase().split(' ');
  const H = 300, top = 150 - (words.length - 1) * 14;
  const text = words
    .map((w, i) => {
      const fs = Math.min(22, Math.floor(88 / (w.length * 0.72)));
      return `<text x="50" y="${top + i * 28}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${fs}" fill="${ink}">${esc(w)}</text>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${H}" viewBox="0 0 100 ${H}"><rect width="100" height="${H}" fill="${bg}"/><rect y="250" width="100" height="22" fill="${band}"/>${text}<text x="50" y="266" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" fill="${bg}">VHS</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

// Scan times step back from the seed's "today" so the default sort (newest
// first) is stable.
const NOW = '2026-10-07T18:00:00Z';

const TAPES = ROWS.map(([title, bg, ink, band, year, label, condition, status, lo, hi, tags], i) => {
  const thumb = cover(title, bg, ink, band);
  return {
    id: `VHS-${String(i + 1).padStart(4, '0')}`,
    title,
    year: String(year),
    label,
    format: 'VHS',
    condition,
    status,
    scanned_at: new Date(Date.parse(NOW) - (i + 1) * 3600e3).toISOString(),
    tags,
    photos: [],
    photo_thumbnail: thumb,
    photo_face: thumb,
    photo_spine: null,
    photo_crop: null,
    value_low: String(lo),
    value_high: String(hi),
    sold_price: status === 'sold' ? '14' : '',
    barcode: '',
    condition_notes: '',
    notes: '',
  };
});

// Two AI review cards waiting in the Review tab (a fresh shelf shot).
const REVIEW = [
  ['Ghostbusters II', 1989, 'RCA/Columbia'],
  ['Who Framed Roger Rabbit', 1988, 'Touchstone'],
].map(([title, year, label], i) => ({
  id: `rev_demo${i + 1}`,
  job_id: null,
  data: { title, year: String(year), label, format: 'VHS', condition: 'good', status: 'in_collection' },
  thumb: null,
  source: 'scan',
  status: 'pending',
  fail_reason: null,
  created_at: new Date(Date.parse(NOW) - (i + 1) * 60e3).toISOString(),
}));

module.exports = { NOW, TAPES, REVIEW };
