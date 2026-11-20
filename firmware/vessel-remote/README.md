# Vessel Remote

Firmware that turns an ESP32-S3 into a remote for Vessel. It's built for the
**Guition JC3248W535** (3.5" touch screen), and also runs on a bare ESP32-S3 with
buttons wired to it (set `BOARD_JC3248W535` to `0` in `vessel-remote.ino`).

It sends to Vessel over **Wi‑Fi**, or as a **USB MIDI** device called "Vessel Remote".
In `auto` mode (the default), it uses Wi‑Fi when it can reach Vessel and MIDI otherwise.

## The screen

A tab bar along the bottom has five pages:

| Page | What's on it |
|---|---|
| **Home** | What's live in Vessel: a picture of the live slide (or its words), slide number and group, the next slide, the timer, and whether the screen is black or cleared. Big Previous and Next buttons; swipe left or right anywhere for next and previous. Before it's set up, it says what to do next. |
| **Remote** | Previous and Next, Black (lit while the screen is black), Logo, Clear all, Clear text, Clear media, Video, the timer (Start / Pause / Resume, with the time), Reset timer, **Message** (type a message to show on Vessel's screen), Hide message, and Hide lower third. |
| **Service** | **Slides**: every slide of the live presentation, with its picture and the live one marked; tap one to show it. **Service**: the running order, with headings; tap an item to open it. Both lists scroll, and the slides list keeps the live slide in view. |
| **Wi‑Fi** | This remote's network, address and signal, plus nearby networks. Tap one and type its password on the on-screen keyboard. Also joins hidden networks, and forgets the current one. |
| **Settings** | **Vessel** (address, port and PIN, typed on screen; **Find Vessel** searches the network for it; **Test** checks the connection), how taps are sent (Auto, Wi‑Fi, MIDI, Both), **Screen** (portrait, landscape, or landscape the other way up), brightness, when the screen dims, tap sound, slide pictures, **About** (version, addresses, signal, memory, uptime) and Restart. |

Swipe left or right on any other page to move between the tabs (right goes back from Vessel
and About). In landscape the tabs run down the right-hand side.

**Slide pictures.** Vessel draws a picture of each slide while a presenter view is watching,
so with pictures on, the remote also opens the presenter view. Vessel's Remote control window
counts it as one presenter. The pictures load in the background: the live and next slides
first, then the rest.

**Sound.** Plug a small speaker (4–8 Ω) into the board's 2-pin speaker connector for a click
on each tap and a low tone when something fails. For a vibration motor, drive it from a
spare pin (6, 7, 9, 14, 15, 16, 17 or 18) through a transistor and type `vibrate 17`.

**Speed.** Each frame is drawn while the last one is still on screen, and sent whole (about
38 ms at the panel's top speed). Sending only the changed rows (`partial on`) would be faster,
but this panel puts them in the wrong place, so it's off.

The status bar shows Vessel's connection (green Connected, amber while setting up, red for
a wrong PIN or no Vessel, gold for MIDI) and the Wi‑Fi signal. A short message pops up
after each tap to say what happened. The screen dims after a minute untouched; the first
touch only wakes it.

The live slides, service list, messages and "go to slide" use Vessel's remote control the
way the phone remote does: the remote signs in with the PIN and follows Vessel's updates.
Nothing needs changing in Vessel.

After a wrong PIN, the remote stops trying, so it doesn't lock Vessel's remote out. Enter
the right PIN to start again.

## Set up

1. In Vessel, open **Remote control…** and turn it on. Note the PIN.
2. On the remote, open **Wi‑Fi**, tap your network and type its password. The network has to
   be 2.4 GHz and the same one Vessel's computer is on.
3. Open **Settings ▸ Vessel**, tap **Find Vessel** (or type the address), tap **PIN** and
   type it, then tap **Test**.

Home then shows what's on Vessel's screen.

You can also set it up from a computer, in the settings console (below).

## Build and flash

You need `arduino-cli`, the ESP32 core **3.3.x**, and three libraries. The display library
doesn't build with ESP32 core 4.0 yet.

```sh
brew install arduino-cli
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index && arduino-cli core install esp32:esp32@3.3.13
arduino-cli lib install "GFX Library for Arduino" U8g2 ArduinoJson JPEGDEC
```

Then, from this folder:

```sh
./build.sh upload     # build and flash
./build.sh monitor    # open the settings console (Ctrl-C to leave)
```

The first time, or if flashing can't find the board, hold **BOOT**, tap **RESET**,
let go of BOOT and run `./build.sh upload` again.

### Files

| File | |
|---|---|
| `vessel-remote.ino` | Settings, buttons, sending to Vessel (Wi‑Fi and MIDI), the console |
| `display.ino` | The screen and touch: drawing, icons, status and tab bars, gestures, dimming |
| `pages.ino` | The pages and the on-screen keyboard |
| `live.ino` | Following Vessel live, and commands such as "go to slide" |
| `pictures.ino` | Downloading and decoding the slide pictures |
| `audio.ino` | Tap sounds and vibration |
| `ui.h` | Shared types |
| `logos.h` | The Vessel logos, made by `tools/make_logos.py` from `brand/logo/png` |
| `tools/screenshot.py` | Saves what's on the screen as a PNG, over USB |

Arduino joins `.ino` files in alphabetical order after the main one, so `display.ino` has to
sort before `live.ino` and `pages.ino`.

## Buttons

On the JC3248W535, the **BOOT** button is a physical "next" button. Most other pins on
this board run the screen and touch (GPIO 1, 3, 4, 8, 21, 39, 40, 45, 47, 48), and the
console won't let you use them.

On a bare ESP32-S3, wire each button between a GPIO pin and **GND**; no resistors are needed.
The defaults there are GPIO 0 next, 4 prev, 5 black and 6 clear-all. The board's RGB light
(GPIO 48 on most S3 boards; some use 38) is purple for MIDI, blinking amber while joining
Wi‑Fi, blue on Wi‑Fi, and green once Vessel answers. It flashes white when a press goes
through and red when it doesn't.

## USB MIDI

Plug the board into Vessel's computer and choose **MIDI** under Settings (or `mode midi`).
In Vessel, open **Preferences ▸ MIDI and Stream Deck**, turn on MIDI, then for each action
choose **Learn** and tap the tile you want for it.

Buttons send notes from 60, held buttons from 68, and screen tiles from 76 (type `tiles`).
Live slides, the service list and messages need Wi‑Fi.

## Console commands

Type `help` for the full list. The main ones:

| Command | Does |
|---|---|
| `status`, `live` | Shows everything, or what Vessel is showing |
| `wifi` / `wifi "Name" password` / `scan` / `forget wifi` | Wi‑Fi |
| `host <ip or name.local>[:port]`, `port`, `pin`, `check` | Vessel |
| `mode auto \| wifi \| midi \| both` | How taps are sent |
| `backlight 200`, `dim 60` | Screen brightness (10-255), and seconds before it dims (0 never) |
| `rotate portrait \| landscape \| flipped` | Turns the screen |
| `sound off \| soft \| loud \| test`, `vibrate 17 \| off` | Tap feedback |
| `pictures on \| off`, `partial on \| off` | Slide pictures; sending only changed rows to the screen |
| `page home`, `tap 160 300`, `swipe 250 200 50 200`, `screenshot`, `perf` | Shows a page, taps or swipes the screen, sends the screen as an image, or times a frame (for testing) |
| `touch log`, `touch swap`, `touch flip x`, `touch flip y` | Shows where touches land, or fixes taps that land in the wrong place |
| `tiles`, `actions`, `test next` | Lists the tiles and actions, or sends an action now |
| `button 2 pin 4`, `button 2 action prev`, `button 2 hold logo`, `button 2 off` | Wired buttons |
| `midi channel 1`, `midi base 60` | MIDI channel and the first note |
| `factory reset`, `reboot` | Erases all settings, or restarts |

To save the screen as a picture (needs `pip install pillow`, and no console open):

```sh
python3 tools/screenshot.py screen.png
```

The Wi‑Fi password and Vessel PIN are kept on the board and never shown on screen or printed
by the firmware. `./build.sh monitor` still shows what you type, though, so don't type them
there where others can see the screen. The on-screen keyboard hides them.
