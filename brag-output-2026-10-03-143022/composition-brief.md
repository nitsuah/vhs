# Hyperframes Composition Brief: VHS Box

## Objective
Create a short launch-style brag video for VHS Box, a personal VHS collection cataloging
tool that scans barcodes and artwork with the camera and builds a collection view.

## Output
- Composition directory: `brag-output-2026-10-03-143022/composition/`
- Rendered video: `brag-output-2026-10-03-143022/brag.mp4`
- Format: landscape — 1280x720
- Duration: 18.0 seconds

## Source Material
- Project root: `C:\Users\ajhar\code\vhs`
- Primary files read: `public/index.html`, `public/css/app.css`,
  `public/js/modules/wall-view.js`, `public/js/ui.js`, `public/js/camera.js`,
  `public/js/capture.js`, `public/js/review.js`, `README.md`
- Product name: **VHS Box** (header is `VHS <span>Box</span>`)
- Tagline / strongest claim: from README — *"A personal tool to catalog a VHS collection —
  capturing what each tape is, what it might be worth, and building a record you can
  actually use (sell, store, share)."*
- Key UI moments to recreate:
  1. Capture panel with crop corner marks and the multi-spine preset (5 tape divisions)
  2. Capture queue + `Pending Review` with `Analyzing image N of 5…`
  3. Review cards with title / year / label / format / value metadata
  4. Barcode overlay — target box, sweeping scan line, corner marks
  5. **StacksUp wall** (`.wall`) — upright `.su` spines, full-height, no labels beneath, and
   **every spine carries its vertical title** — an unlabelled colour block reads as a swatch,
   not a tape
  6. View toggle: `📋 Table` → `📚 StacksUp`
- Copy that must appear verbatim:
  - `VHS Box`
  - `Capture` / `Review`
  - `Space to stage · Enter to analyze`
  - `Analyzing image 1 of 5…`
  - `Pending Review`
  - `Hold barcode in box · tap anywhere to snap`
  - `📚 StacksUp`
  - `N tapes`

## Creative Direction
- Tone preset: polished
- Creative direction: serious, elegant, confident restraint; the tape is the hero
- Interpretation: fewer simultaneous elements, long settled holds, slow crossfades, motion
  that is confident rather than busy. The final shot is allowed to simply sit. Nothing
  flashes, nothing bounces, nothing slams.
- Angle: the quiet, satisfying version of scanning — a shelf of tapes goes in, a wall of
  spines comes out. One continuous pass, not a feature tour. The camera never leaves the
  premise that the app exists because you have tapes and want to know what they are.
- Hook: a VHS cassette spine toward camera against the app's `#0a0a0a`, framed by the
  app's own crop corner marks, with a breathing red REC dot; `VHS Box` settles beneath.
- Outro / punchline: the completed StacksUp wall holds, wordmark over it, one flat line,
  silence. No CTA.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals, color washes, motion graphics
  - Unrelated visual redesign

## Art direction — read this first

**The shipped video at `site/brag.mp4` is the contract.** A render built from the
"Visual Identity" palette below was rejected outright by the user as looking nothing
like the reference. Do not treat this section as licence to redesign.

The reference is: a macOS browser window floating on black; a VCR HUD on every frame
(green `▶ PLAY`, white `SP 0:00:MM`, amber `◀◀ REW` during the rewind gag) with scanlines
and a vignette; a bold ~35px headline on every UI scene with the payoff phrase in red;
**full-colour** VHS spines with coloured label bands, `VL-###` ids and vertical titles; an
orange dashed crop box; a 440px `Pending Review` panel; a Table view with green values; a
blurred bookshelf strip along the bottom; and a gold `Be Kind, Rewind!` badge under the
`VHS`/`Box` wordmark in the outro. Full detail is in `brag-plan.md` under
"Reference art direction".

**The FBI warning is removed as one scene. The retro-VHS register stays** — scanlines,
vignette, HUD, and the rewind gag are all part of the reference's identity.

## Visual Identity (superseded — kept for contrast only)
- Background: `#0a0a0a`; panels `#1a1a1a`; raised `#222`; borders `#2a2a2a` / `#333`
- Text: `#e8e8e8`; secondary `#999`; tertiary `#555`
- Accent: `#e84040`, hover/bright `#ff6060`
- Display font: `'Segoe UI', system-ui, sans-serif` (the app's own UI face — use it)
- Data font: `'Courier New', monospace` for barcodes, values, IDs (the app's table face)
- Visual references from the project: `.wall` StacksUp grid, `.su` spines, `#crop`
  corner marks, barcode overlay box + scan line, header tab row, `✓ All` button

**Contrast note:** the app's `--text3:#555` on `--bg:#0a0a0a` fails WCAG. Use `--text2:#999`
or lighter for anything that must be read. `check` gates on contrast — fix any failures it
reports rather than accepting them.

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract.

Scene summary (durations are the composition's real `data-start`/`data-duration` values):
1. **Hook: the tape** — 2.4s — VHS cassette spine, crop corner marks over it, breathing
   red REC dot, `VHS Box` wordmark settles beneath. No headline.
2. **Capture: the shelf** — 2.4s — stacks of VHS on a shelf under the app chrome, orange
   dashed crop box across five spines, `Pending Review` empty (`Queue empty — stage a shot
   to begin`). *"Snap the shelf. **Five spines a shot.**"*
3. **Batch: five at once** — 2.8s — snapshots of those five spines fill the `Capture Queue`
   strip one at a time; `Analyzing image 1 of 5…` counts up. **Sequential: 5 arrivals.**
4. **Review: the title comes out** — 2.4s — the AI reads each spine and pulls its title into
   the Collection table; `10 tapes` → `15 tapes`; `✓ All` confirms.
   **Sequential: 5 titles + confirm.**
5. **Single tape: the barcode** — 3.4s — one loose tape to the barcode overlay, hint copy,
   one scan-line sweep, code `0 26508 39175 4` resolves, `Scanned` record fills.
   **One held interaction.**
6. **Collection: the table** — 1.33s — the full Table view with its filter row and green
   values. *"An ID, a condition, **a price.**"* — *the record the earlier scenes wrote.*
7. **StacksUp + outro** — 3.27s — `📚 StacksUp`; the wall fills with `.su` spines on a
   `22 × 3` grid; badge `11 tapes` → `66 tapes`; wordmark centers over the completed wall.
   **Sequential: wall fills.** — *this is the payoff, give it the most generous hold.*

## Audio
- Audio role: sparse professional accents — a quiet bed that supports, never announces
- Audio arc: quiet bed under everything; one crisp confirm at the barcode snap; the bed's
  most open moment under the StacksUp reveal; then a 1.2s fade from 16.8s so the final
  wordmark lands in near-silence.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM)
- Music treatment: fade in 0.5s from 0.0s, volume 0.35, fade out 1.2s from 16.8s.
- Music cue guidance: bundled preset already copied to
  `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  (tempo 109.96). Strong cues in window: 8.74, 9.29, 10.93, 12.55, 13.64, 15.84.
  Beat grid (0.55s spacing): 4.91, 5.34, 6.00, 6.56, 7.09, 7.64, 8.19, 8.74, 14.20, 14.73, 15.29.
- Audio-reactive treatment: subtle — RMS/bass makes the StacksUp wall border glow breathe
  and the wordmark's red accent swell slightly. No waveform or equalizer visuals; nothing
  scales text.
- Audio-coupled moments:
  - Batch of five staged frames arriving one at a time — light per-item drop sounds
  - Barcode snap — a single crisp confirm at the exact moment the code resolves
  - StacksUp wall filling — one soft place-sound per tape joining, thinning toward the end
  - `✓ All` confirm — click at the moment it registers
- SFX selection guidance: sparse and motion-matched. Card sounds for the review cards and
  wall spines, soft drops for staged frames, a crisp confirm for the barcode snap. Align
  SFX **start** with the first visible frame of the element it belongs to.
- SFX analysis guidance: `sfx-analysis.md/json` shipped with the brag skill; use the lower
  high-frequency-risk sounds for these repeated, polished moments.
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume
  based on the implemented animation. Candidates are already staged under `assets/sfx/`.
- Audio files: music is at `assets/music/`, cue presets at `assets/music/cues/`, SFX
  candidates under `assets/sfx/`. Reuse only these; don't reference the skill directory.

## Hyperframes Instructions

Implement the composition in this directory following the current Hyperframes workflow
(`hyperframes-core`, `-animation`, `-creative`, `-keyframes`, `-cli` skills).

### Spine rendering rules (learned by rendering — do not regress)
- **Every spine carries its title.** Unlabelled colour blocks were rejected as "less distinct."
- **Never index a palette by a divisor of the grid width.** 66 spines on a 22-wide grid means
  `i % 22` repeats down every column. Use a 29-entry palette indexed by `WPAL.length`.
- **Local contrast, kept small and weak.** A per-spine radial at `--hx/--hy/--hs`, ~30% radius
  and 0.30 alpha. A wide soft radial bleaches the palette into airbrushed spheres.
- **Key-light goes in `::before`.** It is the first child in the box tree and paints behind the
  title; `::after` paints on top and would wash the text out.
- **Label ink from WCAG luminance** (`lum()`/`ink()`), not a hardcoded colour list — `check`
  gates on contrast.
- **Shrink long titles to fit** (`fs = min(9.5, 100/(t.length*0.62))`), never clip a name.

Requirements:
- Show real UI: the app's capture panel, review cards, barcode overlay, and StacksUp wall
  must be recognizably the product, built from its real palette, type, and component shapes.
- Keep all text readable — see the contrast note above.
- Total duration exactly 18.0s.
- Include the planned music bed and SFX layer.
- Treat audio notes as guidance, not a fixed cue sheet. Choose SFX after the animation exists.
- Beat-lock guidance: barcode snap → 12.55s, StacksUp reveal → 13.64s, outro wordmark →
  15.84s (within ±0.15s). Sequential arrivals snap to the listed beat grid (±0.10s).
- Mark beat locks in the composition as `// beat-locked: <time>` and sequential snapping
  as `// beat-grid: ...` so the choices are legible.
- Music on one low track index; every overlapping SFX on its own ascending track index.
- Use local assets only.
- Run `npx hyperframes check` before render — fix every error, including contrast.