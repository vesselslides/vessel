# Privacy

Vessel has no accounts, no analytics and no tracking. Your songs, playlists,
media, settings and logs stay on your computer. Vessel only goes online when
you use one of the features below, and only for what that feature needs.

## When Vessel connects to the internet

| Feature | When | What it does |
|---|---|---|
| **Update checks** | Once a day when Vessel starts, if switched on (Preferences ▸ General), and when you choose Help ▸ Check for Updates | Asks GitHub for the latest Vessel version. It sends only the request itself, with Vessel's version in it. Downloading an update only happens if you choose to. |
| **Bible downloads** | When you download a Bible in the Bible panel | Downloads that Bible from ebible.org. |
| **Theme gallery** | When you open Themes ▸ Browse the gallery (once Vessel's public repository is set up) | Downloads the list of community themes from GitHub. Submitting a theme opens a page in your web browser; nothing is sent unless you submit it there. |
| **Planning Center** | Only after you connect it (Tools ▸ Planning Center) | Reads your service types, plans and songs from Planning Center, using the token you gave it. Vessel never changes anything in Planning Center. |

Links such as ndi.video or Planning Center's token page open in your web
browser, which then works as it normally does.

## On your local network

These are off until you turn them on, and only reach devices on your own
network:

- **Remote control** (and Stream Deck or Companion): a small web page phones
  and tablets can open, protected by a PIN. Wrong PINs are locked out after a
  few tries.
- **NDI® output**: sends the stream picture to NDI receivers such as OBS or
  vMix. NDI is a registered trademark of Vizrt NDI AB.

## What stays on your computer

- **Songs and playlists**: in Documents/Vessel, or the folders you chose.
- **Settings, media bin, Bibles, the CCLI usage log**: in Vessel's data folder
  (Preferences ▸ General ▸ Data folder).
- **Planning Center token**: encrypted with your computer's own keychain, and
  never put in backups.
- **Logs**: a small log a day, kept for a week, recording what Vessel did
  (never song words, Bible text or file names).

**Backups** and **problem reports** are files Vessel saves where you choose.
Nothing is sent anywhere unless you send it yourself. A problem report holds
Vessel's logs and technical details about the computer, never songs,
lyrics, file names, passwords or PINs.

## CCLI

Vessel can keep a log of the songs you show, for your church's CCLI
reporting. The log stays on your computer; you choose when to save a report
and submit it to CCLI yourself.
