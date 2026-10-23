// Vessel's own log: one small file a day in the data folder's "logs", kept for
// a week, for working out what went wrong (Help ▸ Report a Problem sends it).
// It records what Vessel did, never song words, file paths or anything personal:
// callers log events and counts, and anything that looks like a path is masked.
import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEEP_DAYS = 7;
const MAX_LINE = 600;

export const logFolder = (): string => join(app.getPath('userData'), 'logs');
const today = (): string => new Date().toISOString().slice(0, 10);
const file = (): string => join(logFolder(), `vessel-${today()}.log`);

/** Paths (with the user's name in them) become "…/name.ext"; long text is cut short. */
export function scrub(text: string): string {
  return text
    .replace(/(?:[A-Za-z]:)?(?:[\\/][^\\/\s:'"]+){2,}[\\/]([^\\/\s:'"]+)/g, '…/$1')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_LINE);
}

let ready = false;

function prepare(): void {
  if (ready) return;
  ready = true;
  try {
    mkdirSync(logFolder(), { recursive: true });
    // Forget logs older than a week.
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60_000;
    for (const name of readdirSync(logFolder())) {
      const day = /^vessel-(\d{4}-\d{2}-\d{2})\.log$/.exec(name)?.[1];
      if (day && Date.parse(day) < cutoff) rmSync(join(logFolder(), name), { force: true });
    }
  } catch {
    // Logging must never stop Vessel.
  }
}

function write(level: 'info' | 'warn' | 'error', message: string): void {
  prepare();
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${scrub(message)}\n`;
  try {
    appendFileSync(file(), line);
  } catch {
    // Disk full or no permission: carry on without the log.
  }
  if (!app.isPackaged) (level === 'error' ? console.error : console.log)(line.trimEnd());
}

export const log = {
  info: (message: string): void => write('info', message),
  warn: (message: string): void => write('warn', message),
  error: (message: string): void => write('error', message)
};

/** Describe an error for the log: its message and the first few lines of where it happened. */
export const describe = (err: unknown): string =>
  err instanceof Error ? `${err.message} | ${(err.stack ?? '').split('\n').slice(1, 5).map((s) => s.trim()).join(' < ')}` : String(err);

// ---- Did Vessel quit properly last time? A marker file exists while it's running.

const marker = (): string => join(app.getPath('userData'), 'running');

/** Call at start-up: true if the last run ended without quitting properly (a crash, or the computer lost power). */
export function startRun(): boolean {
  const unclean = existsSync(marker());
  try {
    writeFileSync(marker(), String(Date.now()));
  } catch {
    // Can't tell next time; not important.
  }
  return unclean;
}

/** Call on a proper quit. */
export function endRun(): void {
  try {
    rmSync(marker(), { force: true });
  } catch {
    // Next start will think it crashed; harmless.
  }
}
