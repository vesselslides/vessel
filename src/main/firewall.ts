// Windows Firewall and the remote control. Windows asks once whether an app may
// accept connections; if that prompt is missed, dismissed or turned off, it
// blocks phones without a word. Vessel checks for itself and, when asked, adds
// a rule (Windows asks for an administrator's OK).
import { execFile } from 'node:child_process';
import { firewallVerdict, parseRules } from '../shared/firewall';
import type { FirewallState } from '../shared/remote';
import { describe, log } from './log';

/** The name of the rule Vessel adds. */
export const RULE_NAME = 'Vessel Remote';

/** A PowerShell string literal. */
const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

function powershell(script: string, timeout = 20_000): Promise<string> {
  // -EncodedCommand takes UTF-16LE base64, which sidesteps every quoting rule.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout },
      (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout))
    );
  });
}

const checkScript = (program: string): string => `
$ErrorActionPreference = 'SilentlyContinue'
$rules = Get-NetFirewallApplicationFilter -Program ${quote(program)} | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' }
foreach ($r in $rules) {
  $p = ($r | Get-NetFirewallPortFilter)
  if ($p.Protocol -ne 'Any' -and $p.Protocol -ne 'TCP') { continue }
  '{0}|{1}|{2}' -f $r.Action, $r.Profile, (($p.LocalPort) -join ',')
}
`;

/** Whether Windows Firewall lets phones reach this copy of Vessel on `port`. */
export async function checkFirewall(port: number, program = process.execPath): Promise<FirewallState> {
  if (process.platform !== 'win32') return 'allowed';
  try {
    const state = firewallVerdict(parseRules(await powershell(checkScript(program))), port);
    log.info(`Windows Firewall for the remote (port ${port}): ${state}`);
    return state;
  } catch (err) {
    log.warn(`Couldn't read Windows Firewall rules: ${describe(err)}`);
    return 'unknown';
  }
}

/**
 * Let phones reach Vessel's remote ports: remove the block rules Windows made
 * when its prompt was dismissed, and add one allow rule for these ports on any
 * network (church Wi-Fi is often marked Public). Windows asks for an
 * administrator's OK. Resolves false if that was declined.
 */
export async function allowThroughFirewall(ports: [number, number], program = process.execPath): Promise<boolean> {
  if (process.platform !== 'win32') return true;
  const admin = `
$ErrorActionPreference = 'Continue'
Get-NetFirewallApplicationFilter -Program ${quote(program)} | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule
Remove-NetFirewallRule -DisplayName ${quote(RULE_NAME)}
New-NetFirewallRule -DisplayName ${quote(RULE_NAME)} -Description 'Lets phones and tablets on this network use the Vessel remote.' -Direction Inbound -Action Allow -Program ${quote(program)} -Protocol TCP -LocalPort '${ports[0]}-${ports[1]}' -Profile Any | Out-Null
`;
  const encoded = Buffer.from(admin, 'utf16le').toString('base64');
  // Start-Process -Verb RunAs shows Windows' administrator prompt and waits for the rule to be made.
  const launcher = `
try {
  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'
  'exit:' + $p.ExitCode
} catch { 'declined' }
`;
  try {
    const out = (await powershell(launcher, 120_000)).trim();
    log.info(`Allowing Vessel through Windows Firewall: ${out}`);
    return out.startsWith('exit:');
  } catch (err) {
    log.warn(`Couldn't add the Windows Firewall rule: ${describe(err)}`);
    return false;
  }
}
