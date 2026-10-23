import { useState, type ReactNode } from 'react';

const key = (id: string): string => `vessel.fold.${id}`;

function remembered(id: string, open: boolean): boolean {
  try {
    const saved = localStorage.getItem(key(id));
    return saved === null ? open : saved === 'open';
  } catch {
    return open;
  }
}

/**
 * A Live panel section that folds away to its heading, remembered on this
 * computer. While folded, the heading still says when it's in use ("on").
 */
export function Fold({
  id,
  title,
  className,
  active,
  defaultOpen = true,
  children
}: {
  id: string;
  title: string;
  className: string;
  /** In use now (a message or lower third showing, a timer running): shown on the heading. */
  active?: string | false;
  defaultOpen?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(() => remembered(id, defaultOpen));
  const toggle = (): void => {
    setOpen((was) => {
      try {
        localStorage.setItem(key(id), was ? 'closed' : 'open');
      } catch {
        // Not remembered; fine.
      }
      return !was;
    });
  };
  return (
    <section className={`${className} fold ${open ? 'open' : 'closed'}`}>
      <h3>
        <button className="fold-head" aria-expanded={open} onClick={toggle}>
          <svg className="fold-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
          {active && <span className="fold-active">{active}</span>}
        </button>
      </h3>
      <div className="fold-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
