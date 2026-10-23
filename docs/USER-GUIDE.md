# Vessel user guide

Everything Vessel does, with where to find it. New to Vessel? Start with the
[README](../README.md): download, first steps and a Sunday checklist. The
in-app tour (the **?** button at the top right) shows where things are, and
**⌘K / Ctrl+K** finds any song, verse or action by typing.

## The basics

- **Toolbar:** icons for New song, Open, Import, Open playlist, Bible, Themes,
  Remote control and Save (hover for the name and shortcut); **Show / Edit** in
  the middle; the **Screens** button and Preferences on the right.
- **Screens** (the monitor icon, top right): choose where the audience screen,
  stage display and stream output show, and the fade. The dot is green when
  the audience screen is on.
- **Live panel** (right): what the audience sees, with a badge saying whether
  it's live, clear, black, showing the logo, in practice mode or off. Clear
  text, Clear media, Clear all, Logo, Black and **Practice**. Message, Lower
  third and Stage fold away and say when they're in use.
- **Slide grid:** click a slide to show it. The live slide is marked LIVE and
  the one → or Space will show next is marked NEXT.

## Features

- **Preferences** (*Vessel ▸ Settings…* ⌘, on a Mac, *Tools ▸ Preferences…*
  Ctrl+, on Windows, or the sliders icon at the right of the toolbar): every
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
  imports are saved there straight away; Changes are saved as you go (autosave, on unless turned off in Preferences ▸ General); *Save* (⌘S) saves straight away.
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
- **Bible** (the book icon in the toolbar, *Tools ▸ Bible…*, ⌘B / Ctrl+B): one
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
- **Stage display:** a second screen for the people on stage (choose it with the Screens button; one display can't be used for both outputs). It shows the clock, a
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
- **Themes** (the palette icon in the toolbar): built-in Classic, Lower third, Bold caps, Scripture
  and Outline, plus your own (duplicate one and edit font, size, colour, style,
  outline, alignment and text-box position, previewed over the live
  background). Apply one to a presentation (undoable) or make it the default for
  new songs. Applying writes the style into the slides (RTF, ProPresenter text
  attributes, shadow and box), so a saved `.pro` keeps it; slides with several
  text boxes keep their layout. Custom themes live in `themes.json` in the app's
  settings folder.
- **Theme gallery** (Themes ▸ *Browse the gallery*): themes made by churches for
  churches. A starter set comes with Vessel (Hymnal, High Contrast, Stream
  Caption, Christmas Gold and more); community themes are listed too once
  Vessel's public website is set up. *Add* copies one into your themes. *Share
  one of yours…* opens a page proposing your theme for the gallery; only the
  theme is sent (font, colours and layout).
- **Export** (File ▸ Export…, ⇧⌘E / Ctrl+Shift+E, or right-click the service):
  for the open presentation or the whole service, in order:
  - *PDF of the slides*: as they look on screen, 1, 2, 4 or 6 a page, with or
    without backgrounds and captions; A4 or US Letter.
  - *Lyrics sheet*: the words by group with the group order and the CCLI line,
    in one or two columns, for the band or a printed order of service.
  - *Pictures of the slides*: PNG or JPEG, 1080 to 3840 pixels wide, one
    folder per song for a service. Video backgrounds show one frame.
  - *Plain text*: the words, for an email, bulletin or website.
  - *Playlist with media*: one `.proPlaylist` with the running order, every
    song and all their pictures, videos and audio, for presentation software
    that opens playlist files with media. Opening one in Vessel (Import ▸
    Playlist, or drop it on the window) copies its songs into the library and
    its media into the media bin.
- **Vessel files** (File ▸ Share as Vessel File… / Open Vessel File…): one
  `.vessel` file to share with another church using Vessel: a presentation, a
  whole service with its songs and media, your themes, or a collection of any of
  them. Whoever opens it (double-click, drop it on the window, or Import ▸
  Vessel file) sees who made it and what's inside, and chooses what to add;
  nothing they already have is overwritten. Sharing songs asks you to confirm
  they're yours to share. Right-click the service for *Duplicate playlist…*
  (Save As) too.
- **Remote control** (the phone icon in the toolbar, off by default): a web page for
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

## Streaming, NDI® and Planning Center

- **Stream output** (Screens ▸ Stream Output): the words on a key colour, in a
  window called "Vessel Stream Output" for OBS or vMix, or full screen on a display.
- **NDI® output** (Preferences ▸ Screens): sends the stream picture over the
  network, see-through if you like. It needs the free NDI Tools from
  [ndi.video](https://ndi.video/tools/) on the computer; Vessel doesn't include
  NDI itself. NDI® is a registered trademark of Vizrt NDI AB.
- **Planning Center** (Tools ▸ Planning Center): connect with a Personal Access
  Token, pick an upcoming plan, and it becomes a service playlist. Songs already
  in the library are used; others are made from Planning Center's lyrics. The
  secret is kept encrypted on the computer and isn't put in backups.
- **MIDI, Stream Deck and Companion**: Preferences ▸ MIDI and Stream Deck.

## More

- **Messages** (Live panel ▸ Message): a line along the bottom of the audience
  screen, over the slides. `{timer}` and `{clock}` keep ticking, e.g. "We
  begin in {timer}". Messages you've used are kept for next time.
- **Count down to a time** (Live panel ▸ Stage ▸ timer): besides a countdown and
  count up, the stage timer can count down to a time of day ("10:00"), and goes
  on into minus figures after it. Put `{timer}` in a message to show it.
- **Lower thirds** (Live panel ▸ Lower third): a name and second line in the
  lower left, over the slides, with a bar colour. Earlier ones are kept.
- **Video controls** (Live panel, while a video is live): restart, play/pause,
  scrub, and the time gone and left. The audience screen follows exactly.
- **Practice mode** (the *Practice* button, Presentation menu, or ⌘K): try
  anything in the preview while the audience screen, stream and NDI stay black
  and silent. It's off every time Vessel starts.
- **Find missing media:** a song whose pictures or videos have moved shows a
  bar with **Find…**; choose a folder and Vessel finds the files by name and
  points everything at them. Missing items in the media bin are marked too.
- **Song text** (Edit ▸ *Edit lyrics as text*): the whole song in one box, with
  a live preview of the slides. A bare `[Chorus]` sings it again (kept as the
  *Song order* arrangement), long slides can be split by lines, and *Tidy
  pasted lyrics* takes out chords and copyright lines.
- **MIDI, Stream Deck and Companion** (Preferences ▸ MIDI and Stream Deck):
  pads, keys and buttons can run Next, Previous, Clear, Black, Logo, the video,
  the timer and more.
- **Backups** (File ▸ Back Up… / Restore from Backup…): one file with your
  songs, playlists, themes, Bibles, media bin, CCLI log and settings, and
  optionally the media itself.
- **Update checks** (Help ▸ Check for Updates, and once a day if switched on).
- **Samples** (Help ▸ Add the Sample Songs and Media): a sample service,
  hymns, backgrounds and audio, set up on the first start.
- **Crash safety:** if a screen ever stops working, Vessel reopens it on its own;
  if Vessel itself closes unexpectedly, your playlist, presentation and screens
  come back (nothing goes on screen until you choose a slide). **Help ▸ Report
  a Problem** saves a file with Vessel's logs to send to whoever looks after it.
