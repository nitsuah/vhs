# ROADMAP

## Phase 1 — Capture [COMPLETE]

**Goal:** get every tape into the database with a consistent ID and a title.

All Phase 1 goals shipped:

- PostgreSQL-backed tape registry with immutable `VHS-XXXX` IDs
- Barcode scanning — webcam-based with auto-confirm and staging flow
- AI photo scanning — batch upload, Ollama vision, accuracy checking
- Mobile UI — mobile-first layout, queue visualization, retry controls
- OMDb verification — AI scan results cross-checked against movie database
- StacksUp spine rotation enrichment
- Tabbed edit form and review queue
- Jest unit tests + Playwright E2E tests

---

## Phase 2 — Valuation

**Goal:** attach a realistic price range to each tape.

### eBay sold listings

The most reliable signal for VHS value is eBay "sold" listings, not asking prices.

Options:

- **Manual:** search eBay, paste in estimated low/high, add `source: "manual"`
- **In-app eBay search:** the ⚡ Fill button / 🔍 Lookup button already opens eBay comps for any tape
- **Automated (planned):** `valuate.py` script that scrapes eBay sold listings via the Browse API — returns recent sold prices you can average

### Valuation tiers (rough guide)

| Value | What it usually means |
| --- | --- |
| $1–5 | Common mainstream releases, ex-rental |
| $5–20 | OOP titles, cult films, certain genres |
| $20–100 | Horror, SOV, anime, foreign, sealed |
| $100+ | Rare SOV, cult horror, sealed big titles |

**Tags to flag for closer research:** horror, SOV (shot-on-video), anime, foreign language, documentary, sealed/shrinkwrapped, small label (not Paramount/Warner/Disney)

---

## Phase 3 — Use the data [PARTIAL]

Once the index exists, you can do anything with it.

### Exports [COMPLETE]

All export formats are built into the web UI (no scripts needed):

- **CSV export** — full collection; click "Export CSV" in the collect toolbar
- **For-sale CSV** — filtered `for_sale` export with eBay condition labels
- **JSON export/import** — full round-trip backup including photos
- **Print price tags** — 2.4" printable tags for `for_sale` tapes
- **Printable HTML list** — clean table sorted by ID

### Sharing [COMPLETE]

- **Public collection URL** — toggle a shareable `/c/<uuid>` link via the Share panel
- The public page is read-only; it shows the collection without any edit controls

### Sell workflow

Set status to `for_sale` on tapes you want to move. Export a for-sale CSV:

> Click "↓ CSV" → choose "For Sale" from the export menu.

That list becomes your eBay drafts or a Mercari batch upload.

### Future ideas (don't build yet)

- Photo thumbnails auto-cropped per tape (OpenCV or ImageMagick, crop each tape from batch photo)
- Condition grading rubric (create a standard so anyone rating tapes uses the same scale)
- **Sell queue export** — one-command workflow that auto-populates eBay/Mercari draft templates for each `for_sale` tape

---

## Tech decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Data format | PostgreSQL (Neon) | Handles concurrent writes, user-scoped queries, upserts cleanly |
| Version control | Git | Free history, easy backup, works on any machine |
| AI vision | Ollama (llava:7b) / Claude API | Good at messy/worn labels |
| Valuation data | eBay sold listings | Most accurate real-world pricing signal |
| Backend | Node.js / Express | Same language as the frontend; lightweight |
| Exports | Built into web UI | No dependency on Python; works on any device |
| Hosting | Docker + Express | Consistent environment, mobile HTTPS support |
| Auth | Google OAuth (optional) | Single-user by default; no login wall unless you want one |

## Other

- Refer to README.md for setup, data model, and running instructions.
- Refer to docs/TASKS.md for next steps and immediate action items.
- Refer to docs/FEATURES.md for shipped vs planned feature status.
- Use Docker for a consistent development environment (see Dockerfile and config/docker-compose.yml).
