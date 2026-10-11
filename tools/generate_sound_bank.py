"""Build the retro-arcade chiptune sound bank used by the game.

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
OUT = ROOT / "assets" / "audio" / "v3"
RATE = 24000

MODE = {
    "heal": ("triangle", .38), "team": ("square", .46), "support": ("triangle", .42),
    "guard": ("pulse", .40), "guardLink": ("square", .47), "teamShield": ("pulse", .50),
    "single": ("square", .37), "chain": ("saw", .52), "zone": ("saw", .52),
    "field": ("pulse", .53), "chaos": ("saw", .45), "burst": ("pulse", .43),
    "dash": ("square", .34), "dashCleave": ("saw", .41), "cleave": ("pulse", .36),
    "combo": ("square", .41), "passive": ("triangle", .31),
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


def arcade_noise(duration: float, rng: np.random.Generator) -> np.ndarray:
    count = max(1, round(duration * RATE))
    t = np.arange(count) / RATE
    grit = rng.choice(np.array([-1.0, 1.0]), size=count)
    hold = max(1, RATE // 8000)
    grit = grit[(np.arange(count) // hold) * hold]
    return grit * np.exp(-t / max(.008, duration * .24)) * np.clip((duration - t) / .008, 0, 1)


def note(freq: float, duration: float, kind: str, rng: np.random.Generator, glide: float = 0) -> np.ndarray:
    count = max(1, round(duration * RATE))
    t = np.arange(count) / RATE
    if kind == "noise":
        return arcade_noise(duration, rng)

    inst_freq = freq * (1 + glide * np.exp(-t * 24))
    phase = np.cumsum(inst_freq) / RATE
    cycle = phase % 1
    if kind == "triangle":
        sound = 1 - 4 * np.abs(cycle - .5)
    elif kind == "saw":
        sound = cycle * 2 - 1
    elif kind == "pulse":
        sound = np.where(cycle < .25, 1.0, -1.0)
    else:
        sound = np.where(cycle < .5, 1.0, -1.0)

    # Hold samples and reduce the amplitude steps for a deliberately crunchy PSG texture.
    hold = max(1, RATE // 8000)
    sound = sound[(np.arange(count) // hold) * hold]
    sound = np.round(sound * 7) / 7
    attack = np.clip(t / .004, 0, 1)
    decay = np.exp(-t / max(.045, duration * .72))
    release = np.clip((duration - t) / .010, 0, 1)
    return sound * attack * decay * release


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
    base = 230 if kind in ("triangle", "saw") else 175
    base *= 2 ** ((seed_of(ident) % 11 - 5) / 24)
    motif = MOTIF.get(ident)
    if motif is None:
        step = 2 + seed_of(ident + ":motif") % 5
        motif = (0, step, step + 5)
    total = np.zeros(round((duration + .10) * RATE))
    pace = duration * (.31 if len(motif) <= 3 else .22)
    for i, semitone in enumerate(motif):
        start = round(i * pace * RATE)
        length = min(len(total) - start, round((duration - i * pace + .035) * RATE))
        if length <= 0:
            continue
        freq = base * 2 ** (semitone / 12)
        slide = .20 if i == 0 and kind in ("square", "pulse", "saw") else -.10 if i == len(motif) - 1 else 0
        voice = note(freq, length / RATE, kind, rng, glide=slide)
        total[start:start + length] += voice * (.90 ** i)
    if kind in ("square", "pulse"):
        bass = note(base * .5, min(duration * .65, .22), "triangle", rng, glide=.24)
        total[:len(bass)] += bass * .18
    if kind in ("saw", "pulse"):
        hit = arcade_noise(.045, rng)
        total[:len(hit)] += hit * .12
    if ident == "nana7mi":
        t = np.arange(len(total)) / RATE
        total += .13 * note(92, len(total) / RATE, "saw", rng, glide=-.45) * envelope(t, len(total) / RATE, .01, .28)
    if ident == "suiji":
        hit = arcade_noise(.10, rng)
        total[:len(hit)] += hit * .11
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
    kind = "square" if event["category"] == "ui" or key.startswith("st") else "triangle"
    if key in ("win", "finalWin", "battleStart", "horn", "settle"):
        kind = "square"
    elif key in ("slash", "impactBlade", "crit", "dodgeleaf", "deploy", "die", "rockcrack"):
        kind = "pulse"
    elif key in ("shield", "stShouhu", "stYizhe"):
        kind = "pulse"
    elif key in ("spellDark", "impactPoison", "vampbite", "lose", "spellFire", "spellZap", "impactArc", "impactWater", "splash", "zone", "cast"):
        kind = "saw"
    freqs = event["freqs"] or [360 + seed_of(key) % 280]
    duration = max(.11, duration)
    total = np.zeros(round((duration + .07) * RATE))
    pace = duration / max(1, len(freqs))
    for i, freq in enumerate(freqs):
        start = round(i * pace * .72 * RATE)
        length = len(total) - start
        slide = .24 if key in ("spellFire", "spellZap", "win", "finalWin", "lvlup", "buy") else -.16 if key in ("lose", "sell", "die", "impactPoison") else 0
        voice = note(freq, length / RATE, kind, rng, glide=slide)
        total[start:start + length] += voice * (.88 ** i)
    if key in ("slash", "impactBlade", "crit", "dodgeleaf", "deploy", "die", "rockcrack", "impactArc", "impactWater", "impactPoison"):
        hit = arcade_noise(.04 if key != "crit" else .065, rng)
        total[:len(hit)] += hit * (.18 if key != "crit" else .26)
    return total


def main() -> None:
    units = json.loads((ROOT / "assets" / "skill_signature_manifest.json").read_text(encoding="utf-8"))["units"]
    events = parse_events()
    assert len(units) == 50 and len(events) >= 50
    for unit in units:
        write_clip(OUT / "skills" / f"{unit['id']}.wav", render_skill(unit))
    for event in events:
        write_clip(OUT / "events" / f"{event['key']}.wav", render_event(event))
    manifest = {"version": "retro-arcade-v3", "format": "PCM16 mono", "sampleRate": RATE,
                "style": {"id": "retro-arcade", "name": "复古街机",
                          "layers": ["square-wave", "triangle-wave", "noise-percussion", "arpeggio", "pitch-slides", "bit-reduction"]},
                "method": "deterministic local synthesis; no neural audio model",
                "skills": [u["id"] for u in units], "events": [e["key"] for e in events]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(units)} unit cues and {len(events)} system cues in {OUT}")


if __name__ == "__main__":
    main()
