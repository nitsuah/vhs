#!/usr/bin/env bash
# Renders the vertical short to promo/out/brag-20s-vert/, all in Docker:
#   promo/brag-20s-vert/build.sh            narration (if vo/ is missing), frames, audio, encode
#   promo/brag-20s-vert/build.sh tts        regenerate vo/*.wav and print each line's duration
#   promo/brag-20s-vert/build.sh stills 4.3 9.9 18.5   check frames before a full render
# Reads promo/brag-20s/ (locked) as source and never writes to it or to site/brag.*.
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="$(pwd -W 2>/dev/null || pwd)"
SPOT=brag-20s-vert
OUT=promo/out/$SPOT
PW=mcr.microsoft.com/playwright:v1.61.0-noble
FF=jrottenberg/ffmpeg:7.1-alpine@sha256:8ec1ee1f6a0fcd37c97725827b6b7832795c9596e3439b8da56d7700d61ae778
export MSYS_NO_PATHCONV=1
mkdir -p "$OUT"

tts_image() { docker build -q -t vhs-promo-tts "promo/$SPOT/tts" >/dev/null; }

narrate() {
  tts_image
  docker run --rm -v "$REPO/promo/$SPOT:/spot" -v vhs-promo-hf:/root/.cache vhs-promo-tts node -e '
const { execFileSync } = require("child_process");
const n = require("/spot/spot.json").narration;
require("fs").mkdirSync("/spot/vo", { recursive: true });
for (const l of n.lines) {
  execFileSync("hyperframes", ["tts", l.text, "--voice", n.voice, "--speed", String(n.speed ?? 1), "--output", `/spot/vo/${l.id}.wav`], { stdio: "ignore" });
  const b = require("fs").readFileSync(`/spot/vo/${l.id}.wav`);
  const sr = b.readUInt32LE(24), bps = b.readUInt32LE(28);
  let i = 12; while (b.toString("ascii", i, i + 4) !== "data") i += 8 + b.readUInt32LE(i + 4);
  console.log(l.id, "dur", (b.readUInt32LE(i + 4) / bps).toFixed(2), "-", l.text);
}'
  echo "Copy each dur into spot.json narration.lines[].dur"
}

capture() {
  docker run --rm -v "$REPO/promo:/promo:ro" -v "$REPO/$OUT:/out" -v vhs-promo-npm:/deps -w /deps $PW \
    bash -c "test -d node_modules/playwright || npm i --no-audit --no-fund playwright@1.61.0 >/dev/null; cp /promo/$SPOT/capture.mjs /deps/ && node capture.mjs /promo $*"
}

case "${1:-all}" in
  tts) narrate; exit ;;
  stills) shift; capture /out/stills "$@"; exit ;;
esac

[ -f "promo/$SPOT/vo/01.wav" ] || narrate
capture /out/frames all
# Frame 0 is the poster: the settled outro, like brag-20s.
POSTER=$(awk -F'[:,]' '/"poster"/{p=$2} /"fps"/{f=$2} END{printf "%04d", p*f+0.5}' "promo/$SPOT/spot.json")
cp "$OUT/frames/$POSTER.png" "$OUT/frames/0000.png"

tts_image
docker run --rm -v "$REPO/promo:/promo:ro" -v "$REPO/$OUT:/out" vhs-promo-tts bash -c \
  "/opt/kokoro/bin/python /promo/brag-20s/audio.py /out/music.wav && /opt/kokoro/bin/python /promo/$SPOT/tts/mix.py /promo/$SPOT/spot.json /promo/$SPOT/vo /out/music.wav /out/mix.wav"

docker run --rm -v "$REPO/$OUT:/o" -w /o $FF -y -loglevel error -framerate 30 -i frames/%04d.png -i mix.wav \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart -shortest $SPOT.mp4
docker run --rm -v "$REPO/$OUT:/o" -w /o $FF -y -loglevel error -i $SPOT.mp4 \
  -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart $SPOT-web.mp4
docker run --rm -v "$REPO/$OUT:/o" -w /o $FF -y -loglevel error -i frames/0000.png -q:v 3 $SPOT.jpg
ls -la "$OUT"/$SPOT*
