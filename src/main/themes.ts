import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EMPTY_THEME_LIBRARY, type ThemeLibrary } from '../shared/theme';

const file = (): string => join(app.getPath('userData'), 'themes.json');

export async function loadThemes(): Promise<ThemeLibrary> {
  try {
    const lib = JSON.parse(await readFile(file(), 'utf8')) as Partial<ThemeLibrary>;
    return { custom: Array.isArray(lib.custom) ? lib.custom : [], defaultId: lib.defaultId || EMPTY_THEME_LIBRARY.defaultId };
  } catch {
    return EMPTY_THEME_LIBRARY;
  }
}

export async function saveThemes(library: ThemeLibrary): Promise<void> {
  await writeFile(file(), JSON.stringify(library, null, 2));
}
