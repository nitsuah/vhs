# GitHub Copilot Instructions

This file provides custom instructions to GitHub Copilot when working in this repository.

## Project Context

**Project Name:** VHS Collection Indexer
**Description:** A personal tool to catalog a VHS tape collection. Browser app served by Express, backed by PostgreSQL (Neon), containerized with Docker. Optional Google OAuth for multi-user mode.
**Tech Stack:** Node.js / Express (backend), vanilla ES-module JavaScript (frontend), PostgreSQL (data), Docker (hosting), Jest (unit tests), Playwright (E2E tests)

---

## Architecture

```
src/server.js          ← Express entry point; mounts all routes and middleware
src/modules/
  auth.js              ← Google OAuth + JWT cookie auth
  config.js            ← env var reads (DATABASE_URL, JWT_SECRET, etc.)
  routes/tapes.js      ← REST CRUD for /api/tapes
public/                ← static browser app (ES modules, no build step)
  js/
    init.js            ← app bootstrap; calls initAuth() then loads tapes
    auth.js            ← auth chip, share panel, write-gate UI
    ui.js              ← tabs, keyboard shortcuts, hamburger drawer, modals
    db.js              ← fetch wrappers for /api/tapes
    inventory.js       ← renderInv(), filtering, sorting, wall view
    capture.js         ← camera, barcode scan, AI queue
    review.js          ← review card lifecycle
    utils.js           ← shared helpers (toast, dl, flashInvRow, escHtml)
    modules/           ← sub-modules (list-view, wall-view, detail-modal, etc.)
migrations/            ← SQL schema migrations (run on server startup)
tests/                 ← Jest unit tests
tests_playwright/      ← Playwright E2E specs
```

---

## Code Style & Conventions

- Keep it simple. This is a personal utility — no frameworks, no abstractions beyond what the task needs.
- Frontend is vanilla ES modules (`type="module"`). No build step, no bundler.
- Use `escHtml()` from `utils.js` for any user-derived value interpolated into innerHTML.
- The tape ID scheme (`VHS-XXXX`) is immutable. Once assigned, IDs never change.
- Auth is optional: `_authEnabled` tracks whether OAuth is configured; `_user` tracks the logged-in user. Single-user mode has no login wall.
- Write-action buttons (Add, Import) must be hidden when `_authEnabled && !_user`.

## Data Model

Each tape is one row in the PostgreSQL `tapes` table. Key fields:

- `id` — immutable, format `VHS-XXXX` (or a UPC barcode string)
- `status` — one of: `in_collection`, `for_sale`, `sold`, `donated`, `missing`, `wanted`
- `condition` — one of: `great`, `good`, `fair`, `poor`
- `owner_id` — Google `sub`; NULL in single-user mode
- `photos` — JSONB array of base64-encoded compressed images

## Key Principles

- PostgreSQL is the source of truth. `data/tapes.json` is a legacy empty placeholder.
- AI-assisted scanning (Ollama / Claude Vision) feeds data in; humans verify before confirming.
- Exports (CSV, JSON, print) are built into the web UI — no Python scripts needed.
- All HTML interpolation of inventory data must go through `escHtml()` / `esc()`.

## Closing tracked work

week-sotu and vigil read `docs/TASKS.md` from `main`, so an item left unmarked keeps showing as open work. A PR that finishes a tracked item closes it in the same PR, in this order:

1. Finish the code and tests.
2. Before the **last** push, update the docs in the same branch: mark the `docs/TASKS.md` item `- [x]` with a one-line `Done <date>: <what>` note (or record partial progress; to cite the PR number, open the PR as a draft first and add it in this commit). If the `docs/TASKS.md` footer says finished items are removed rather than ticked, remove it and condense it into `docs/CHANGELOG.md` / `docs/FEATURES.md` instead. Tick or condense the matching `docs/ROADMAP.md` line, add a `docs/CHANGELOG.md` Unreleased line, and fix `README.md` / `docs/FEATURES.md` if the change alters what they claim.
3. Commit and push, then open or update the PR. Say in its description which items it closes (the PR template has a slot for it).
4. **Pre-merge check**, next to CI and review threads: `git diff origin/main...HEAD --stat` must include the tracking docs whenever the PR completes a tracked item. If it doesn't, add the docs commit before merging. Never merge first and "follow up with a docs PR"; that's how stash#158/#159 and avatar#35 left finished work open (2026-09-30).

**A docs-only status PR changes status, nothing else.** When you do have to close items after the fact, touch only the lines for the items you cite (tick, `Done` note, PR link). Don't add, reword, reorder or delete other items, and don't regenerate the file from a template.
