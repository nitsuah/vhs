# GitHub Copilot Instructions

This file provides custom instructions to GitHub Copilot when working in this repository.

## Project Context

**Project Name:** vhs
**Description:** A lightweight personal tool to catalog a VHS tape collection — capturing title, condition, estimated value, and status as flat JSON in git. No server, no login, no cloud dependency.
**Tech Stack:** Python (scripts), JSON (data store)

---

## Code Style & Conventions

- Keep it simple. This is a personal utility — no frameworks, no abstractions beyond what the task needs.
- Scripts live in `scripts/` and should be runnable standalone with a `main()` guard.
- The data model in `data/tapes.json` is append-only. Never reassign IDs.
- Use `requests` for any HTTP calls (eBay lookups, etc.).
- Target Python 3.10+.

## Data Model

Each tape record in `data/tapes.json`:
- `id` — immutable, format `VHS-XXXX`
- `status` — one of: `in_collection`, `for_sale`, `sold`, `donated`, `missing`
- `condition` — one of: `great`, `good`, `fair`, `poor`
- `valuation.source` — typically `ebay_sold`

## Key Principles

- Flat files are the source of truth; never add a database layer.
- Scripts output JSON or CSV only — no interactive prompts.
- AI-assisted scanning (Claude Vision) feeds data in; humans verify before committing.
