# Developing Vessel

Vessel is an Electron app (electron-vite, React, TypeScript). The file-format
layer uses protobuf-es.

## Run it

```bash
npm install
npm run dev        # hot-reloading dev build
npm test           # format tests
npm run typecheck
npm run dist:mac   # or dist:win, to package an installer
```

Other useful commands:

```bash
npm run gen:proto                                  # regenerate src/shared/gen from proto/
node scripts/notices.mjs                           # rebuild THIRD-PARTY-NOTICES.md after changing dependencies
python3 scripts/samples/make_media.py              # remake the sample backgrounds, audio and logo
npx vitest run -c scripts/samples/vitest.config.ts # remake the sample songs and service
```

## Building installers

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

The installers fetch NDI support's native part for each platform they're
built for (`npm run ndi-binaries`, run by `dist:mac` and `dist:win`).

### Releases and update checks

Update checks look at the latest GitHub release of the repository named in
`package.json`'s `repository` field (`vesselslides/vessel`). Release assets
need electron-builder's names: `Vessel-<version>-mac-arm64.dmg`,
`-mac-x64.dmg`, `-win.exe` (both Windows versions in one) and `-win-x64.exe`.

To make a release:

1. Raise `version` in `package.json`, write `docs/releases/v<version>.md`, and
   commit.
2. `npm test`, then `npm run dist:mac` and `npm run dist:win`.
3. Tag and publish, attaching the four installers:

   ```bash
   git tag v<version> && git push origin main v<version>
   gh release create v<version> --title "Vessel <version>" \
     --notes-file docs/releases/v<version>.md \
     dist/Vessel-<version>-mac-arm64.dmg dist/Vessel-<version>-mac-x64.dmg \
     dist/Vessel-<version>-win.exe dist/Vessel-<version>-win-x64.exe
   ```

Every copy of Vessel offers the update within a day.

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
| `resources/samples/` | The sample songs, service, media and Bible set up on the first start (made by `scripts/samples/`) |
| `scripts/` | Build helpers: NDI binaries, third-party notices, samples |

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

## Testing

- `npm test` runs the unit tests; `npm run typecheck` checks types.
- `VESSEL_USER_DATA=/some/dir` gives Vessel a separate data folder, and
  `VESSEL_DOCUMENTS=/some/dir` a separate Documents folder, so a test run never
  touches real songs or settings. A fresh pair of folders is a true first start
  (the samples are set up).

## Roadmap

1. Your own app icon (replace the placeholder `build/icon.png`).
2. SongSelect (needs its own agreement with CCLI).
3. NDI audio, and sending the audience output (not just the stream) over NDI.
4. Code signing (Apple Developer ID; SignPath or the Microsoft Store on Windows).
