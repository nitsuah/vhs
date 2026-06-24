# Easter Eggs

Hidden interactions and references in VHS Box.

---

## Title-Triggered Effects

These activate when a tape's title matches a keyword — hover/long-press the card to trigger.

| Tape Title Matches | Effect |
|---|---|
| **Akira** | Plays the iconic *"Leave Me Alone"* stinger from the 1988 Kaneda/Tetsuo confrontation scene |
| **Jaws** | Plays the two-note Jaws theme that accelerates until it becomes a frenzy |
| **Ghostbusters** | Green slime flash on the card + classic spectral ding |
| **Night of the Living Dead**, **Zombie**, **Night of…** | Screen flicker effect + synthesized zombie groan |
| **Speed Racer**, **Fast and Furious** | Engine rev sound that climbs in pitch |

Effects fire on hover (desktop) or long-press (mobile), with a 5-second cooldown between plays.

---

## Long-Press: FBI Warning

Long-press (600ms) any tape card to trigger a full-screen **FBI anti-piracy warning** — styled like the real VHS screen printed from the 80s/90s, complete with CRT scanlines and vignette.

After 2.5 seconds it auto-transitions to an embedded YouTube trailer for the tape (if one can be found). Click anywhere to dismiss.

---

## Navigation: VHS Rewind Sound

Switching to the **Collect** tab plays a synthesized VHS rewind motor sound — the classic fast-forward whir of rewinding a tape.

---

## Load Screen: Be Kind, Rewind

On app load there is a **1-in-50 chance** of a retro VHS sticker toast appearing:
> 📼 Be Kind, Rewind!

---

## Milestone Confetti

Reaching **50, 100, or 200 tapes** in the collection triggers a confetti burst animation. Each milestone fires only once (tracked in `localStorage`).

---

## Matrix Scramble

When the detail edit modal opens on a tape whose title contains **Matrix**-adjacent keywords, the title field animates through katakana characters before resolving to the real title.

---

## Mobile: Shake to Static

On mobile, **shake the device** to briefly fill the screen with retro TV static noise (Web Audio + canvas).

---

## CRT Scanlines

Toggle **📺 CRT Scanlines** in the hamburger menu (☰) to overlay a repeating scanline pattern and vignette across the entire app — simulating an old CRT monitor.

---

## Collection Count: Akira Ding Trigger

Every confirmed tape scan plays the Akira audio sting. The sound is rate-limited to once every 5 seconds to prevent overlap.
