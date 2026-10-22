import { SHORTCUTS } from '../../shared/shortcuts';

/** Help ▸ Keyboard Shortcuts (⌘/ or Ctrl+/). */
export function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal shortcuts-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        {SHORTCUTS.map((group) => (
          <section key={group.title} className="shortcut-group">
            <h3>{group.title}</h3>
            <table>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.action}>
                    <td className="shortcut-keys">
                      {item.keys.map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </td>
                    <td>{item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <div className="modal-actions">
          <button className="primary" autoFocus onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
