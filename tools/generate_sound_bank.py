"""Build the dream-magic + animated-orchestral sound bank used by the game.

The clips are deterministic, locally synthesized from the selected sound design.
No external service, model weights, or runtime download is required.
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
OUT = ROOT / "assets" / "audio" / "v2"
RATE = 24000

MODE = {
    "heal": ("celesta", .43), "team": ("harp", .50), "support": ("celesta", .48),
    "guard": ("ensemble", .44), "guardLink": ("strings", .50), "teamShield": ("ensemble", .54),
    "single": ("strings", .40), "chain": ("harp", .56), "zone": ("sweep", .58),
    "field": ("ensemble", .59), "chaos": ("arcane", .51), "burst": ("impact", .50),
    "dash": ("pizzicato", .37), "dashCleave": ("strings", .46), "cleave": ("pizzicato", .40),
    "combo": ("harp", .46), "passive": ("celesta", .33),
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


def bowed_strings(freq: float, duration: float, rng: np.random.Generator, glide: float = 0) -> np.ndarray:
    count = max(1, round(duration * RATE))
    t = np.arange(count) / RATE
    sound = np.zeros(count)
    for detune, weight, vibrato in ((-.0028, .30, 0.0), (0, .40, .0015), (.0028, .30, .0019)):
        f = freq * (1 + glide * np.exp(-t * 18) + detune + vibrato * np.sin(2 * np.pi * 5.1 * t + weight * 8))
        phase = 2 * np.pi * np.cumsum(f) / RATE
        voice = sum(amp * np.sin(harmonic * phase) for harmonic, amp in ((1, 1), (2, .40), (3, .20), (4, .09)))
        sound += voice * weight
    attack = np.clip(t / .032, 0, 1)
    release = np.clip((duration - t) / .055, 0, 1)
    return sound * attack * release * (.90 + .10 * np.exp(-t / max(.08, duration)))


def celesta(freq: float, duration: float) -> np.ndarray:
    t = np.arange(max(1, round(duration * RATE))) / RATE
    return sum(amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / max(.018, duration * decay))
               for ratio, amp, decay in ((1.0, .58, .50), (2.01, .27, .24), (3.94, .12, .12), (6.72, .055, .075), (9.21, .025, .048)))


def plucked_harp(freq: float, duration: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(max(1, round(duration * RATE))) / RATE
    sound = sum(amp * np.sin(2 * np.pi * freq * harmonic * t + .08 * harmonic) * np.exp(-t / decay)
                for harmonic, amp, decay in ((1, .64, duration * .64), (2, .27, duration * .34), (3, .14, duration * .20), (4, .075, duration * .13), (6, .035, duration * .08)))
    pick = np.diff(np.r_[0, rng.standard_normal(len(t))])
    return sound + pick * envelope(t, duration, .001, .018) * .018


def timpani(freq: float, duration: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(max(1, round(duration * RATE))) / RATE
    phase = 2 * np.pi * np.cumsum(freq * (.55 + .45 * np.exp(-t * 9))) / RATE
    body = np.sin(phase) + .20 * np.sin(2 * phase) + .075 * np.sin(3 * phase)
    thump = np.diff(np.r_[0, rng.standard_normal(len(t))])
    return body * envelope(t, duration, .006, duration * .62) + thump * envelope(t, duration, .002, .035) * .10


def brass(freq: float, duration: float) -> np.ndarray:
    t = np.arange(max(1, round(duration * RATE))) / RATE
    phase = 2 * np.pi * np.cumsum(np.full_like(t, freq)) / RATE
    tone = np.sin(phase) + .40 * np.sin(2 * phase) + .22 * np.sin(3 * phase) + .10 * np.sin(4 * phase)
    env = np.clip(t / .025, 0, 1) * np.clip((duration - t) / .06, 0, 1)
    return tone * env


def note(freq: float, duration: float, kind: str, rng: np.random.Generator, glide: float = 0) -> np.ndarray:
    count = max(1, round(duration * RATE))
    if kind == "celesta":
        return celesta(freq, duration)
    if kind == "harp":
        return plucked_harp(freq, duration, rng)
    if kind == "strings":
        return bowed_strings(freq, duration, rng, glide)
    if kind == "ensemble":
        body = bowed_strings(freq, duration, rng, glide) * .78
        sparkle = celesta(freq * 2, duration) * .18
        pluck = plucked_harp(freq * 1.5, duration, rng) * .15
        return body + sparkle[:count] + pluck[:count]
    if kind == "pizzicato":
        return plucked_harp(freq * 1.18, duration, rng) * envelope(np.arange(count) / RATE, duration, .002, duration * .32)
    if kind == "impact":
        low = timpani(freq * .70, duration, rng) * .82
        upper = brass(freq * 1.5, duration) * .32
        return low + upper[:count]
    if kind == "arcane":
        pad = bowed_strings(freq * .5, duration, rng, glide) * .52
        bell = celesta(freq, duration) * .62
        return pad + bell[:count]
    if kind == "sweep":
        t = np.arange(count) / RATE
        body = bowed_strings(freq, duration, rng, glide=-.12) * .72
        air = np.convolve(rng.standard_normal(count), np.ones(23) / 23, mode="same")
        air *= envelope(t, duration, .10, duration * .70) * .19
        shimmer = celesta(freq * 1.5, duration) * .16
        return body + air + shimmer[:count]
    if kind == "brass":
        return brass(freq, duration)
    return bowed_strings(freq, duration, rng, glide)


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
    base = 185 if kind in ("impact", "strings", "ensemble", "pizzicato") else 355
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
    if kind in ("celesta", "harp", "arcane", "ensemble"):
        pad = note(base * .5, duration + .035, "strings", rng)
        total[:len(pad)] += pad * (.14 if kind != "ensemble" else .10)
    if kind in ("impact", "strings", "pizzicato"):
        hit = note(base * .58, .16, "impact", rng)
        total[:len(hit)] += hit * (.15 if kind == "impact" else .09)
    if kind == "sweep":
        delay = round(.09 * RATE)
        total[delay:] += .18 * total[:-delay]
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
    kind = "celesta" if event["category"] == "ui" or key.startswith("st") else "strings"
    if key in ("win", "finalWin", "battleStart", "horn", "settle"):
        kind = "brass"
    elif key in ("slash", "impactBlade", "crit", "dodgeleaf", "deploy", "die", "rockcrack"):
        kind = "impact" if key in ("crit", "die", "rockcrack") else "pizzicato"
    elif key in ("shield", "heal", "spellIce", "stXingji", "stHuayu", "stYizhe", "stShouhu"):
        kind = "ensemble" if key == "shield" or key == "stShouhu" else "celesta"
    elif key in ("spellDark", "impactPoison", "vampbite", "lose"):
        kind = "strings"
    elif key in ("spellFire", "spellZap", "impactArc", "impactWater", "splash", "zone", "cast"):
        kind = "sweep" if key in ("zone", "cast") else "arcane"
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
    manifest = {"version": "dream-magic-orchestral-v2", "format": "PCM16 mono", "sampleRate": RATE,
                "style": {"id": "dream-magic-orchestral", "name": "梦幻魔法 + 动画管弦",
                          "layers": ["celesta", "harp", "strings", "brass", "timpani", "magic-shimmer"]},
                "method": "deterministic local synthesis; no neural audio model",
                "skills": [u["id"] for u in units], "events": [e["key"] for e in events]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(units)} unit cues and {len(events)} system cues in {OUT}")


if __name__ == "__main__":
    main()
