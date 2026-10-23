// File ▸ Export in the main process: asks where to save, then writes plain
// text directly, or draws PDFs and pictures in the hidden print page.
import { app, BrowserWindow, dialog } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { exportText, FORMAT_EXTENSION, imageNames, type ExportJob, type ExportResult } from '../shared/exports';
import { safeFileName } from '../shared/vesselFile';
import { log } from './log';

const FILTERS: Record<string, Electron.FileFilter> = { pdf: { name: 'PDF', extensions: ['pdf'] }, txt: { name: 'Text', extensions: ['txt'] } };

/** Ask where to save (a file, or a folder for pictures), then export. Null if cancelled. */
export async function exportDocument(win: BrowserWindow | null, job: ExportJob, load: (w: BrowserWindow) => void): Promise<ExportResult | null> {
  const name = safeFileName(job.title, 'Vessel export');
  const ext = FORMAT_EXTENSION[job.format];
  let target: string;
  if (ext) {
    const opts = { title: 'Export', defaultPath: join(app.getPath('documents'), `${name}${job.format === 'pdf-lyrics' ? ' lyrics' : ''}.${ext}`), filters: [FILTERS[ext]] };
    const picked = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (picked.canceled || !picked.filePath) return null;
    target = picked.filePath;
  } else {
    const opts = { title: 'Export pictures into…', buttonLabel: 'Export Here', defaultPath: app.getPath('documents'), properties: ['openDirectory' as const, 'createDirectory' as const] };
    const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (picked.canceled || !picked.filePaths[0]) return null;
    target = join(picked.filePaths[0], name);
  }

  if (job.format === 'text') {
    await writeFile(target, exportText(job), 'utf8');
    log.info('Exported text');
    return { path: target, files: 1 };
  }

  const files = job.format === 'images' ? await writeImages(job, target, load) : await writePdf(job, target, load);
  log.info(`Exported ${job.format}: ${files} file${files === 1 ? '' : 's'}`);
  return { path: target, files };
}

/** The hidden print page, with the job drawn and ready. */
async function printPage(job: ExportJob, load: (w: BrowserWindow) => void, size?: { width: number; height: number }): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    width: size?.width ?? 1200,
    height: size?.height ?? 900,
    useContentSize: true,
    enableLargerThanScreen: true,
    // Pictures are captured from an offscreen page, so they come out the same on every screen.
    webPreferences: { offscreen: !!size, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  });
  if (size) win.webContents.setZoomFactor(1);
  const loaded = new Promise<void>((resolve, reject) => {
    win.webContents.once('did-finish-load', () => resolve());
    win.webContents.once('did-fail-load', (_e, _code, why) => reject(new Error(why)));
  });
  try {
    load(win);
    await loaded;
    await win.webContents.executeJavaScript(`window.__vesselPrint(${JSON.stringify(job)})`);
    return win;
  } catch (err) {
    // The page didn't load or draw: don't leave the hidden window behind.
    win.destroy();
    throw err;
  }
}

async function writePdf(job: ExportJob, target: string, load: (w: BrowserWindow) => void): Promise<number> {
  const win = await printPage(job, load);
  try {
    // The page sets its own paper size and margins (@page).
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    await writeFile(target, pdf);
    return 1;
  } finally {
    win.destroy();
  }
}

async function writeImages(job: ExportJob, folder: string, load: (w: BrowserWindow) => void): Promise<number> {
  const width = Math.round(Math.min(7680, Math.max(320, job.options.imageWidth)));
  const height = Math.round((width * job.height) / job.width);
  const win = await printPage(job, load, { width, height });
  const names = imageNames(job);
  let files = 0;
  try {
    for (let s = 0; s < names.length; s++)
      for (let i = 0; i < names[s].length; i++) {
        await win.webContents.executeJavaScript(`window.__vesselShow(${s}, ${i})`);
        const image = await win.webContents.capturePage({ x: 0, y: 0, width, height });
        const sized = image.getSize().width === width ? image : image.resize({ width, height, quality: 'best' });
        const path = join(folder, ...names[s][i].split('/'));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, job.options.imageFormat === 'jpeg' ? sized.toJPEG(92) : sized.toPNG());
        files++;
      }
  } finally {
    win.destroy();
  }
  return files;
}
