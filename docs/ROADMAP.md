# ROADMAP

## Phase 1 — Capture [COMPLETE]

**Goal:** get every tape into `tapes.json` with a consistent ID and a title.

All Phase 1 goals shipped:

- VHS Shelf Scanner browser app (Docker/Nginx, port 8080/8443)
- Barcode scanning — webcam-based with auto-confirm and staging flow
- AI photo scanning — batch upload, Claude Vision, accuracy checking
- Mobile UI — mobile-first layout, queue visualization, retry controls
- OMDb verification — AI scan results cross-checked against movie database
- StacksUp spine rotation enrichment
- Tabbed edit form and review queue
- Test suite

---

## Phase 2 — Valuation

**Goal:** attach a realistic price range to each tape.

### eBay sold listings

The most reliable signal for VHS value is eBay "sold" listings, not asking prices.

Options:

- **Manual:** search eBay, paste in estimated low/high, add `source: "manual"`
- **Semi-automated:** `valuate.py` script that opens an eBay search for each unvalued tape title — you confirm the range
- **Automated (harder):** scrape eBay sold listings via the official eBay Browse API (free, needs account) — returns recent sold prices you can average

### Valuation tiers (rough guide)

| Value | What it usually means |
| --- | --- |
| $1–5 | Common mainstream releases, ex-rental |
| $5–20 | OOP titles, cult films, certain genres |
| $20–100 | Horror, SOV, anime, foreign, sealed |
| $100+ | Rare SOV, cult horror, sealed big titles |

**Tags to flag for closer research:** horror, SOV (shot-on-video), anime, foreign language, documentary, sealed/shrinkwrapped, small label (not Paramount/Warner/Disney)

---

## Phase 3 — Use the data

Once the index exists, you can do anything with it:

### Exports

- `export.py --format csv` → open in Excel/Sheets for sorting/filtering
- `export.py --format html` → shareable browsable page (no server needed, just open in browser)
- `export.py --format print` → clean printable list sorted by ID

### Sell workflow

Set `status: "for_sale"` on tapes you want to move. Export a filtered list:

```bash
python scripts/export.py --status for_sale
```

That list becomes your eBay drafts or a Mercari batch upload.

### Future ideas (don't build yet)

- Photo thumbnails auto-cropped per tape (OpenCV or ImageMagick, crop each tape from batch photo)
- Condition grading rubric (create a standard so anyone rating tapes uses the same scale)
- **Tape wall gallery view** — scrollable masonry grid of tape thumbnails (one photo minimum per tape)
- **Sell queue export** — one-command workflow that auto-populates eBay/Mercari draft templates for each `for_sale` tape

---

## Tech decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Data format | `tapes.json` | Human-readable, git-diffable, no DB to install |
| Version control | Git | Free history, easy backup, works on any machine |
| AI vision | Claude API (Anthropic) | Best at messy/worn labels, good reasoning |
| Valuation data | eBay sold listings | Most accurate real-world pricing signal |
| Scripting | Python | Widely available, good JSON/HTTP libraries |
| Exports | CSV + HTML | Works everywhere, no dependencies |
| Hosting | Docker/Nginx | Consistent environment, mobile HTTPS support |

## Other

- Refer to README.md for the data model and repo structure.
- Refer to docs/TASKS.md for next steps and immediate action items.
- Refer to docs/FEATURES.md for shipped vs planned feature status.
- Use Docker for a consistent development environment (see Dockerfile and docker-compose.yml).
