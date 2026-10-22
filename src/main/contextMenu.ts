import { BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import { sanitizeMenu, type MenuEntry } from '../shared/menu';

/** Show a native right-click menu; resolves with the chosen entry's id, or null if dismissed. */
export function setupContextMenu(): void {
  ipcMain.handle('menu:popup', (event, entries: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    return new Promise<string | null>((resolve) => {
      let chosen: string | null = null;
      const build = (items: MenuEntry[]): MenuItemConstructorOptions[] =>
        items.map((e) =>
          'type' in e
            ? { type: 'separator' }
            : {
                label: e.label,
                enabled: e.enabled !== false,
                type: e.checked ? 'checkbox' : undefined,
                checked: e.checked,
                // Shown as a hint only; the renderer handles the keys itself.
                accelerator: e.accelerator,
                registerAccelerator: false,
                submenu: e.submenu?.length ? build(e.submenu) : undefined,
                click: e.id ? () => (chosen = e.id!) : undefined
              }
        );
      // The close callback can run before the item's click handler; wait a tick for the choice.
      Menu.buildFromTemplate(build(sanitizeMenu(entries))).popup({ window: win, callback: () => setTimeout(() => resolve(chosen), 0) });
    });
  });
}
