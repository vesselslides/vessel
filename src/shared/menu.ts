/** A right-click menu entry, built in a renderer and shown natively by the main process. */
export type MenuEntry =
  | { type: 'separator' }
  | { id?: string; label: string; enabled?: boolean; checked?: boolean; accelerator?: string; submenu?: MenuEntry[] };

/** Check menu entries coming from a renderer before handing them to Electron. */
export function sanitizeMenu(input: unknown, depth = 0): MenuEntry[] {
  if (!Array.isArray(input) || depth > 3) return [];
  return input.slice(0, 80).flatMap((raw): MenuEntry[] => {
    if (!raw || typeof raw !== 'object') return [];
    const e = raw as Record<string, unknown>;
    if (e.type === 'separator') return [{ type: 'separator' }];
    if (typeof e.label !== 'string') return [];
    return [
      {
        id: typeof e.id === 'string' ? e.id : undefined,
        label: e.label.slice(0, 120),
        enabled: e.enabled !== false,
        checked: e.checked === true ? true : undefined,
        accelerator: typeof e.accelerator === 'string' ? e.accelerator.slice(0, 30) : undefined,
        submenu: e.submenu ? sanitizeMenu(e.submenu, depth + 1) : undefined
      }
    ];
  });
}
