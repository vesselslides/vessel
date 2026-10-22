# Vessel

A cross-platform (macOS + Windows) worship presentation app that reads and
writes ProPresenter 7+ files.

## Run it

```bash
npm install
npm run dev        # hot-reloading dev build
npm test           # format tests
npm run typecheck
npm run dist:mac   # or dist:win, to package an installer
```

## Install

`npm run dist:mac` builds `dist/Vessel-<version>-mac-arm64.dmg` (Apple Silicon)
and `-mac-x64.dmg` (Intel). `npm run dist:win` builds
`dist/Vessel-<version>-win.exe`, one installer for every Windows PC: it holds
both the x64 and the Arm version and installs the right one (Arm on Copilot+
laptops or a Windows 11 Arm virtual machine on an Apple Silicon Mac, x64
otherwise). `-win-x64.exe` is a smaller download for Intel/AMD PCs only.
*Help ▸ About Vessel* shows which version is running. The builds aren't
code-signed yet:

- **Mac:** the first time, right-click Vessel in Applications and choose
  **Open**, then **Open** again.
- **Windows:** if SmartScreen warns, choose **More info → Run anyway**.

Signing needs an Apple Developer ID and a Windows code-signing certificate.

**The app icon** is `build/icon.png` (1024 × 1024 PNG; the installers make the
Mac and Windows versions from it). The current one is a placeholder: replace
the file with your own design and rebuild. Keep it a bold, simple shape so it
still reads at 16 pixels; on a Mac, a rounded square with some space around the
edge matches other apps. If a Mac keeps showing the old icon after updating,
restart the Dock (or the computer).

## Sunday checklist

Before the service:

1. Open Vessel and pick the service playlist (it reopens the last one).
2. Plug in the projector/TV and choose it under **Output**; choose the
   confidence monitor under **Stage**. Vessel remembers both.
3. Click each song in the playlist once, so you can see it's there and looks
   right. Missing songs show "Not found on this computer" in the status line.
4. Play a video background briefly and check the sound comes through the right
   speakers.
5. Set the stage timer (for example the sermon length) and leave it reset.
6. Save any last-minute edits (⌘S / Ctrl+S); unsaved songs show `*`.

During the service: → / Space for next (it rolls into the next song), ← for
previous, type a slide number and press Enter to jump to it, press a group's
letter (C Chorus, V Verse, B Bridge, P Pre-chorus, T Tag…; again for the next
one) to jump there, Esc clears the lyrics, Shift+Esc clears everything, and
`.` (full stop) blacks out. Right-click a slide for quick fixes without
leaving Show. *Help ▸ Keyboard Shortcuts* (⌘/ or Ctrl+/) lists every key.
Clicking a song and pressing → starts it from its first slide. If someone
else is running slides from a phone, turn on *Remote* and give them the PIN.

## What works today

- **Preferences** (*Vessel ▸ Settings…* ⌘, on a Mac, *Tools ▸ Preferences…*
  Ctrl+, on Windows, or the sliders icon at the end of the toolbar): every
  setting in one place: library folders and reopening the last playlist; the
  audience and stage displays (with each display's resolution), the fade, and
  the **slide size for new presentations** (1920×1080, 1280×720, 4K or 4:3);
  **dark, light or same as this computer** (the screens always stay black);
  video sound in the preview while the output is off (on by default), video and
  audio volume; the stage layout; import defaults; CCLI; remote control. Also:
  - **Logo** (General): pick your logo from the media bin; the *Logo* button in
    the Live panel (or L, unless the song has a group on L) shows it on black
    until you press it again or a slide goes on screen.
  - **Groups:** your section names with their colours and jump keys, starting
    like ProPresenter's with Verse 1–6, Pre-Chorus 1–3, Chorus 1–4 and Bridge
    1–4 (each family shaded a little lighter by number, sharing its letter),
    plus Intro, Outro, Ending, Tag, Refrain, Interlude, Vamp and Turnaround.
    New songs and imports colour groups from it (an exact name first, so
    "Verse 2" is Verse 2 and "Verse 9" falls back to Verse) and the letter keys
    follow it; songs you already have keep their colours.
  - **Sound output** (Audio and video): which speakers or audio interface
    Vessel plays through, an overall level, and a delay (up to 500 ms) to line
    sound up with a picture that arrives late.
  - **Media:** how new backgrounds fit (fill, fit or stretch), whether videos
    loop or play once, and an option to **copy imported media into
    Documents/Vessel/Media** so songs keep their media when files move.
  - **Show the audience screen when Vessel starts** (Screens), the copyright
    line **on every slide** and **Clear the usage log** (CCLI), and the **data
    folder** where Vessel keeps settings, Bibles and logs, with an Open button
    (General), for backups.
- **Library:** every `.pro` in `Documents/Vessel/Library` (plus any folders you
  add under *Folders*, e.g. your ProPresenter library) is listed and kept up to
  date as files change. Search matches titles and lyrics. New songs and
  imports are saved there straight away; *Save* (⌘S) writes back to the file.
  Quitting with unsaved changes asks first.
- **Service playlists:** build the running order in the sidebar: drag songs in
  from the library, add headers, drag to reorder. The arrow keys roll from the
  last slide of one song into the next (and back), and the stage display's
  *Next* looks ahead into the next song. Playlists save automatically to
  `Documents/Vessel/Playlists` as `.proPlaylist` (ProPresenter's playlist
  format). *Open playlist* turns ProPresenter playlists into service playlists.
- **Session restore:** the last playlist, fade setting and output/stage screens
  come back when Vessel starts.
- **Open `.pro` presentations.** Slides follow the selected arrangement and are
  grouped and coloured by section (Verse, Chorus…).
- **Import ProPresenter 5 and 6** (`.pro5`, `.pro6`, and `.pro6x` bundles):
  slides keep their RTF styling, text box positions, slide size, groups and
  colours, arrangements, labels, enabled state, CCLI details and backgrounds.
  Bundled media is unpacked to `Documents/Vessel/Imported Media` and added to the
  media bin. Imports open as new unsaved presentations; Save writes a `.pro` and
  never touches the original. Foreground images and other non-text slide
  elements are reported as not imported yet. Title graphics and other
  pictures on slides come across too.
- **Open playlists.** This covers ProPresenter's `Playlists/Library` file and
  zipped `.proPlaylist` exports. Clicking a presentation item loads it from
  disk.
- **Import PowerPoint, Word and text** (*Import…*, ⌘I / Ctrl+I, or just
  *Open…*): each file becomes a song in the library; the original is never
  changed.
  - **PowerPoint (.pptx)**, which Google Slides and Keynote can export: *Keep
    their look* brings each slide's background, the master's artwork, pictures
    and text boxes across where they sit, with font, size, colour and
    alignment (pictures go to `Documents/Vessel/Imported Media`). PowerPoint
    sections become groups; hidden slides are left out. *Words only* makes a
    plain song from the text instead, shown with your default theme; a title
    repeated on every slide becomes the song's name.
  - **Word (.docx), OpenDocument (.odt), RTF, text and ChordPro:** blank lines
    (or one paragraph per verse) separate verses; lines like `Verse 1`,
    `Chorus:`, `[Bridge]` start groups; a section sung again (`Chorus`, `Repeat
    chorus`, `Chorus x2`) reuses its group in a *Song order* arrangement. Chord
    lines and `[G]` chords are left out (optional), CCLI numbers and copyright
    lines go into the song's details, and you can split verses into 1–4 lines
    per slide.
  - Not yet: tables, charts, SmartArt, videos and EMF/WMF pictures in
    PowerPoint (the import says what was left out), bullets, and mixed
    formatting inside one text box (the first run's style is used). Older
    `.ppt`/`.doc`, Keynote and Pages files need saving as `.pptx`/`.docx` first;
    the import says how.
- **Bible** (*Bible* in the toolbar, *Tools ▸ Bible…*, ⌘B / Ctrl+B): one
  click downloads a free, public-domain Bible (World English Bible, King James
  Version, American Standard Version) from ebible.org; after that it works
  offline. Or add a Bible you've downloaded yourself as XML or zipped XML, in
  the Zefania, OSIS, USFX, OpenSong or "Holy Bible XML" formats (*Add a Bible…
  ▸ Choose a file…*). Each is read once and kept in the app's settings folder. Type a reference the way you'd say it,
  like `John 3:16-18`, `jn 3 16`, `1 Cor 13:4-7`, `Psalm 23`, `Rom 8:28, 31-39`,
  `Gen 1:1-2:3` or `Isa 40:31; 41:10`, and see it as slides straight away, or
  type a few words to find a verse. Choose verses per slide (or fill each
  slide), verse numbers, the reference on every slide, the last one or none,
  and the theme (Scripture by default). The Bible opens in the middle of the
  window, with the Live screen still beside it: click any verse slide (or a
  search result, or press Enter) and it's on screen at once; → and ← move
  through the verses (the copy on screen is listed under Open files as "on
  screen, not saved"). *Add to presentation* asks which open presentation or
  library song gets the passage and puts it at the end (handy for preparing a
  sermon); *Add to service* asks which playlist (or starts a new one) and adds
  it there; *Save to library* keeps it as its own presentation. Downloads show
  their progress. Other translations are copyrighted and need your church's
  licence.
- **Drag and drop:** drag files from Finder or Explorer onto Vessel. `.pro`,
  ProPresenter 5/6, PowerPoint, Word and text files go to the library (dropped
  on the service, they're added there too, where you drop them); pictures and
  videos go to the media bin; Bible XML or zip files go to the Bible;
  `.proPlaylist` files become service playlists. A hint shows while you drag,
  and the status bar says what happened to each file.
- **New song from lyrics.** Blank lines separate slides, and `[Chorus]` starts
  a group. Songs save as `.pro`.
- **Audience output** is a borderless full-screen window on any display.
- **Media bin:** pictures, videos and audio, organised in **folders** of your
  own (*+ New folder*; drag media onto a folder's name, or right-click ▸ *Move
  to folder*; imports and drops go into the folder you're looking at;
  double-click a folder to rename it; deleting a folder keeps its media). Filter
  by pictures, videos or audio, and search by name. Folders only organise the
  bin: files stay where they are on disk.
- **Audio:** MP3, WAV, M4A, AAC, FLAC, OGG and AIFF files in the media bin play
  when clicked, through this computer's sound output, with a player in the Live
  panel (pause, seek, loop, volume, stop). It keeps playing while slides
  change; *Clear all* (or right-click the Live preview ▸ *Stop audio*) stops it.
- **Backgrounds:** a media bin of images and videos (import once, kept between
  sessions). Click an item to put it behind the lyrics. Slides can carry their
  own background; it's saved in the `.pro` the same way ProPresenter stores it.
  A slide without one keeps the current background. Videos loop and play with
  sound on the output. While the output is off, the Live preview plays the
  sound instead (Preferences ▸ Audio and video can turn that off). While a video is on
  screen, the Live panel has its volume and a mute button (remembered). Right-
  click a video in the media bin ▸ *Always mute this video* for motion
  backgrounds that should never make a sound; it's marked 🔇 and stays silent
  wherever it's used, including as a slide's background.
- **Stage display:** a second screen for the people on stage (pick it under
  *Stage*; one display can't be used for both outputs). It shows the clock, a
  countdown or count-up timer (amber in the last minute, red and negative when
  over time), the current slide and its group, the next slide in amber (or
  "End"), and a pulsing message bar you send from the operator. The operator
  has a live preview of it plus timer and message controls. Pick a **layout**
  in the Stage panel: *Standard*, *Lyrics only* (as big as it fits), *Lyrics
  and next* (a bigger next slide for the band) or *Clock and timer* (both
  large, for speakers); *Adjust…* turns each part on or off and sets the next
  slide's size, how large lyrics may grow and the alignment. Vessel remembers
  the layout.
- **Faithful slide rendering:** every text box is drawn where it sits on the
  slide with its font, size, colour, alignment, vertical position, capitals,
  shadow and outline, letterboxed to the slide's aspect ratio on any screen.
  Boxes set to "scale font down" shrink to fit, like ProPresenter.
- **Themes** (*Themes…*): built-in Classic, Lower third, Bold caps, Scripture
  and Outline, plus your own (duplicate one and edit font, size, colour, style,
  outline, alignment and text-box position, previewed over the live
  background). Apply one to a presentation (undoable) or make it the default for
  new songs. Applying writes the style into the slides (RTF, ProPresenter text
  attributes, shadow and box), so a saved `.pro` keeps it; slides with several
  text boxes keep their layout. Custom themes live in `themes.json` in the app's
  settings folder.
- **Remote control** (*Remote* in the toolbar, off by default): a web page for
  any phone or tablet on the same Wi-Fi. Scan the QR code or open the address
  shown, then enter the 6-digit PIN. The phone shows what's on screen and
  what's next, has big Next/Back buttons, Clear, Clear all and Black, lets you
  tap any slide or song in the service, and runs the stage timer and stage
  messages. Wrong PINs lock the address out for a minute after 5 tries; *New
  PIN* signs every device out. The first time, the computer may ask whether
  Vessel can accept incoming connections: choose Allow.
- **Pictures and shapes on slides:** images (logos, title graphics) and
  coloured shapes are drawn on the slide in their stacking order, with
  opacity and rotation. In the editor, *+ Picture* adds an image from the media
  bin; each picture can be moved to a corner, the centre or the full slide,
  copied to every slide (handy for a logo) or removed. Themes can put a bar
  behind the lyrics (the Lower third theme has one); it's stored as the text
  box's fill, the way ProPresenter draws it.
- **Transitions:** text and media crossfade (Cut, 0.25s to 2s).
- **Operator controls:** click a slide to put it live. Keys: → / Space next,
  ← previous, Esc clear text, Shift+Esc clear all, `.` black. Buttons for Clear
  text, Clear media and Clear all.
- **Menu bar** laid out like ProPresenter's: *File* (New Song, Open, Open
  Playlist, Import, Import Media, Save), *Edit*, *View* (Show ⌘1 / Edit
  ⌘2), *Presentation* (next, previous, clear, black), *Screens* (pick the
  audience and stage displays), *Tools* (Bible, Themes, Remote Control) and *Help*
  (Keyboard Shortcuts). On Windows it sits at the top of the window.
- **Right-click everywhere else:** on the service playlist (new playlist, add a
  song or header, rename, delete), a service row (open, go live, move, insert a
  header above, header colour, show in Finder/Explorer, remove), a library song
  (open, go live, add to service, duplicate, show in Finder/Explorer, move to
  the Trash), the library (new song, open or import, add a folder), a media
  item (show now, set as the background or a picture on every slide of the
  open song, show in Finder/Explorer, remove from the bin), the media bin
  (import) and the Live preview (clear text/media/all, black).
- **Right-click menus and drag in Show:** right-click a slide to go live, edit
  its text, insert before/after, duplicate, move to another group, set its
  background, add a picture or delete it; right-click a group label to add a
  slide, change its colour or delete it. Drag slides to reorder them, also into
  another group.
- **CCLI (copyright and reporting)** (*Tools ▸ CCLI…*): for churches with a
  CCLI licence. Each song's title, writers, copyright year, publisher and CCLI
  song number live in *Edit ▸ Song info (CCLI)…*, saved in the `.pro` file the
  way ProPresenter keeps them (songs from ProPresenter, and lyrics imported with
  a CCLI line, already have them). Enter your licence number and choose where
  the copyright line shows: off (the default), each song's first slide, last
  slide, or both. It's drawn along the bottom of the audience screen without
  changing the slides, and a song can opt out. Vessel also keeps a usage log:
  a song counts once a day when it's on screen with the audience output on
  (rehearsing with the output off isn't counted; Bible passages never are).
  The report lists songs used between two dates with their CCLI numbers and
  how many times, to copy or save as CSV for CCLI's reporting, plus songs
  shown without a number so they can be filled in.
- **Announcement loops and slide timers:** the *⟳ Timer* button next to a
  presentation's name makes every slide move on by itself (3 seconds to 2
  minutes, or *Custom time…* for any length up to an hour, like `12`, `1:30`
  or `2m`), either looping back to the first slide or playing through once.
  Right-click a slide ▸ *Timer* to time just that slide (including a custom
  time), or send it back to the first. Timed slides show ⟳/↺ and their time; while one is on screen, the Live
  panel counts down to the next and *Pause* holds it. Clicking a slide or
  pressing →/← restarts the count, and *Clear text* stops it until you click a
  slide again. The timers are saved in the `.pro` file the way ProPresenter 7
  stores its "go to next" timers, so loops work in both.
- **Turned-off slides:** right-click a slide and choose *Turn slide off* (or
  open a ProPresenter file with disabled slides). It's dimmed and marked
  *Off*; Next and Previous, the stage's *Next* and the phone remote skip it,
  and clicking it still shows it if you need it.
- **Shortcuts:** number + Enter jumps to a slide; group letters jump to groups
  (shown next to each group name; ProPresenter's own group hot keys are used
  when a file has them); `.` blacks out.
- **Slide editor** (Edit mode): edit slide text (keeps each text box's font,
  size, colour and alignment), add, duplicate, delete and drag slides between
  groups, rename, recolour and reorder groups, and build arrangements by
  dragging group chips (groups can repeat). Drag a slide by its picture,
  right-click for the same menu as in Show plus *Split at cursor* (also ⌥Enter),
  and *Edit lyrics as text* to rework the whole song in one box with `[Group]`
  headers (groups keep their colour, styling, backgrounds and pictures). Set a slide's background from its
  picker, or drag media from the bin onto it. Undo/redo with ⌘Z / ⇧⌘Z
  (Ctrl+Z / Ctrl+Y), save with ⌘S / Ctrl+S.

## Layout

| Path | What |
|---|---|
| `proto/` | Vessel's definitions of the presentation and playlist file formats: only the parts Vessel uses (anything else in a file is kept unchanged when saving) |
| `src/shared/gen/` | TypeScript generated from `proto/` (`npm run gen:proto`) |
| `src/shared/pro/` | File-format layer: RTF text, presentations, playlists, edit operations |
| `src/main/` | Electron main process: windows, displays, file dialogs, media bin and the `vessel-media://` file protocol |
| `src/preload/` | `window.vessel` bridge between the main process and the renderers |
| `src/renderer/` | React UI: `operator.tsx` (control window), `Editor.tsx` (edit mode), `output.tsx` (audience) and `stageScreen.tsx` (stage display) |
| `test/` | Format tests |

## File compatibility

Vessel reads and writes `.pro` presentations and `.proPlaylist` playlists, and
imports `.pro5`, `.pro6` and `.pro6x` files, so a church can bring its library
across and keep using it in other software. The definitions in `proto/`
describe only what Vessel uses; anything else in a file is carried through
unchanged when Vessel saves it.

- `VESSEL_USER_DATA=/some/dir npm run dev` runs with a separate media bin and
  settings (handy for testing).
- `VESSEL_LEGACY_FIXTURES=/a.pro5,/b.pro6 npm test` and
  `VESSEL_PRO6X_FIXTURE=/c.pro6x npm test` check real version 5/6 files.
- `VESSEL_PRO_FIXTURE=/path/to/song.pro npm test` checks that a real `.pro`
  file opens and re-saves with nothing lost.
- Opening files made by Vessel in other presentation software hasn't been
  fully tested yet.

## Roadmap

1. Your own app icon (replace the placeholder `build/icon.png`).
2. SongSelect and Planning Center (each needs its own agreement).
3. NDI and MIDI control.
