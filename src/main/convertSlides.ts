// Keynote files and older PowerPoint files (.ppt) can't be read directly, so
// an app on this computer saves a .pptx copy first: Keynote on a Mac (it
// opens .key, .ppt and .pptx and keeps builds as animations), PowerPoint on
// Windows (and on a Mac without Keynote), or LibreOffice where it's installed.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { log } from './log';

const run = (file: string, args: string[], timeout = 180_000): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim())) : resolve(stdout)))
  );

/** AppleScript string: quotes and backslashes escaped. */
const asString = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
/** PowerShell single-quoted string. */
const psString = (s: string): string => `'${s.replace(/'/g, "''")}'`;

const macApp = (name: string): boolean => existsSync(`/Applications/${name}.app`) || existsSync(`/System/Applications/${name}.app`);

/**
 * Keynote by its app id: the current Keynote (in Creator Studio too) is
 * com.apple.Keynote; older ones were com.apple.iWork.Keynote, and may not
 * start on a newer macOS, so they're tried second.
 */
async function keynoteIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const app of ['/Applications/Keynote Creator Studio.app', '/Applications/Keynote.app', '/System/Applications/Keynote.app']) {
    if (!existsSync(app)) continue;
    try {
      // Info.plist is usually binary; plutil reads either kind.
      const id = (await run('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(app, 'Contents', 'Info.plist')], 10_000)).trim();
      if (id && !ids.includes(id)) ids.push(id);
    } catch {
      // Not readable: try it by name below.
    }
  }
  if (!ids.length && macApp('Keynote')) ids.push('com.apple.iWork.Keynote');
  return ids.sort((a, b) => (a === 'com.apple.Keynote' ? -1 : b === 'com.apple.Keynote' ? 1 : 0));
}

function libreOffice(): string | null {
  const places =
    process.platform === 'darwin'
      ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice']
      : process.platform === 'win32'
        ? [join(process.env.ProgramFiles ?? 'C:\\Program Files', 'LibreOffice', 'program', 'soffice.exe'), join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe')]
        : ['/usr/bin/soffice', '/usr/bin/libreoffice'];
  return places.find((p) => existsSync(p)) ?? null;
}

async function withKeynote(id: string, path: string, out: string): Promise<void> {
  await run('osascript', [
    '-e',
    `with timeout of 150 seconds
    tell application id ${asString(id)}
      set theDoc to open POSIX file ${asString(path)}
      try
        export theDoc to POSIX file ${asString(out)} as Microsoft PowerPoint
      on error errText
        close theDoc saving no
        error errText
      end try
      close theDoc saving no
    end tell
    end timeout`
  ]);
}

async function withPowerPointMac(path: string, out: string): Promise<void> {
  await run('osascript', [
    '-e',
    `tell application "Microsoft PowerPoint"
      open POSIX file ${asString(path)}
      set thePres to active presentation
      save thePres in POSIX file ${asString(out)} as save as Open XML presentation
      close thePres saving no
    end tell`
  ]);
}

async function withPowerPointWindows(path: string, out: string): Promise<void> {
  // 24 is "PowerPoint Presentation (.pptx)". Opened read-only, without a window.
  const script = `$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open(${psString(path)}, -1, 0, 0)
  $pres.SaveAs(${psString(out)}, 24)
  $pres.Close()
} finally {
  if ($app.Presentations.Count -eq 0) { $app.Quit() }
}`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

async function withLibreOffice(soffice: string, path: string, dir: string): Promise<string> {
  await run(soffice, ['--headless', '--convert-to', 'pptx', '--outdir', dir, path]);
  const made = (await readdir(dir)).find((f) => f.toLowerCase().endsWith('.pptx'));
  if (!made) throw new Error('LibreOffice made no .pptx');
  return join(dir, made);
}

/** What to tell someone who has none of the apps that can convert this kind of file. */
function noConverter(ext: string): string {
  if (ext === 'key')
    return process.platform === 'darwin'
      ? 'Keynote files need Keynote to open them. Install Keynote (free from the App Store), or in Keynote choose File ▸ Export To ▸ PowerPoint and import the .pptx.'
      : 'Keynote files can only be opened on a Mac. On a Mac, in Keynote choose File ▸ Export To ▸ PowerPoint, then import the .pptx here.';
  if (ext === 'odp') return 'OpenDocument presentations need LibreOffice to open them. Save it as PowerPoint (.pptx) and import that.';
  return 'This is an older PowerPoint file and there’s no PowerPoint or Keynote here to open it. Save it as a .pptx (File ▸ Save As) and import that.';
}

/** A .pptx copy of a Keynote, older PowerPoint or OpenDocument presentation, made by an app on this computer. */
export async function convertToPptx(path: string): Promise<Uint8Array> {
  const ext = extname(path).slice(1).toLowerCase();
  const dir = await mkdtemp(join(tmpdir(), 'vessel-slides-'));
  const out = join(dir, `${basename(path, extname(path)) || 'Slides'}.pptx`);
  const tries: Array<[string, () => Promise<string | void>]> = [];
  if (process.platform === 'darwin') {
    if (ext !== 'odp') for (const id of await keynoteIds()) tries.push(['Keynote', () => withKeynote(id, path, out)]);
    if (ext !== 'key' && ext !== 'odp' && macApp('Microsoft PowerPoint')) tries.push(['PowerPoint', () => withPowerPointMac(path, out)]);
  }
  if (process.platform === 'win32' && ext !== 'key') tries.push(['PowerPoint', () => withPowerPointWindows(path, out)]);
  const soffice = libreOffice();
  if (soffice) tries.push(['LibreOffice', () => withLibreOffice(soffice, path, dir)]);
  if (!tries.length) throw new Error(noConverter(ext));

  const failures: string[] = [];
  try {
    for (const [app, convert] of tries) {
      try {
        const made = (await convert()) || out;
        if (existsSync(made)) return new Uint8Array(await readFile(made));
        failures.push(`${app} saved nothing`);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        log.warn(`Converting ${basename(path)} with ${app} failed: ${why}`);
        // macOS asks once whether Vessel may use Keynote; saying no lands here.
        failures.push(
          /-1743|not authori[sz]ed/i.test(why)
            ? `${app}: Vessel isn’t allowed to use it (System Settings ▸ Privacy & Security ▸ Automation)`
            : /-1712|timed out/i.test(why)
              ? `${app} didn’t answer: open it once, close any windows it shows when it starts, and import again`
              : /-600|isn.t running/i.test(why)
                ? `${app} wouldn’t start`
                : `${app} couldn’t open it`
        );
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  throw new Error(`This file couldn’t be converted to PowerPoint (${[...new Set(failures)].join("; ")}). ${noConverter(ext)}`);
}
