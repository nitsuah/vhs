// ── Private/non-public address check (pure JS: no node:net, works on Workers) ──
'use strict';

function parseV4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every(n => n <= 255) ? o : null;
}

function isPrivateV4(o) {
  const [a, b] = o;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

// Returns 8 16-bit groups, or null if the text is not a valid IPv6 address.
function parseV6(s) {
  s = s.split('%')[0];
  if (!s.includes(':') || s.includes(':::')) return null;
  let tail = [];
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseV4(last);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part) => (part === '' ? [] : part.split(':'));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const all = [...head, ...rest];
  if (!all.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  let groups;
  if (halves.length === 2) {
    const fill = 8 - all.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill('0'), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const nums = groups.map(g => parseInt(g, 16));
  if (tail.length) { nums[6] = tail[0]; nums[7] = tail[1]; }
  return nums;
}

// True for any address that is not safely public, including anything unparseable.
function isPrivateAddress(addr) {
  const ip = String(addr || '').trim();
  const v4 = parseV4(ip);
  if (v4) return isPrivateV4(v4);
  const g = parseV6(ip);
  if (!g) return true;
  if (g.every(x => x === 0)) return true;                       // ::
  if (g.slice(0, 7).every(x => x === 0) && g[7] === 1) return true; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true;                  // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true;                  // fe80::/10
  const embedded = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  const zeros5 = g.slice(0, 5).every(x => x === 0);
  if (zeros5 && (g[5] === 0xffff || g[5] === 0)) return isPrivateV4(embedded); // ::ffff:v4, ::v4
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return isPrivateV4(embedded); // NAT64
  return false;
}

module.exports = { isPrivateAddress };
