# Vessel

**Free presentation software for churches.** Songs, Bible verses, videos and
announcements on the screen; a stage display for the band; a picture for
your livestream. For Mac and Windows, and free for everyone, for good.

Vessel opens and saves ProPresenter 7 presentations and playlists (and
imports versions 5 and 6), so a church can bring its library across and keep
using it.

## What it does

- **Songs** with groups (Verse, Chorus…), arrangements, themes and motion or
  still backgrounds. Type them in, or import from PowerPoint, Word, text or
  ChordPro, or from Planning Center.
- **The Bible**: 30 free translations in 17 languages, offline once downloaded.
  Type "John 3:16" and click a verse to show it.
- **Service playlists**: the running order for the day, with headings. → and
  Space roll from one song into the next.
- **Screens**: the audience screen, a stage display (clock, timer, current and
  next slide) and a stream output with lyrics for OBS or vMix, also over NDI®.
- **Media**: pictures, motion backgrounds with play and scrub controls, and
  audio, in folders.
- **Messages and lower thirds** over the slides, such as "We begin in
  {timer}" or "Pastor Sam · Lead Pastor".
- **Announcement loops**, slide timers, a logo button and a black screen.
- **Control** from a phone, a Stream Deck, Companion or a MIDI pad.
- **CCLI** copyright lines and usage reports.
- **Peace of mind**: changes save as you go, screens that stop working reopen
  by themselves, backups in one file, and a practice mode that keeps the real
  screens dark while someone learns.

## Download and install

Download the right file from the releases page *(the address will be added
when the public repository is created)*:

| Your computer | File |
|---|---|
| Mac with an Apple chip (M1 and later) | `Vessel-<version>-mac-arm64.dmg` |
| Mac with an Intel chip | `Vessel-<version>-mac-x64.dmg` |
| Windows (any) | `Vessel-<version>-win.exe` (installs the right version for the PC) |

Vessel isn't code-signed yet, so the first start needs one extra step:

- **Mac:** open the `.dmg` and drag Vessel into Applications. The first time you
  open it, macOS may say it can't check the app. Open **System Settings ▸
  Privacy & Security**, scroll down and choose **Open Anyway**, then **Open**.
- **Windows:** if "Windows protected your PC" appears, choose **More info**, then
  **Run anyway**.

## First steps

The first time Vessel opens it sets up a **Sample Sunday Service**: hymns, a
Bible reading, a sermon and an announcement loop, with motion backgrounds and
audio. Try anything; the sample songs are in the library's *Samples* folder,
and you can delete them whenever you like.

- The **welcome window** helps you bring in your songs, choose the projector and
  get a Bible.
- The **tour** (the **?** button at the top right) shows where everything is in
  a minute.
- **Practice** (in the Live panel) keeps the audience screen dark while you try
  things out.
- **⌘K / Ctrl+K** finds any song, verse or action by typing.

The [user guide](docs/USER-GUIDE.md) describes every feature.

## Sunday checklist

Before the service:

1. Open Vessel; it reopens the last service playlist.
2. Plug in the projector or TV and choose it with the **Screens** button (top
   right); choose the stage screen there too. Vessel remembers both.
3. Click each song in the playlist once, to see it's there and looks right. If
   a picture or video has moved, a bar offers **Find…**.
4. Play a video background briefly and check the sound comes through the right
   speakers.
5. Set the stage timer, for example to the sermon length, or count down to the
   start time and show "We begin in {timer}" as a message.
6. Make sure **Practice** is off: the preview's badge says **Live** once a slide
   is on screen.

During the service: → or Space for the next slide, ← for the previous one,
a group's letter (C Chorus, V Verse, B Bridge…) to jump there, Esc to clear the
words, Shift+Esc to clear everything, and `.` (full stop) for a black screen.
**Help ▸ Keyboard Shortcuts** lists every key.

## Help

- **Help ▸ Take the Tour** and **Help ▸ Open the Practice Song**, to learn by
  doing.
- **Help ▸ Report a Problem…** saves one file with Vessel's logs (no songs or
  personal details) to send to whoever looks after Vessel.

## Privacy

No accounts, no analytics, no tracking. Vessel only goes online for update
checks, Bible downloads and Planning Center, and only when you use them. See
[PRIVACY.md](PRIVACY.md).

## Licence

Copyright © 2026 Vessel contributors. Vessel is free software: you can use,
change and share it under the [GNU General Public License, version 3 or
later](LICENSE). It builds on other people's work, listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). NDI® is a registered
trademark of Vizrt NDI AB. ProPresenter and Planning Center are trademarks of
their owners; Vessel isn't affiliated with them.

## For developers

Building, testing, the project layout and how the samples are made:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
