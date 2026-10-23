// Writes THIRD-PARTY-NOTICES.md: the libraries Vessel ships (and the ones they
// depend on) with their licence texts, plus notes on the samples, the Bible
// and NDI. Run after changing dependencies:  node scripts/notices.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// What the app ships: its dependencies, and the libraries bundled into the window code.
const shipped = [...Object.keys(pkg.dependencies ?? {}), 'react', 'react-dom', 'qrcode'];

/** "chalk/ansi-regex", "git://github.com/x/y.git" or "git@github.com:x/y" → https://github.com/x/y. */
function webLink(raw) {
  const s = raw.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^github:/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) return `https://github.com/${s}`;
  return s.replace(/^git:\/\//, 'https://').replace(/^git@github\.com:/, 'https://github.com/').replace(/^ssh:\/\/git@/, 'https://');
}

const seen = new Map();
function visit(name) {
  if (seen.has(name)) return;
  const dir = join(root, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) return;
  const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licenceFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  seen.set(name, {
    name,
    version: p.version,
    licence: p.license ?? (p.licenses ?? []).map((l) => l.type).join(', ') ?? 'see package',
    url: webLink(typeof p.repository === 'string' ? p.repository : p.repository?.url ?? p.homepage ?? ''),
    text: licenceFile ? readFileSync(join(dir, licenceFile), 'utf8').trim() : null
  });
  for (const dep of Object.keys(p.dependencies ?? {})) visit(dep);
}
shipped.forEach(visit);

const libs = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const electron = JSON.parse(readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8'));

const out = `# Third-party notices

Vessel is free software under the GNU General Public License, version 3 or
later (see LICENSE). It is built on the work of others, listed here with
their licences.

## Content that comes with Vessel

- **Sample backgrounds, audio and logo** (\`resources/samples/media\`): made for
  Vessel by \`scripts/samples/make_media.py\`; part of Vessel, under the same
  licence.
- **Sample hymns**: *Holy, Holy, Holy* (Reginald Heber, 1826), *Amazing Grace*
  (John Newton, 1779), *Come, Thou Fount of Every Blessing* (Robert Robinson,
  1758), *It Is Well with My Soul* (Horatio G. Spafford, 1873) and the
  *Doxology* (Thomas Ken, 1674). Public domain.
- **World English Bible** (\`resources/samples/bible\`): public domain, from
  eBible.org. Bibles downloaded later from inside Vessel are public domain
  or Creative Commons Attribution-ShareAlike 4.0; Vessel shows each one's
  credit.

## Trademarks

- NDI® is a registered trademark of Vizrt NDI AB. Vessel does not include NDI;
  its NDI output uses the free NDI Runtime from https://ndi.video when it is
  installed.
- Planning Center is a trademark of its owner; Vessel is not affiliated with it.
- ProPresenter is a trademark of its owner; Vessel is independent software that
  reads and writes compatible files and is not affiliated with it.

## Electron

Vessel runs on Electron ${electron.version} (MIT licence, https://github.com/electron/electron),
which includes Chromium and Node.js. Their licences ship inside the app as
\`LICENSE\` and \`LICENSES.chromium.html\`.

## Libraries

| Library | Version | Licence |
|---|---|---|
${libs.map((l) => `| [${l.name}](${l.url || `https://www.npmjs.com/package/${l.name}`}) | ${l.version} | ${l.licence} |`).join('\n')}

${libs
  .map((l) => `### ${l.name} ${l.version}\n\n${l.text ? '```\n' + l.text + '\n```' : `Licence: ${l.licence} (no licence file in the package; see ${l.url || 'its page on npm'}).`}`)
  .join('\n\n')}
`;

writeFileSync(join(root, 'THIRD-PARTY-NOTICES.md'), out);
console.log(`THIRD-PARTY-NOTICES.md: ${libs.length} libraries`);
