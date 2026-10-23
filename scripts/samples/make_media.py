"""Make Vessel's sample media: motion and still backgrounds, two ambient audio
pads and a placeholder logo. Everything is drawn or synthesised here, so it's
all original and free to ship. Needs Python 3 with numpy and Pillow, and ffmpeg.

    python3 scripts/samples/make_media.py

Writes into resources/samples/media/.
"""
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[2] / 'resources' / 'samples' / 'media'
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1920, 1080          # finished size
MW, MH = 960, 540          # motion is drawn at half size, then scaled up (it's soft anyway)
FPS, SECONDS = 30, 12      # each motion background is a seamless 12-second loop
FRAMES = FPS * SECONDS
rng = np.random.default_rng(7)


def gaussian_sprite(radius: float) -> np.ndarray:
    """A soft round light, as a brightness mask."""
    size = int(radius * 4.5) | 1
    y, x = np.mgrid[:size, :size] - size // 2
    return np.exp(-(x * x + y * y) / (2 * (radius / 1.6) ** 2)).astype(np.float32)


def disc_sprite(radius: float) -> np.ndarray:
    """An out-of-focus light like a camera lens makes: a soft-edged disc, a little brighter at the rim."""
    size = int(radius * 2.6) | 1
    y, x = np.mgrid[:size, :size] - size // 2
    d = np.sqrt(x * x + y * y)
    edge = np.clip((radius - d) / (radius * 0.18), 0, 1)
    return (edge * (0.65 + 0.35 * np.clip(d / radius, 0, 1) ** 3)).astype(np.float32)


def add_sprite(frame: np.ndarray, sprite: np.ndarray, cx: float, cy: float, colour, strength: float) -> None:
    """Add a coloured light to the frame at (cx, cy), wrapping round the edges so loops stay seamless."""
    s = sprite.shape[0]
    h, w = frame.shape[:2]
    x0, y0 = int(cx) - s // 2, int(cy) - s // 2
    for dx in (-w, 0, w):
        for dy in (-h, 0, h):
            xa, ya = x0 + dx, y0 + dy
            xs, ys = max(0, xa), max(0, ya)
            xe, ye = min(w, xa + s), min(h, ya + s)
            if xs >= xe or ys >= ye:
                continue
            patch = sprite[ys - ya:ye - ya, xs - xa:xe - xa, None] * strength
            frame[ys:ye, xs:xe] += patch * np.array(colour, dtype=np.float32)


def vertical_gradient(h: int, w: int, top, bottom) -> np.ndarray:
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    return np.broadcast_to(np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t, (h, w, 3)).copy()


def encode(name: str, frames) -> None:
    """Pipe raw frames to ffmpeg: H.264, scaled to 1080p, no sound, ready to loop."""
    path = OUT / f'{name}.mp4'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{MW}x{MH}', '-r', str(FPS), '-i', '-',
           '-vf', f'scale={W}:{H}:flags=lanczos,gblur=sigma=1.2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', str(path)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in frames:
        proc.stdin.write(np.clip(f * 255, 0, 255).astype(np.uint8).tobytes())
    proc.stdin.close()
    if proc.wait():
        sys.exit(f'ffmpeg failed for {name}')
    print(f'{path.name}: {path.stat().st_size / 1e6:.1f} MB')


# ---- Motion backgrounds ----------------------------------------------------

def soft_light():
    """Warm and blue lights drifting slowly on closed paths: each comes back where it started after 12 s."""
    base = vertical_gradient(MH, MW, (0.03, 0.04, 0.10), (0.06, 0.03, 0.09))
    lights = []
    for _ in range(34):
        r = rng.uniform(18, 70)
        lights.append(dict(
            sprite=disc_sprite(r * 0.8) if rng.uniform() < 0.6 else gaussian_sprite(r), x=rng.uniform(0, MW), y=rng.uniform(0, MH),
            ax=rng.uniform(20, 90), ay=rng.uniform(15, 60), k=int(rng.integers(1, 3)), ph=rng.uniform(0, 2 * math.pi),
            colour=[(1.0, 0.72, 0.42), (0.55, 0.65, 1.0), (1.0, 0.55, 0.65)][int(rng.integers(0, 3))],
            strength=rng.uniform(0.10, 0.35), pulse=rng.uniform(0, 2 * math.pi)))
    for f in range(FRAMES):
        t = 2 * math.pi * f / FRAMES
        frame = base.copy()
        for l in lights:
            cx = l['x'] + l['ax'] * math.cos(l['k'] * t + l['ph'])
            cy = l['y'] + l['ay'] * math.sin(l['k'] * t + l['ph'])
            glow = l['strength'] * (0.75 + 0.25 * math.sin(t + l['pulse']))
            add_sprite(frame, l['sprite'], cx, cy, l['colour'], glow)
        yield frame


def aurora():
    """Slow ribbons of green, teal and violet light; every wave repeats a whole number of times in 12 s."""
    y, x = np.mgrid[:MH, :MW].astype(np.float32)
    x /= MW
    y /= MH
    base = vertical_gradient(MH, MW, (0.01, 0.02, 0.06), (0.02, 0.03, 0.05))
    for f in range(FRAMES):
        t = 2 * math.pi * f / FRAMES
        band1 = np.sin(6 * x + 2.2 * np.sin(3 * x + t) + t) * 0.5 + 0.5
        band2 = np.sin(4 * x - 1.7 * np.sin(2 * x - 2 * t) - t + 1.3) * 0.5 + 0.5
        centre1 = 0.38 + 0.10 * np.sin(5 * x + t)
        centre2 = 0.55 + 0.08 * np.sin(3 * x - t + 2)
        ribbon1 = np.exp(-((y - centre1) ** 2) / 0.02) * band1
        ribbon2 = np.exp(-((y - centre2) ** 2) / 0.03) * band2
        frame = base.copy()
        frame += ribbon1[..., None] * np.array([0.15, 0.85, 0.55], np.float32) * 0.95
        frame += ribbon2[..., None] * np.array([0.45, 0.30, 0.95], np.float32) * 0.75
        yield frame


def rising_embers():
    """Small warm particles drifting upwards; each rises a whole number of times in 12 s, so the loop is seamless."""
    base = vertical_gradient(MH, MW, (0.05, 0.02, 0.02), (0.14, 0.05, 0.03))
    glow = vertical_gradient(MH, MW, (0, 0, 0), (0.10, 0.04, 0.0))
    parts = []
    for _ in range(140):
        r = rng.uniform(1.5, 5.5)
        parts.append(dict(sprite=gaussian_sprite(r), x=rng.uniform(0, MW), y=rng.uniform(0, MH), laps=int(rng.integers(1, 4)),
                          sway=rng.uniform(4, 22), k=int(rng.integers(1, 4)), ph=rng.uniform(0, 2 * math.pi), s=rng.uniform(0.25, 0.9)))
    for f in range(FRAMES):
        t = f / FRAMES
        frame = base + glow
        for p in parts:
            cy = (p['y'] - p['laps'] * MH * t) % MH
            cx = p['x'] + p['sway'] * math.sin(2 * math.pi * p['k'] * t + p['ph'])
            twinkle = 0.7 + 0.3 * math.sin(2 * math.pi * 3 * t + p['ph'])
            add_sprite(frame, p['sprite'], cx, cy, (1.0, 0.62, 0.28), p['s'] * twinkle)
        yield frame


# ---- Still backgrounds -----------------------------------------------------

def save_still(name: str, img: np.ndarray, blur: float = 0) -> None:
    im = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    path = OUT / f'{name}.jpg'
    im.save(path, quality=88, optimize=True, progressive=True)
    print(f'{path.name}: {path.stat().st_size / 1e3:.0f} KB')


def stills() -> None:
    y, x = np.mgrid[:H, :W].astype(np.float32)
    # Dawn: warm sky with the sun just below the horizon.
    sky = vertical_gradient(H, W, (0.16, 0.10, 0.28), (0.98, 0.58, 0.36))
    sun = np.exp(-(((x - W * 0.62) / 520) ** 2 + ((y - H * 1.02) / 360) ** 2))[..., None]
    save_still('Dawn', sky + sun * np.array([1.0, 0.75, 0.45]) * 0.6, blur=2)
    # Deep Blue: dark blue with a few soft out-of-focus lights.
    img = vertical_gradient(H, W, (0.02, 0.05, 0.14), (0.01, 0.02, 0.06))
    for _ in range(26):
        add_sprite(img, disc_sprite(rng.uniform(30, 110)), rng.uniform(0, W), rng.uniform(0, H), (0.45, 0.62, 1.0), rng.uniform(0.04, 0.14))
    save_still('Deep Blue', img, blur=4)
    # Morning Mist: soft green-grey layers.
    img = vertical_gradient(H, W, (0.70, 0.78, 0.76), (0.22, 0.33, 0.31))
    for i, (top, shade) in enumerate([(0.55, 0.32), (0.66, 0.24), (0.78, 0.16)]):
        ridge = H * top + 40 * np.sin(x / (240 + 60 * i) + i) + 25 * np.sin(x / (97 + 13 * i))
        img = np.where((y > ridge)[..., None], img * (1 - shade) + np.array([0.12, 0.2, 0.18]) * shade, img)
    save_still('Morning Mist', img, blur=6)
    # Night Sky: deep blue with stars and a faint glow.
    img = vertical_gradient(H, W, (0.01, 0.01, 0.04), (0.04, 0.05, 0.12))
    for _ in range(900):
        add_sprite(img, gaussian_sprite(rng.uniform(0.8, 2.2)), rng.uniform(0, W), rng.uniform(0, H * 0.85), (1, 1, 1), rng.uniform(0.3, 1.0))
    save_still('Night Sky', img + np.exp(-((y - H) / 300) ** 2)[..., None] * np.array([0.1, 0.12, 0.25]), blur=0.6)


# ---- Audio: two soft pads, each a seamless loop ----------------------------

RATE = 44100


def note(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def pad(name: str, chords, seconds_per_chord: float, brightness: float) -> None:
    """Slow chords from soft sine partials, crossfaded, with a gentle echo; the end flows back into the start."""
    total = len(chords) * seconds_per_chord
    n = int(total * RATE)
    t = np.arange(n) / RATE
    left = np.zeros(n, np.float32)
    right = np.zeros(n, np.float32)
    fade = 2.5  # seconds of overlap between chords
    for i, chord in enumerate(chords):
        start = i * seconds_per_chord
        # Each chord's envelope, wrapped round the loop so the last chord fades into the first.
        local = (t - start) % total
        env = np.clip(np.minimum(local / fade, (seconds_per_chord + fade - local) / fade), 0, 1)
        env = 0.5 - 0.5 * np.cos(np.pi * env)
        for j, midi in enumerate(chord):
            f = note(midi)
            for h, amp in ((1, 1.0), (2, 0.35 * brightness), (3, 0.12 * brightness)):
                detune = 1 + 0.0015 * (j - 1)
                phase = 2 * np.pi * f * h * t
                tone = amp * np.sin(phase * detune) / (1 + 0.15 * j)
                wobble = 1 + 0.25 * np.sin(2 * np.pi * (0.1 + 0.03 * j) * t)
                left += (tone * env * wobble * (0.9 - 0.1 * j)).astype(np.float32)
                right += (amp * np.sin(phase / detune) / (1 + 0.15 * j) * env * (2 - wobble) * (0.8 + 0.1 * j)).astype(np.float32)
    # A soft echo, wrapped round so the loop stays seamless.
    for delay, gain in ((0.37, 0.30), (0.71, 0.18), (1.13, 0.10)):
        d = int(delay * RATE)
        left += np.roll(right, d) * gain
        right += np.roll(left, d) * gain * 0.8
    peak = max(np.abs(left).max(), np.abs(right).max())
    stereo = (np.stack([left, right], axis=1) / peak * 0.35).astype(np.float32)
    path = OUT / f'{name}.m4a'
    proc = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i', '-',
                           '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(path)], input=stereo.tobytes())
    if proc.returncode:
        sys.exit(f'ffmpeg failed for {name}')
    print(f'{path.name}: {path.stat().st_size / 1e6:.1f} MB, {total:.0f} s')


# ---- Placeholder logo --------------------------------------------------------

def logo() -> None:
    size = (1200, 600)
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    gold = (224, 165, 38, 255)
    # A simple mark: a circle with a cross cut through it.
    cx, cy, r = 300, 300, 170
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=gold, width=22)
    d.rounded_rectangle([cx - 14, cy - 120, cx + 14, cy + 120], radius=8, fill=gold)
    d.rounded_rectangle([cx - 80, cy - 52, cx + 80, cy - 24], radius=8, fill=gold)
    try:
        big = ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', 120, index=2)
        small = ImageFont.truetype('/System/Library/Fonts/Avenir Next.ttc', 54, index=0)
    except OSError:
        big = small = ImageFont.load_default()
    d.text((540, 190), 'Your Church', font=big, fill=(255, 255, 255, 255))
    d.text((546, 340), 'Replace me in Preferences', font=small, fill=(255, 255, 255, 170))
    path = OUT / 'Your Church Logo.png'
    im.save(path, optimize=True)
    print(f'{path.name}: {path.stat().st_size / 1e3:.0f} KB')


if __name__ == '__main__':
    only = set(sys.argv[1:])
    want = lambda name: not only or name in only
    if want('stills'):
        stills()
    if want('logo'):
        logo()
    if want('audio'):
        # C major: C, Am, F, G — calm, for before the service.
        pad('Before the Service', [(48, 55, 64, 67), (45, 57, 60, 64), (41, 53, 57, 60), (43, 55, 59, 62)], 11.25, 0.8)
        # D major, slower and darker, for prayer.
        pad('Prayer Pad', [(50, 57, 62, 66), (47, 54, 59, 62), (43, 55, 59, 62), (45, 57, 61, 64)], 15, 0.5)
    if want('motion') or want('aurora'):
        if want('motion'):
            encode('Soft Light', soft_light())
        encode('Aurora', aurora())
        if want('motion'):
            encode('Rising Embers', rising_embers())
