# Brag Plan: VHS Box

## What is this app?
A personal tool to catalog a VHS collection — you point your webcam at a tape (or a whole
stack of spines), and the app reads the barcode or the artwork, fills in the title, year,
label, and value, and files it into a collection you can sort, sell from, and look at.

## The angle
The video is the quiet, satisfying version of scanning: not a feature tour, but one
continuous pass — a shelf of tapes goes in, a shelf of spines comes out. The camera never
leaves the premise that this app exists for a reason: you have tapes, and you want to know
what they are. Restraint carries the claim. Nothing shouts; the wall filling up at the end
is the payoff, and the video lets it land in silence.

## Hook (first 2-3 seconds)
A VHS cassette fills the frame, spine toward camera, in the dark UI palette — a red REC dot
breathing in the corner. The wordmark settles in beneath it. No list of features, no
"streamline your workflow." One object, held long enough to feel like an object.

## Key moments (the middle)
- A five-tape multi-spine capture is staged in one frame, then analyzed as a queue —
  "Analyzing image 1 of 5…"
- One loose tape, held to the barcode overlay, resolves into a real record with no typing
- The collection view flips from a flat table to **StacksUp** — upright spines, like books
  on a shelf — and the day's scans join the rest

## Outro / punchline
The stack-up holds. Wordmark and a single flat line. No CTA flourish, no exclamation.

## User flow worth showing
1. **Capture** — camera live, crop preset on multi-spine (5 tapes), Space to stage.
2. **Analyze** — the queue resolves, "Analyzing image 1 of 5…", review cards populate.
3. **Single tape** — barcode mode, "Hold barcode in box · tap anywhere to snap", the code
   resolves and the title fills itself in.
4. **Collect** — switch Table → "📚 StacksUp", the wall fills with the new tapes.

## Tone
- Preset: polished
- Creative direction: serious, elegant, confident restraint; the tape is the hero
- Interpretation: fewer scenes than beats, long settled holds, slow crossfades, motion that
  is confident rather than busy; the last shot is allowed to simply sit.

## Format: landscape — 1280x720
## Duration: 18.0 seconds

> **Corrected 2026-10-04.** The first render was rebuilt from this plan and diverged
> sharply from the shipped `site/brag.mp4` reference — the user rejected it. The plan's
> "Visual identity (from the project)" section below is *not* the video's art direction.
> The reference video governs. See "Reference art direction" further down; the original
> section is retained only to record what was superseded.

## Visual identity (from the project)
- Background: `#0a0a0a` (panels `#1a1a1a`, borders `#2a2a2a`)
- Accent: `#e84040` (hover/bright `#ff6060`)
- Text: `#e8e8e8` (secondary `#999`, tertiary `#555`)
- Display font: `'Segoe UI', system-ui, sans-serif` (the app's own UI face)
- Data/mono font: `'Courier New', monospace` (the app's table face — used for barcodes, IDs, values)
- Strongest visual element: the **StacksUp wall** (`.wall` of `.su` spines) — this is the
  image the whole video builds to.

## Copy that must appear verbatim
- `VHS Box`
- `Analyzing image 1 of 5…`
- `Hold barcode in box · tap anywhere to snap`
- `📚 StacksUp`
- `N tapes`

## Share copy (draft)
VHS Box — point your camera at a shelf or a single tape, and it fills in the title,
year, label, and value. Five spines a shot. One barcode for the loose one.
Then the wall stacks up.

---

## Reference art direction (governs — read this before touching the composition)

The shipped video at `site/brag.mp4` is the visual contract. It was authored in an
earlier session and its source HTML was never committed, so these notes are the only
record of it. **Match this register; do not redesign from the app's own CSS palette.**

Frame: `1280×720`, 18–20s, ~20fps. macOS browser window floating on black — traffic-light
dots, a dark URL bar reading `nitsuah.github.io/vhs`, rounded corners, heavy drop shadow.

A VCR HUD is present on **every** frame, outside the scene system:
- green `▶ PLAY` top-left
- white mono `SP 0:00:MM` top-right, counting forward
- amber `◀◀ REW` top-left, appearing only during the rewind gag, with the counter running
  *backwards*
- CRT scanlines and a vignette over the whole frame

Every UI scene carries a bold headline (~35px, weight 800) across the top, with the payoff
phrase in red. Five headlines, one per UI scene, in order: *"Snap the shelf. **Five spines a
shot.**"* · *"Five spines. **Five into the queue.**"* · *"The AI reads each spine. **Title
pulled out.**"* · *"One loose tape. **One barcode.**"* · *"An ID, a condition, **a price.**"*
Scenes 1 and 7 carry no headline — the hook and the outro are wordmark only.

Spines are drawn in **full colour**, not tinted app-chrome: a coloured top label band with a
short code, a `VL-###` id, the vertical title in a contrasting colour, and a `VHS` logo at the
bottom. Titles used: SPEED RACER, NIGHT OF THE LIVING DEAD, THE TERMINATOR, LABYRINTH,
PREDATOR, BEETLEJUICE, TRON, ALIENS, ROBOCOP, THE GOONIES, GREMLINS, AKIRA, JAWS,
GHOSTBUSTERS.

Chrome details: an orange dashed crop box with an orange handle around the 5 selected
spines, red crop corner marks, a right panel headed `Pending Review` in yellow (its empty
state reads `Queue empty — stage a shot to begin` under a green `Camera live` dot) that
becomes `Capture Queue` with a `qstrip` of staged frames and an `Analyzing image N of 5…`
counter, and a Collection table headed only `Title` with green ID / condition / price values
generated in JS, plus a full Table view with a filter row (🔍 Search, Newest ▾, + Add,
+ Import, + Export) and a blurred colourful bookshelf strip along the bottom edge.

Outro: the StacksUp wall behind a gold rounded badge with a VHS icon reading
`Be Kind, Rewind!` beneath the `VHS`/`Box` wordmark (red + grey, huge, thin white sans), with
`github.com/nitsuah/vhs` in white mono.

The wall itself follows the shipped app's StacksUp screenshot, not a card grid: a dense
edge-to-edge `22 × 3` grid (66 cards) of full-height narrow spines, 2–4px gutters, no outer
padding, no card chrome, no labels beneath — full-bleed spine artwork with coloured label
bands, `VL-###` ids, rotated vertical titles, and the occasional white UPC sticker.

### Spine rules — hard-won, do not regress

**Every spine carries its name.** An unlabelled colour block reads as a swatch, not a tape.
This applies to the scene-2 shelf spines too, not just the scene-7 wall — the user called the
unlabelled version "less distinct," and the five selected shelf spines are the very titles
scene 4 pulls into the table.

**Never index a palette by a divisor of the grid width.** The wall is 66 spines on a 22-wide
grid, so `i % 22` — and anything similarly periodic — makes spines `i`, `i+22`, `i+44` share
a base colour and the wall visibly repeats down each column. Being coprime with the grid width
prevents along-row repeats and *causes* down-column aliasing. The fix is a 29-entry `WPAL`
indexed by `WPAL.length`, since 29 shares no factor with 22 or 44.

**Give each spine local contrast.** A smooth 2-stop gradient has none, so spines read as flat
fills; real sleeve art has a bright focal point. A per-spine radial at `--hx/--hy/--hs`
supplies it — but keep it **small and weak** (30% radius, 0.30 white core). A wide soft radial
(46–80%, 0.42 core) turns every spine into an airbrushed sphere and bleaches the palette.

**Put the key-light in `::before`, never `::after`.** `::before` is the *first* child in the
box tree and paints behind real element children; `::after` is the last and paints on top. A
white radial in `::after` washes out the title text on every spine.

**Derive label ink from relative luminance, not a colour list.** Test the actual palette entry
against WCAG luminance (`lum()` → `ink()`) and pick dark-on-light or cream-on-dark. Checking
`in('#fff','#f2f2f2')` is dead code when none of those are in the palette, and `check` gates on
contrast.

**Scale long titles down, never clip them.** `.su-tt` is `vertical-rl` with
`white-space:nowrap; overflow:hidden`; fit with `fs = min(9.5, 100/(t.length * 0.62))`. At that
size a title can *look* mangled in a downscaled screenshot ("IS" reads as "AS") while rendering
correctly — check the fit budget before "fixing" it.

**The FBI warning sequence is cut as a single scene, not as a style ban.** Retro-VHS
gimmicks — scanlines, vignette, the HUD, the rewind gag — stay.

## Audio direction
- Role: sparse professional accents — a quiet bed that supports, never announces
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM, 1:57)
- Music treatment: start at 0.0s from the track's natural top, fade in 0.5s; sits low
  (0.35) under the whole piece; 1.2s fade-out from 16.8s so the last wordmark lands in
  near-silence; the reveal at 13.64s gets the bed's most open moment.
- Music cue guidance: preset read —
  `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  (tempo 109.96). Strong cues in window: 8.74, 9.29, 10.93, 12.55, 13.64, 15.84.
  Beat grid ≈ 0.55s spacing (0.56, 1.09, 1.64, 2.19, 2.73, 3.27, 3.82, 4.39, 4.91, 5.34,
  6.00, 6.56, 7.09, 7.64, 8.19, 8.74, 9.29, 9.83, 10.37, 10.93, 11.46, 12.02, 12.55,
  13.11, 13.64, 14.20, 14.73, 15.29, 15.84, 16.38, 16.93, 17.47, 18.02).
- Audio-reactive treatment: subtle — RMS/bass makes the StacksUp wall's border glow breathe
  and the wordmark's red accent swell slightly. No waveform, no equalizer bars, nothing that
  scales text.
- SFX posture: sparse and motion-matched; one soft cue per real event (thumbnail lands,
  card lands, barcode snap, stack grows), nothing on transitions that already have music.
- Audio-coupled moments:
  - Batch of five staged frames arriving one at a time — light per-item drop sounds
  - Barcode snap — a single crisp confirm at the exact moment the code resolves
  - StacksUp wall filling — one soft place-sound per tape joining, thinning toward the end
- Restraint rule: no sting, no riser, no impact hit on the final logo. The outro is music
  fading out and then silence.

## Storyboard

### Scene 1 — Hook: the tape — 2.4s
A VHS cassette, spine toward camera, fills the frame against `#0a0a0a`. The app's crop
corner marks (`#crop` tl/tr/bl/br) sit over it, so it reads as "inside the app," not as a
product photo. A red REC dot breathes once. `VHS Box` wordmark settles beneath, small,
generous letter-spacing. No headline.
Sequential/interaction: none — one held object.
Audio intent: near-silence, just the bed fading up. Establishes weight.
Audio-coupled idea: the crop marks settle with the frame; no typing here.
Music: vol-12, fade-in 0.5s at 0.0s.
Transition mood: soft → Scene 2.

### Scene 2 — Capture: the shelf — 2.4s
A stack of VHS tapes **on a shelf** is what the camera sees — spines edge-on, stacked in
rows, exactly the mess this app exists to catalog. The app chrome is around it: header,
tab row (`Capture` active), and an orange dashed crop box drawn across five adjacent spines
with an orange handle. Headline: *"Snap the shelf. **Five spines a shot.**"* The right panel
is headed `Pending Review` and is empty — `Queue empty — stage a shot to begin` under a
green `Camera live` dot.
Sequential/interaction: none — one held framing, the five-spine preset already staged.
Audio intent: a quiet UI confirm that the app is live.
Audio-coupled idea: none; the reveal carries it.
Music: continues underneath at 0.35.
Transition mood: soft → Scene 3.

### Scene 3 — Batch: five at once — 2.8s
The shelf shot becomes five staged frames: the queue fills with a `qstrip` of snapshots of
those five spines, arriving one at a time. The header changes to `Capture Queue` and the
status line counts up — `Analyzing image 1 of 5…` through `5 of 5…`. Headline: *"Five
spines. **Five into the queue.**"*
Sequential/interaction: **yes** — 5 staged frames appear one at a time, in order, each
with a soft per-item drop sound.
Audio intent: steady, workmanlike progress — the sound of a job running.
Audio-coupled idea: beat-grid the five arrivals — 4.91, 5.34, 6.00, 6.56, 7.09.
Music: continues; this is the section's rhythmic spine.
Transition mood: soft → Scene 4.

### Scene 4 — Review: the AI pulls the title out — 2.4s
The queue is still (`qstrip still`) and the counter is on its last image — `Reading image 5
of 5…`. As each spine is read, **its title is pulled out of the image and into the
Collection table below**, rows landing one by one. The count badge counts up from
`10 tapes` to `15 tapes` as the five titles join. `✓ All` confirms. Headline: *"The AI
reads each spine. **Title pulled out.**"*
Sequential/interaction: **yes** — 5 titles arrive one by one, each paired with its spine
being read, then the `✓ All` confirm lands.
Audio intent: quiet satisfaction — the click of something finishing.
Audio-coupled idea: each title lands on the beat it is read; confirm click at the moment it
registers.
Music: continues.
Transition mood: soft → Scene 5.

### Scene 5 — Single tape: the barcode — 3.4s
One loose tape, held to the barcode overlay. The target box, scan line, and corner marks
frame the spine; the hint reads `Hold barcode in box · tap anywhere to snap`. The scan line
sweeps once. The code resolves — the mono digits `0 26508 39175 4` appear — and the right
panel's `Scanned` record fills in. No typing, no manual entry. Headline: *"One loose tape.
**One barcode.**"*
Sequential/interaction: **yes** — one interaction, held: the barcode resolves and the
fields fill.
Audio intent: the single crisp moment of the video — a clean confirm, then back to quiet.
Audio-coupled idea: **beat-locked: 12.55s** — the snap lands on that strong cue.
Music: continues; the bed opens slightly for this beat.
Transition mood: soft → Scene 6.

### Scene 6 — Collection: the table — 1.33s
The full Table view, briefly but completely legible: header tabs `📷 Capture` / `📋 Review`
/ `📋 11 tapes`, the filter row (`🔍 Search…`, `Newest ▾`, `+ Add`, `+ Import`,
`+ Export`), and the catalogued tapes in rows with their values in green. Headline: *"An ID,
a condition, **a price.**"* This is the record the previous scenes just wrote.
Sequential/interaction: none — one held read.
Audio intent: the beat where the work turns out to be real data, not a demo.
Audio-coupled idea: none; the hold carries it.
Music: continues.
Transition mood: soft → Scene 7.

### Scene 7 — StacksUp + outro — 3.27s
The payoff, and the longest hold in the video. The view flips to `📚 StacksUp` and the wall
fills with upright spines — the app's actual StacksUp look: `.wall` holding 66 `.su` cards
on a `22 × 3` grid, full-height narrow spines with no card chrome and no labels beneath.
The count badge animates `11 tapes` → `66 tapes`. As the wall completes, the `VHS Box`
wordmark centers over it with the gold `Be Kind, Rewind!` badge and `github.com/nitsuah/vhs`
beneath. One flat line. No CTA, no button.
Sequential/interaction: **yes** — the wall fills, spines joining one at a time as the view
settles, then the wordmark resolves over the completed wall.
Audio intent: arrival. The music fades out and leaves silence; nothing lands on top of it.
Audio-coupled idea: **beat-locked: 15.84s** — the wordmark resolves on that cue; the new
spines join on 14.20, 14.73, 15.29, thinning out as the shelf completes.
Music: bed at its most open during the fill; fade-out from 16.8s over 1.2s, ending in
silence.

**Music mood for this video:** polished, restrained, mid-energy bed under a quiet film.
**Audio summary:** a low, unobtrusive bed carries all 18 seconds; four sparse cues land on
the real product events (a tap, a card placed, a barcode snapped, the wall filling), and the
last two seconds are left deliberately empty.

---

**Duration check:** 2.4 + 2.4 + 2.8 + 2.4 + 3.4 + 1.33 + 3.27 = **18.0s** ✅ (15–25s)

**Reading-time check:** every line settles well above the floor — `VHS Box` holds ~2.0s,
`Analyzing image 1 of 5…` advances across its 2.8s scene, the barcode hint holds ~2.0s, and
the final wordmark holds the back half of the 3.27s payoff. Scene 6 is the shortest at
1.33s, but it is a single headline plus a table, not prose.