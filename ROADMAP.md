# ROADMAP

## Phase 1 — Capture

Goal: get every tape into tapes.json with a consistent ID and a title.
Photo protocol

Lay 8–12 tapes face-up in good light, labels visible
Shoot the photo — no cards, no numbering, no ceremony
Upload and let AI read what it can
Do a quick spot-check pass on the results, fix any misreads
Repeat

Good lighting and labels face-up is the only real requirement. Clear overhead shots in natural light work best.
AI scan script (scan.py)

Takes a photo path as input
Sends it to Claude Vision (via the Anthropic API) with a prompt like:

"This photo contains numbered VHS tapes. For each visible number, read the tape label and return JSON: [{id, title, label, year_if_visible}]"


Merges results into tapes.json, skipping IDs that already exist (immutability)

API options:

Claude (Anthropic) — best for messy/handwritten labels, good at context
OpenAI GPT-4o — comparable vision quality, slightly cheaper per image at scale
Recommendation: Start with Claude. You already have access, and it's better at "I think this says..." reasoning on worn tape labels.


Phase 2 — Valuation
Goal: attach a realistic price range to each tape.
eBay sold listings
The most reliable signal for VHS value is eBay "sold" listings, not asking prices.
Options:

Manual: search eBay, paste in estimated low/high, add source: "manual"
Semi-automated: valuate.py script that opens an eBay search for each unvalued tape title — you confirm the range
Automated (harder): scrape eBay sold listings via the official eBay Browse API (free, needs account) — returns recent sold prices you can average

Valuation tiers (rough guide)
ValueWhat it usually means$1–5Common mainstream releases, ex-rental$5–20OOP titles, cult films, certain genres$20–100Horror, SOV, anime, foreign, sealed$100+Rare SOV, cult horror, sealed big titles
Tags to flag for closer research: horror, SOV (shot-on-video), anime, foreign language, documentary, sealed/shrinkwrapped, small label (not Paramount/Warner/Disney)

Phase 3 — Use the data
Once the index exists, you can do anything with it:
Exports

export.py --format csv → open in Excel/Sheets for sorting/filtering
export.py --format html → shareable browsable page (no server needed, just open in browser)
export.py --format print → clean printable list sorted by ID

Sell workflow
Set status: "for_sale" on tapes you want to move. Export a filtered list:
bashpython scripts/export.py --status for_sale
That list becomes your eBay drafts or a Mercari batch upload.
Future ideas (don't build yet)

Simple web UI (a single index.html that reads tapes.json via fetch) — searchable, filterable, no backend
Photo thumbnails auto-cropped per tape (OpenCV or ImageMagick, crop each tape from batch photo)
Barcode scanning for tapes that still have UPC stickers (cross-reference ISRC/barcode databases)
Condition grading rubric (create a standard so anyone rating tapes uses the same scale)


Tech decisions
DecisionChoiceWhyData formattapes.jsonHuman-readable, git-diffable, no DB to installVersion controlGitFree history, easy backup, works on any machineAI visionClaude API (Anthropic)Best at messy/worn labels, good reasoningValuation dataeBay sold listingsMost accurate real-world pricing signalScriptingPythonWidely available, good JSON/HTTP librariesExportsCSV + HTMLWorks everywhere, no dependenciesHosting (if ever)GitHub PagesFree, serves static HTML directly from repo

Decisions made

Condition — track it, defaults to "great" since she keeps her stuff well. Notes field for anything specific.
Wishlist — skip it for now. She's in downsize mode, not acquisition mode.
Sold tapes — stay in the file. status field handles everything: in_collection, for_sale, sold, donated. No separate file needed.
Flat JSON vs SQLite — flat JSON is the right call. Collection is likely under 500, nothing sensitive, can live as a public GitHub repo. Simple is correct here.
