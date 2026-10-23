import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const data = mkdtempSync(join(tmpdir(), 'vessel-log-'));
afterAll(() => rmSync(data, { recursive: true, force: true }));
vi.mock('electron', () => ({ app: { getPath: () => data, isPackaged: true } }));
const { endRun, log, logFolder, scrub, startRun } = await import('../src/main/log');

describe('the log', () => {
  it('masks paths, which can hold the user’s name', () => {
    expect(scrub("ENOENT: open '/Users/someone/Documents/Vessel/Library/Song.pro'")).toBe("ENOENT: open '…/Song.pro'");
    expect(scrub('C:\\Users\\Someone\\Music\\loop.mp4 failed')).toBe('…/loop.mp4 failed');
    expect(scrub('Audience screen on display 2 of 2, 1920×1080')).toBe('Audience screen on display 2 of 2, 1920×1080');
    expect(scrub('x'.repeat(2000))).toHaveLength(600);
  });

  it('writes a file a day and forgets ones older than a week', () => {
    mkdirSync(logFolder(), { recursive: true });
    writeFileSync(join(logFolder(), 'vessel-2020-01-01.log'), 'old\n');
    log.info('Vessel started');
    log.error('Something broke at /Users/someone/secret/thing.js');
    const files = readdirSync(logFolder());
    expect(files).not.toContain('vessel-2020-01-01.log');
    const today = readFileSync(join(logFolder(), files[0]), 'utf8');
    expect(today).toMatch(/INFO {2}Vessel started/);
    expect(today).toMatch(/ERROR Something broke at …\/thing\.js/);
    expect(today).not.toContain('someone');
  });

  it('knows when the last run didn’t quit properly', () => {
    expect(startRun()).toBe(false);
    // Crashed: no endRun, so the next start sees it.
    expect(startRun()).toBe(true);
    endRun();
    expect(startRun()).toBe(false);
    endRun();
  });
});
