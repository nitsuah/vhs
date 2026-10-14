# Narration and soundtrack for the vertical short: Hyperframes' `tts` command
# (Kokoro-82M, local) needs a Python with kokoro-onnx next to Node; scipy is for
# ../brag-20s/audio.py and mix.py. Copied from nitsuah/vigil promo/tts.
#   docker build -t vhs-promo-tts promo/brag-20s-vert/tts
FROM node:22-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv espeak-ng && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/kokoro && /opt/kokoro/bin/pip install --no-cache-dir kokoro-onnx==0.4.9 soundfile==0.13.1 scipy==1.14.1
ENV HYPERFRAMES_PYTHON=/opt/kokoro/bin/python
RUN npm install -g hyperframes@0.8.142 && (hyperframes telemetry disable || true)
