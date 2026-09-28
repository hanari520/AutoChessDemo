"""Build the stage-electronic sound bank used by the game.

The clips are deterministic, locally synthesized from an AI-authored sound
design. No external service, model weights, or runtime download is required.
Run: python tools/generate_sound_bank.py
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "audio" / "v1"
RATE = 24000

MODE = {
    "heal": ("glass", .43), "team": ("glass", .50), "support": ("glass", .48),
    "guard": ("shield", .44), "guardLink": ("shield", .50), "teamShield": ("shield", .54),
    "single": ("pulse", .40), "chain": ("pulse", .56), "zone": ("air", .58),
    "field": ("air", .59), "chaos": ("glitch", .51), "burst": ("impact", .50),
    "dash": ("blade", .37), "dashCleave": ("blade", .46), "cleave": ("blade", .40),
    "combo": ("blade", .46), "passive": ("glass", .33),
}

# These motifs reflect the named skill, while the mode and stable per-unit seed
# set the material, pitch, rhythm, harmonics, and noise texture for every unit.
MOTIF = {
    "kouichi": (0, 7, 12), "yua": (0, -5, 7), "goutan": (0, 5, 7),
    "yujiu": (0, 7, 14), "suiji": (0, 7, 12, 16), "sishi": (0, 2, 5, 9),
    "sanli": (0, 3, 7), "xuezhu": (0, 12, 19), "nana7mi": (0, -5, -12),
    "miki": (0, 4, 12), "rei": (0, -7, -12), "azi": (0, 4, 7, 12),
    "rinco": (0, -12, 0), "mumu": (0, 5, 9), "liAn": (0, 7, 11),
}


def seed_of(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")


def envelope(t: np.ndarray, duration: float, attack: float, decay: float) -> np.ndarray:
    return np.minimum(1, t / max(.001, attack)) * np.exp(-np.maximum(0, t - attack) / max(.001, decay)) * np.clip((duration - t) / .035, 0, 1)


def note(freq: float, duration: float, kind: str, rng: np.random.Generator, glide: float = 0) -> np.ndarray:
    count = max(1, round(duration * RATE))
    t = np.arange(count) / RATE
    f = freq * (1 + glide * np.exp(-t * 18))
    phase = 2 * np.pi * np.cumsum(f) / RATE
    if kind == "glass":
        sound = np.sin(phase) + .30 * np.sin(2.01 * phase) + .12 * np.sin(3.97 * phase)
        env = envelope(t, duration, .006, duration * .31)
    elif kind == "shield":
        sound = np.sin(phase) + .22 * np.sin(1.5 * phase) + .17 * np.sin(2 * phase)
        env = envelope(t, duration, .018, duration * .50)
    elif kind == "blade":
        sound = .75 * np.sin(phase) + .26 * np.sin(2.3 * phase)
        env = envelope(t, duration, .004, duration * .22)
    elif kind == "glitch":
        sound = np.sin(phase + .7 * np.sin(phase * .27)) + .20 * np.sin(3.2 * phase)
        sound *= (np.sin(2 * np.pi * 23 * t) > -.35).astype(float)
        env = envelope(t, duration, .004, duration * .42)
    elif kind == "air":
        sound = np.sin(phase) + .20 * np.sin(2.03 * phase)
        env = envelope(t, duration, .035, duration * .57)
    else:
        sound = np.sin(phase) + .28 * np.sin(2 * phase) + .10 * np.sin(3 * phase)
        env = envelope(t, duration, .007, duration * .33)
    sound *= env
    if kind in ("blade", "impact", "air", "glitch"):
        noise = rng.standard_normal(count)
        # A cheap band-limited shimmer: differencing removes low rumble;
        # integration softens digital white noise before it reaches the mix.
        if kind == "air":
            noise = np.convolve(noise, np.ones(19) / 19, mode="same")
        else:
            noise = np.diff(np.r_[0, noise]) * .35
        sound += noise * envelope(t, duration, .003, duration * .17) * (.20 if kind == "blade" else .12)
    return sound


def finish(signal: np.ndarray) -> np.ndarray:
    signal = signal.astype(np.float64)
    signal -= signal.mean()
    tail = min(len(signal), round(RATE * .025))
    if tail:
        signal[-tail:] *= np.linspace(1, 0, tail)
    peak = np.max(np.abs(signal)) or 1
    return np.clip(signal * (0.72 / peak), -1, 1)


def write_clip(path: Path, signal: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = (finish(signal) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(samples.tobytes())


def render_skill(unit: dict) -> np.ndarray:
    ident = unit["id"]
    rng = np.random.default_rng(seed_of("skill:" + ident))
    kind, duration = MODE[unit["skillMode"]]
    base = 215 if kind in ("shield", "blade", "impact") else 390
    base *= 2 ** ((seed_of(ident) % 11 - 5) / 24)
    motif = MOTIF.get(ident)
    if motif is None:
        step = 2 + seed_of(ident + ":motif") % 5
        motif = (0, step, step + 5)
    total = np.zeros(round((duration + .10) * RATE))
    pace = duration * (.33 if len(motif) <= 3 else .24)
    for i, semitone in enumerate(motif):
        start = round(i * pace * RATE)
        length = min(len(total) - start, round((duration - i * pace + .035) * RATE))
        if length <= 0:
            continue
        freq = base * 2 ** (semitone / 12)
        voice = note(freq, length / RATE, kind, rng, glide=.16 if kind == "blade" else -.08 if kind == "shield" else .04)
        total[start:start + length] += voice * (.90 ** i)
    if kind in ("air", "shield"):
        delay = round(.085 * RATE)
        total[delay:] += .15 * total[:-delay]
    if ident == "nana7mi":
        t = np.arange(len(total)) / RATE
        total += .13 * np.sin(2 * np.pi * (92 * t + 42 * t * t)) * envelope(t, len(total) / RATE, .03, .28)
    if ident == "suiji":
        t = np.arange(len(total)) / RATE
        total += .09 * np.sin(2 * np.pi * 10 * t) * np.sin(2 * np.pi * 780 * t) * envelope(t, len(total) / RATE, .02, .30)
    return total


def parse_events() -> list[dict]:
    source = (ROOT / "index.html").read_text(encoding="utf-8")
    block = source.split("const SFX_DEF={", 1)[1].split("\n};", 1)[0]
    events = []
    for key, body in re.findall(r"^\s{2}(\w+):\{([^\n]+)", block, flags=re.M):
        freqs = re.search(r"f:\[([^]]*)\]", body)
        duration = re.search(r"dur:([\d.]+)", body)
        category = re.search(r"t:'(\w+)'", body)
        if not duration or not category:
            continue
        events.append({"key": key, "dur": float(duration.group(1)), "category": category.group(1),
                       "freqs": [float(x) for x in freqs.group(1).split(",")] if freqs else []})
    return events


def render_event(event: dict) -> np.ndarray:
    key = event["key"]
    rng = np.random.default_rng(seed_of("event:" + key))
    duration = event["dur"]
    kind = "glass" if event["category"] == "ui" or key.startswith("st") else "pulse"
    if key in ("slash", "impactBlade", "crit", "dodgeleaf", "deploy"):
        kind = "blade"
    elif key in ("shield", "stShouhu", "stGongzao"):
        kind = "shield"
    elif key in ("spellDark", "impactPoison", "rockcrack", "vampbite", "lose"):
        kind = "glitch"
    elif key in ("heal", "spellIce", "stXingji", "stHuayu", "stYizhe"):
        kind = "glass"
    elif key in ("spellFire", "impactWater", "splash", "zone", "horn"):
        kind = "air"
    freqs = event["freqs"] or [360 + seed_of(key) % 280]
    duration = max(.11, duration)
    total = np.zeros(round((duration + .07) * RATE))
    pace = duration / max(1, len(freqs))
    for i, freq in enumerate(freqs):
        start = round(i * pace * .72 * RATE)
        length = len(total) - start
        voice = note(freq, length / RATE, kind, rng, glide=.1 if kind in ("blade", "air") else -.025)
        total[start:start + length] += voice * (.88 ** i)
    return total


def main() -> None:
    units = json.loads((ROOT / "assets" / "skill_signature_manifest.json").read_text(encoding="utf-8"))["units"]
    events = parse_events()
    assert len(units) == 50 and len(events) >= 50
    for unit in units:
        write_clip(OUT / "skills" / f"{unit['id']}.wav", render_skill(unit))
    for event in events:
        write_clip(OUT / "events" / f"{event['key']}.wav", render_event(event))
    manifest = {"version": "stage-electronic-v1", "format": "PCM16 mono", "sampleRate": RATE,
                "method": "AI-authored deterministic local synthesis; no neural audio model",
                "skills": [u["id"] for u in units], "events": [e["key"] for e in events]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(units)} unit cues and {len(events)} system cues in {OUT}")


if __name__ == "__main__":
    main()
