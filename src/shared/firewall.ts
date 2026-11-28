// Reading Windows Firewall rules for the remote control (see src/main/firewall.ts).
import type { FirewallState } from './remote';

/** An enabled inbound TCP rule for Vessel, as PowerShell reports it. */
export interface FirewallRule {
  action: string;
  profile: string;
  /** "Any", "4040", "4040-4049", or several joined by commas. */
  ports: string;
}

/** Read the check script's output: one rule per line, `action|profile|ports`. */
export function parseRules(out: string): FirewallRule[] {
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('|'))
    .map((line) => {
      const [action = '', profile = '', ports = ''] = line.split('|');
      return { action, profile, ports };
    });
}

/** Whether these rules let phones reach `port`. A block rule wins over an allow, as in Windows. */
export function firewallVerdict(rules: FirewallRule[], port: number): FirewallState {
  const covers = (r: FirewallRule): boolean => {
    const ports = r.ports.trim();
    if (!ports || /^any$/i.test(ports)) return true;
    return ports.split(/[,\s]+/).some((part) => {
      const [lo, hi] = part.split('-').map(Number);
      return hi ? port >= lo && port <= hi : port === lo;
    });
  };
  const relevant = rules.filter(covers);
  if (relevant.some((r) => /block/i.test(r.action))) return 'blocked';
  if (relevant.some((r) => /allow/i.test(r.action))) return 'allowed';
  return 'missing';
}
