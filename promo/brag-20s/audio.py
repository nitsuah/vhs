"""Synthesizes the 20s soundtrack for composition.html: python audio.py out.wav

A-minor synthwave bed at 120 BPM (bar 1 lands on the wordmark at 1.0s) with the
effects written into the same key and the same reverb, mixed under the music.
Event times mirror render(t) in composition.html — change one, change the other.
"""
import sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
DUR = 20.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
music = np.zeros((N, 2))
fx = np.zeros((N, 2))


def hz(m):  # midi → Hz
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a=0.005, d=0.2, s=0.0, r=0.05, hold=None):
    t = np.arange(n) / SR
    e = np.where(t < a, t / a, 1.0)
    dec = np.exp(-(t - a) / max(d, 1e-4)) * (1 - s) + s
    e = np.where(t >= a, dec, e)
    if hold is not None:
        rel = np.clip(1 - (t - hold) / r, 0, 1)
        e = np.where(t > hold, e * rel, e)
    return e


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def put(buf, t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * l * 1.414
    buf[i:i + len(sig), 1] += sig * r * 1.414


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    out = 0
    for d in (-detune, 0, detune):
        ph = (t * f * (1 + d)) % 1.0
        out = out + (2 * ph - 1)
    return out / 3


def tri(f, n):
    t = np.arange(n) / SR
    return 2 * np.abs(2 * ((t * f) % 1) - 1) - 1


def sine(f, n):
    return np.sin(2 * np.pi * f * np.arange(n) / SR)


# ── music ────────────────────────────────────────────
BPM = 120
B = 60 / BPM
T0 = 1.0                      # bar 1 downbeat = wordmark
CHORDS = [  # Am  F  C  G  — root midi + triad
    (45, [57, 60, 64]), (41, [57, 60, 65]), (48, [55, 60, 64]), (43, [55, 59, 62]),
]
END = 16.2                    # final chord hits with the outro wordmark

# pad swell under the VCR load (0 → 1.0)
n = int(1.2 * SR)
sw = sum(saw(hz(m), n, 0.004) for m in [57, 60, 64]) / 3
sw = lp(sw, 900) * np.linspace(0, 1, n) ** 2
put(music, 0.0, sw, 0.10)

bar = 0
t = T0
while t < END - 0.01:
    root, triad = CHORDS[bar % 4]
    blen = min(4 * B, END - t)
    n = int(blen * SR)
    pad = sum(saw(hz(m), n, 0.005) for m in triad) / 3
    pad = lp(pad, 1500) * env(n, 0.06, 3, 0.6, 0.25, hold=blen - 0.25)
    put(music, t, pad, 0.11, -0.25)
    put(music, t, pad, 0.11, 0.25)
    for k in range(8):                       # bass 8ths
        bt = t + k * B / 2
        if bt >= END:
            break
        m = root - 12 if k % 2 == 0 else root
        bn = int(B / 2 * SR)
        bs = lp(saw(hz(m), bn, 0.002), 520) * env(bn, 0.003, 0.18, 0.3, 0.03, hold=B / 2 - 0.03)
        put(music, bt, bs, 0.22)
    for k in range(4):                       # drums
        bt = t + k * B
        if bt >= END:
            break
        kn = int(0.35 * SR)
        kt = np.arange(kn) / SR
        kick = np.sin(2 * np.pi * (48 * kt + 90 * (1 - np.exp(-kt * 28)) / 28)) * np.exp(-kt * 9)
        if k in (0, 2):
            put(music, bt, kick, 0.42)
        else:
            sn = hp(rng.standard_normal(int(0.22 * SR)), 1200) * env(int(0.22 * SR), 0.001, 0.07)
            put(music, bt, sn + 0.4 * sine(hz(57), len(sn)) * env(len(sn), 0.001, 0.05), 0.10)
        for h in (0, 0.5):
            hn = int(0.05 * SR)
            hat = hp(rng.standard_normal(hn), 7000) * env(hn, 0.001, 0.015)
            put(music, bt + h * B, hat, 0.05 if h else 0.035, 0.3)
    # arpeggio sparkle from bar 3 on (the app is running)
    if bar >= 1:
        for k in range(8):
            at = t + k * B / 2
            if at >= END:
                break
            m = triad[k % 3] + 12 + (12 if k % 4 == 3 else 0)
            an = int(0.25 * SR)
            a = lp(tri(hz(m), an), 3500) * env(an, 0.002, 0.12)
            put(music, at, a, 0.045, -0.4 if k % 2 else 0.4)
    t += 4 * B
    bar += 1

# final chord: Am(add9) bloom, rings out under the outro
n = int(3.8 * SR)
fin = sum(saw(hz(m), n, 0.006) for m in [45, 57, 60, 64, 71]) / 5
fin = lp(fin, 1800) * env(n, 0.02, 1.4, 0.35, 1.6, hold=2.2)
put(music, END, fin, 0.20)
kn = int(0.6 * SR)
kt = np.arange(kn) / SR
boom = np.sin(2 * np.pi * (40 * kt + 70 * (1 - np.exp(-kt * 20)) / 20)) * np.exp(-kt * 5)
put(music, END, boom, 0.45)

# ── effects (A-minor pitches) ─────────────────────────
# VCR load: mechanical clunk + motor whir at 0.0
cn = int(0.25 * SR)
clunk = lp(rng.standard_normal(cn), 700) * env(cn, 0.001, 0.05) + sine(70, cn) * env(cn, 0.001, 0.08)
put(fx, 0.02, clunk, 0.55)
put(fx, 0.30, clunk * 0.6, 0.35)
wn = int(0.9 * SR)
whir = lp(rng.standard_normal(wn), 300) * np.hanning(wn) + 0.3 * saw(55, wn) * np.hanning(wn)
put(fx, 0.1, lp(whir, 400), 0.16)
# spines dropping onto the shelf: soft wooden taps, centre-out
order = [8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15, 0, 16]
for i in range(17):
    s = 0.05 + order.index(i) * 0.045 + 0.30
    tn = int(0.08 * SR)
    tap = lp(rng.standard_normal(tn), 1800) * env(tn, 0.001, 0.02)
    put(fx, s, tap, 0.07, (i - 8) / 10)

SNAPS = [4.45, 5.35, 6.25]
for s in SNAPS:                               # shutter
    sn = int(0.12 * SR)
    sh = hp(rng.standard_normal(sn), 2500) * env(sn, 0.001, 0.025)
    put(fx, s, sh, 0.22)
    put(fx, s + 0.045, sh * 0.6, 0.18)
    put(fx, s, sine(hz(69), int(0.3 * SR)) * env(int(0.3 * SR), 0.002, 0.08), 0.06)
    put(fx, s + 0.1, lp(rng.standard_normal(int(0.3 * SR)), 1200) * np.hanning(int(0.3 * SR)), 0.05, 0.4)  # thumb whoosh
# Enter → analyze chime (E5, A5)
for k, m in enumerate([76, 81]):
    cn = int(0.6 * SR)
    put(fx, 6.95 + k * 0.08, sine(hz(m), cn) * env(cn, 0.003, 0.25), 0.07)
# review cards landing: ascending A-minor pentatonic plucks
PENT = [69, 72, 74, 76, 79, 81, 84, 86]
for i in range(8):
    s = 7.95 + i * 0.17
    pn = int(0.35 * SR)
    p = lp(tri(hz(PENT[i]), pn) + 0.3 * sine(hz(PENT[i] + 12), pn), 4000) * env(pn, 0.002, 0.09)
    put(fx, s, p, 0.05, -0.3 + i * 0.08)
# ✓ All click + success arpeggio (A C E A)
put(fx, 10.30, hp(rng.standard_normal(int(0.03 * SR)), 3000) * env(int(0.03 * SR), 0.001, 0.008), 0.18)
for k, m in enumerate([69, 72, 76, 81]):
    cn = int(0.7 * SR)
    put(fx, 10.42 + k * 0.06, (sine(hz(m), cn) + 0.25 * sine(hz(m + 12), cn)) * env(cn, 0.003, 0.3), 0.07)
# table rows: tiny ticks, background
for i in range(10):
    tn = int(0.03 * SR)
    put(fx, 12.1 + i * 0.07, hp(rng.standard_normal(tn), 5000) * env(tn, 0.001, 0.006), 0.035)
# menu clicks
for s in (13.55, 14.30):
    tn = int(0.03 * SR)
    put(fx, s, hp(rng.standard_normal(tn), 3000) * env(tn, 0.001, 0.008), 0.16)
# wall stacking: soft clatter, thinning
for k in range(26):
    s = 15.45 + k * 0.03 + (k / 26) ** 2 * 0.4
    tn = int(0.06 * SR)
    put(fx, s, lp(rng.standard_normal(tn), 2200) * env(tn, 0.001, 0.015), 0.05 * (1 - k / 30), rng.uniform(-.7, .7))
# sticker pop (A5 blip)
pn = int(0.2 * SR)
pt = np.arange(pn) / SR
put(fx, 16.78, np.sin(2 * np.pi * hz(81) * pt * (1 + 0.6 * np.exp(-pt * 40))) * env(pn, 0.001, 0.06), 0.09)

# ── space + mix ───────────────────────────────────────
irn = int(1.6 * SR)
ir = rng.standard_normal((irn, 2)) * np.exp(-np.arange(irn) / SR * 3.2)[:, None]
ir[:, 0] = lp(ir[:, 0], 5000)
ir[:, 1] = lp(ir[:, 1], 5000)
ir /= np.sqrt((ir ** 2).sum(0))


def verb(x, wet):
    out = x.copy()
    for c in range(2):
        out[:, c] += wet * fftconvolve(x[:, c], ir[:, c])[:N]
    return out


mix = verb(music, 0.22) + verb(fx, 0.35)
mix[:, 0] = hp(mix[:, 0], 30)
mix[:, 1] = hp(mix[:, 1], 30)
mix *= 0.9 / np.max(np.abs(mix))
mix = np.tanh(mix * 1.4) / np.tanh(1.4)       # gentle glue
fade = np.ones(N)
fo = int(0.6 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 2
mix *= fade[:, None] * 0.89

from scipy.io import wavfile
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else 'brag.wav', SR, (mix * 32767).astype(np.int16))
