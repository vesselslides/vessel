"""Save what's on the Vessel Remote's screen as a PNG.

    python3 tools/screenshot.py out.png [/dev/cu.usbmodem...]

Sends `screenshot` to the settings console and decodes the reply (RGB565,
little-endian, base64). Needs pillow and the board connected over USB, with no
other program holding the port.
"""

import base64
import glob
import os
import sys
import termios
import time

from PIL import Image


def open_port(path):
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    a = termios.tcgetattr(fd)
    a[0] = a[1] = a[3] = 0
    a[4] = a[5] = termios.B115200
    termios.tcsetattr(fd, termios.TCSANOW, a)
    return fd


def read_until(fd, marker, timeout=20.0):
    out = b""
    end = time.time() + timeout
    while time.time() < end and marker not in out:
        try:
            out += os.read(fd, 65536)
        except BlockingIOError:
            time.sleep(0.01)
    return out


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else "screen.png"
    port = sys.argv[2] if len(sys.argv) > 2 else sorted(glob.glob("/dev/cu.usbmodem*"))[0]
    fd = open_port(port)
    read_until(fd, b"\xff", 0.3)  # drop anything waiting
    os.write(fd, b"screenshot\r\n")
    data = read_until(fd, b"\nEND")
    os.close(fd)
    text = data.decode(errors="replace")
    head = text.index("SCREENSHOT ")
    lines = text[head:].splitlines()
    parts = lines[0].split()
    w, h = int(parts[1]), int(parts[2])
    turn = int(parts[3]) if len(parts) > 3 else 0  # 0 portrait, 1 landscape, 2 flipped
    b64 = "".join(l.strip() for l in lines[1:] if l.strip() and l.strip() != "END" and not l.startswith(">"))
    raw = base64.b64decode(b64)
    img = Image.new("RGB", (w, h))
    px = img.load()
    for i in range(w * h):
        v = raw[2 * i] | raw[2 * i + 1] << 8
        px[i % w, i // w] = ((v >> 11) << 3, ((v >> 5) & 63) << 2, (v & 31) << 3)
    # The panel holds the picture upright for portrait; turn it as the screen is turned.
    if turn == 1:
        img = img.transpose(Image.Transpose.ROTATE_90)
    elif turn == 2:
        img = img.transpose(Image.Transpose.ROTATE_270)
    img.save(dest)
    print("Saved", dest)


if __name__ == "__main__":
    main()
