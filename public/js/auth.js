// ── AUTH MODULE ────────────────────────────────────────────────────────────────
// Handles auth state, login/logout UI, and the share-collection panel.

let _user = null;
let _authEnabled = false;

export function getUser()       { return _user; }
export function isAuthEnabled() { return _authEnabled; }

// ── Bootstrap ──────────────────────────────────────────────────────────────────

export async function initAuth() {
  try {
    const res = await fetch('/auth/me');
    const data = await res.json();
    _user        = data.user   || null;
    _authEnabled = data.enabled || false;
  } catch {
    _user = null; _authEnabled = false;
  }
  renderAuthChip();
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderAuthChip() {
  const slots = [
    document.getElementById('auth-slot'),
    document.getElementById('auth-slot-mob'),
  ].filter(Boolean);
  if (!slots.length) return;

  if (!_authEnabled) { slots.forEach(s => { s.innerHTML = ''; }); return; }

  const html = _user
    ? `<div class="auth-chip">
        <img src="${escHtml(_user.picture || '')}" class="auth-avatar" referrerpolicy="no-referrer"
             onerror="this.style.display='none'" alt="">
        <span class="auth-name">${escHtml(_user.name || _user.email)}</span>
        <button class="hbtn auth-share-btn btn-share-open" title="Sharing settings">🔗 Share</button>
        <button class="hbtn auth-out-btn btn-signout" title="Sign out">↩ Sign out</button>
      </div>`
    : `<a href="/auth/google" class="hbtn auth-signin-btn">Sign in with Google</a>`;

  slots.forEach(s => { s.innerHTML = html; });
  document.querySelectorAll('.btn-share-open').forEach(el => el.addEventListener('click', openSharePanel));
  document.querySelectorAll('.btn-signout').forEach(el => el.addEventListener('click', signOut));

  // Show auth error from OAuth redirect if present
  if (new URLSearchParams(location.search).get('auth') === 'error') {
    import('./utils.js').then(({ toast }) => toast('Google sign-in failed. Please try again.', 'err', 5000));
    history.replaceState(null, '', location.pathname);
  }
}

async function signOut() {
  await fetch('/auth/logout', { method: 'POST' });
  location.reload();
}

// ── Share panel ────────────────────────────────────────────────────────────────

async function openSharePanel() {
  let shareData = { collection_public: false, share_slug: null };
  try {
    const r = await fetch('/api/auth/share');
    if (r.ok) shareData = await r.json();
  } catch {}

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.id = 'm-share';

  const shareUrl = shareData.share_slug
    ? `${location.origin}/c/${shareData.share_slug}`
    : null;

  backdrop.innerHTML = `
    <div class="modal" style="max-width:440px;gap:14px">
      <h2>Share Collection</h2>
      <p style="font-size:13px;color:var(--text2);line-height:1.55">
        When public, anyone with your link can view your collection — read-only, no account needed.
      </p>
      <label class="share-toggle-row" id="share-toggle-row">
        <span class="share-toggle-label">Make collection public</span>
        <span class="share-toggle-track" id="share-toggle-track" role="switch"
              aria-checked="${shareData.collection_public}"
              tabindex="0">
          <span class="share-toggle-thumb"></span>
        </span>
      </label>
      <div class="share-link-block" id="share-link-block" style="display:${shareData.collection_public && shareUrl ? 'flex' : 'none'}">
        <input class="share-link-input" id="share-link-input" readonly
               value="${escHtml(shareUrl || '')}" aria-label="Share URL">
        <button class="hbtn" id="btn-copy-link">Copy</button>
      </div>
      <div class="modal-acts">
        <button class="hbtn" id="btn-share-close">Done</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  // State
  let isPublic = shareData.collection_public;
  let slug     = shareData.share_slug;

  const track     = backdrop.querySelector('#share-toggle-track');
  const linkBlock = backdrop.querySelector('#share-link-block');
  const linkInput = backdrop.querySelector('#share-link-input');

  if (isPublic) track.classList.add('on');

  async function toggle() {
    isPublic = !isPublic;
    track.setAttribute('aria-checked', String(isPublic));
    track.classList.toggle('on', isPublic);
    track.classList.add('saving');
    try {
      const r = await fetch('/api/auth/share', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_public: isPublic }),
      });
      const data = await r.json();
      slug = data.share_slug || slug;
      const url = slug ? `${location.origin}/c/${slug}` : '';
      linkInput.value = url;
      linkBlock.style.display = (isPublic && url) ? 'flex' : 'none';
    } catch {
      // revert on failure
      isPublic = !isPublic;
      track.setAttribute('aria-checked', String(isPublic));
      track.classList.toggle('on', isPublic);
    }
    track.classList.remove('saving');
  }

  track.addEventListener('click', toggle);
  track.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });

  backdrop.querySelector('#btn-copy-link')?.addEventListener('click', () => {
    navigator.clipboard.writeText(linkInput.value).then(() => {
      const btn = backdrop.querySelector('#btn-copy-link');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 1800); }
    });
  });

  function close() { backdrop.remove(); }
  backdrop.querySelector('#btn-share-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
}

// ── Public share view ──────────────────────────────────────────────────────────
// Called by init.js when URL is /c/:slug — fetches and renders a read-only collection.

export async function loadPublicCollection(slug) {
  const app = document.getElementById('main');
  if (app) app.style.display = 'none';

  const header = document.getElementById('header');
  const authSlot = document.getElementById('auth-slot');

  let data;
  try {
    const r = await fetch(`/api/share/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error('not found');
    data = await r.json();
  } catch {
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:12px;color:var(--text2);font-size:14px">
        <div style="font-size:48px">📼</div>
        <div>Collection not found or set to private.</div>
        <a href="/" style="color:var(--accent);text-decoration:none;font-size:13px">← Back to VHS Box</a>
      </div>`;
    return;
  }

  // Swap header to read-only mode
  if (header) {
    header.innerHTML = `
      <h1 style="font-size:18px;white-space:nowrap">📼 VHS <span style="color:var(--text3);font-weight:400">Box</span></h1>
      <div style="font-size:13px;color:var(--text2);margin-left:8px">
        ${data.owner.avatar_url ? `<img src="${escHtml(data.owner.avatar_url)}" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:6px" referrerpolicy="no-referrer">` : ''}
        ${escHtml(data.owner.display_name || 'Shared collection')}
      </div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;color:var(--text2)">${data.tapes.length} tape${data.tapes.length !== 1 ? 's' : ''}</span>
        <span style="font-size:11px;color:var(--text3);background:var(--bg4);border:1px solid var(--border2);padding:4px 10px;border-radius:6px">READ ONLY</span>
      </div>`;
  }

  // Render tapes using existing inventory renderer in read-only mode
  const { renderPublicCollection } = await import('./inventory.js');
  if (typeof renderPublicCollection === 'function') {
    renderPublicCollection(data.tapes);
  } else {
    // Fallback: simple grid
    renderSimpleGrid(data.tapes);
  }
}

function renderSimpleGrid(tapes) {
  const container = document.createElement('div');
  container.style.cssText = 'padding:16px;overflow-y:auto;height:calc(100vh - 56px)';
  container.innerHTML = tapes.length === 0
    ? `<div style="text-align:center;padding:60px;color:var(--text2);font-size:14px">This collection is empty.</div>`
    : tapes.map(t => `
        <div style="display:flex;gap:10px;padding:10px;border-bottom:1px solid var(--border);align-items:center">
          ${t.photos?.[0] ? `<img src="${t.photos[0]}" style="width:48px;height:34px;object-fit:cover;border-radius:4px;flex-shrink:0">` : '<div style="width:48px;height:34px;background:var(--bg4);border-radius:4px;flex-shrink:0"></div>'}
          <div>
            <div style="font-size:14px;font-weight:600">${escHtml(t.title || 'Untitled')}</div>
            <div style="font-size:12px;color:var(--text2)">${escHtml([t.year, t.label, t.condition].filter(Boolean).join(' · '))}</div>
          </div>
          <div style="margin-left:auto;font-size:12px;color:var(--text2)">${escHtml(t.status || '')}</div>
        </div>`).join('');
  document.body.appendChild(container);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
