// koffi (used for NDI output) ships its native part as one package per platform,
// and npm only installs the one for this computer. Before building installers
// for other platforms, fetch theirs too (same version as koffi itself).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('../node_modules/koffi/package.json', import.meta.url), 'utf8')).version;
const platforms = process.argv.slice(2);
const packages = platforms.map((p) => `@koromix/koffi-${p}@${version}`);
console.log(`Fetching ${packages.join(', ')}`);
execFileSync('npm', ['install', '--no-save', '--force', '--ignore-scripts', ...packages], { stdio: 'inherit', shell: process.platform === 'win32' });
