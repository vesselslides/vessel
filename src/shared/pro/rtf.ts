// Minimal RTF support for ProPresenter slide text.
// ProPresenter stores text as Cocoa-flavoured RTF bytes (Graphics.Text.rtf_data).

// Groups whose contents are metadata, not visible text.
const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'expandedcolortbl', 'stylesheet', 'info', 'pict', 'header', 'footer',
  'listtable', 'listoverridetable', 'generator', 'xmlnstbl', 'themedata', 'datastore', 'latentstyles'
]);

const CP1252: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†',
  0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ',
  0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›',
  0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ'
};

export function rtfToPlainText(input: Uint8Array | string): string {
  const rtf = typeof input === 'string' ? input : new TextDecoder('latin1').decode(input);
  let out = '';
  // Each stack frame: [skipping, unicodeSkipCount]
  const stack: Array<{ skip: boolean; uc: number }> = [{ skip: false, uc: 1 }];
  let pendingSkip = 0;
  let i = 0;
  const top = (): { skip: boolean; uc: number } => stack[stack.length - 1];
  const emit = (s: string): void => {
    if (pendingSkip > 0) {
      pendingSkip--;
      return;
    }
    if (!top().skip) out += s;
  };

  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === '{') {
      stack.push({ ...top() });
      i++;
      // Ignorable destination: {\*\foo ...}
      if (rtf.startsWith('\\*', i)) top().skip = true;
      continue;
    }
    if (ch === '}') {
      if (stack.length > 1) stack.pop();
      i++;
      continue;
    }
    if (ch === '\\') {
      const next = rtf[i + 1];
      if (next === undefined) break;
      if (next === '\\' || next === '{' || next === '}') {
        emit(next);
        i += 2;
        continue;
      }
      if (next === '\n' || next === '\r') {
        // Cocoa RTF writes a line break as a backslash before the newline.
        emit('\n');
        i += 2;
        continue;
      }
      if (next === "'") {
        const code = parseInt(rtf.substr(i + 2, 2), 16);
        emit(CP1252[code] ?? String.fromCharCode(code));
        i += 4;
        continue;
      }
      if (next === '~') {
        emit(' ');
        i += 2;
        continue;
      }
      if (!/[a-zA-Z]/.test(next)) {
        i += 2;
        continue;
      }
      const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40));
      if (!m) {
        i++;
        continue;
      }
      const [whole, word, param] = m;
      i += 1 + whole.length;
      if (SKIP_DESTINATIONS.has(word)) {
        top().skip = true;
      } else if (word === 'par' || word === 'line') {
        emit('\n');
      } else if (word === 'tab') {
        emit('\t');
      } else if (word === 'uc') {
        top().uc = Number(param ?? 1);
      } else if (word === 'u') {
        let code = Number(param);
        if (code < 0) code += 65536;
        emit(String.fromCharCode(code));
        pendingSkip = top().uc;
      }
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    emit(ch);
    i++;
  }
  return out.replace(/\n+$/, '');
}

function escapeRtf(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\n') out += '\\\n';
    else if (code < 0x80) out += ch;
    else if (code <= 0xffff) out += `\\uc0\\u${code > 0x7fff ? code - 65536 : code} `;
    else {
      // Astral characters become a UTF-16 surrogate pair.
      const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const lo = ((code - 0x10000) % 0x400) + 0xdc00;
      out += `\\uc0\\u${hi - 65536} \\uc0\\u${lo - 65536} `;
    }
  }
  return out;
}

export interface RtfStyle {
  font: string;
  sizePt: number;
  color: [number, number, number];
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
}

export const DEFAULT_RTF_STYLE: RtfStyle = { font: 'Helvetica', sizePt: 72, color: [255, 255, 255], align: 'center' };

/**
 * Read the first font, size, colour and alignment from existing RTF. Mixed
 * formatting within one text box is not represented; the first run wins.
 */
export function parseRtfStyle(input: Uint8Array | string): RtfStyle {
  const rtf = typeof input === 'string' ? input : new TextDecoder('latin1').decode(input);
  const pard = rtf.search(/\\pard/);
  const body = rtf.slice(pard >= 0 ? pard : 0);
  // Style of the first run: the control words before the first visible character.
  const lead = /^(?:\s|\\[a-z]+-?\d* ?|\{[^{}]*\}|\})*/.exec(body.replace(/^\\pard/, ''))?.[0] ?? body;

  // Fonts: {\fonttbl\f0\fswiss\fcharset0 Futura-Bold;\f1 ...;}; the run picks one with \fN.
  const fonts = new Map<number, string>();
  const table = /\{\\fonttbl(.*?)\}\s*\n?\{?\\colortbl|\{\\fonttbl((?:[^{}]|\{[^{}]*\})*)\}/s.exec(rtf);
  for (const m of (table?.[1] ?? table?.[2] ?? '').matchAll(/\\f(\d+)[^;]*?(?:\\fcharset\d+)?\s*([^;\\{}]+);/g)) fonts.set(Number(m[1]), m[2].trim());
  const fontIndex = Number(/\\f(\d+)/.exec(lead)?.[1] ?? /\\f(\d+)/.exec(body)?.[1] ?? 0);

  // Colours: {\colortbl;\red255\green255\blue255;...}; entry 0 is "auto", \cfN picks one.
  const colorTable = /\\colortbl\s*;?([^}]*)\}/.exec(rtf)?.[1] ?? '';
  const colors = [...colorTable.matchAll(/\\red(\d+)\\green(\d+)\\blue(\d+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number]);
  const cf = /\\cf(\d+)/.exec(lead)?.[1] ?? /\\cf(\d+)/.exec(body)?.[1];
  const color = cf !== undefined && Number(cf) > 0 ? colors[Number(cf) - 1] : colors[0];

  const size = /\\fs(\d+)/.exec(body)?.[1];
  const align = /\\q([lcr])\b/.exec(body)?.[1];
  const bold = /\\b(?![a-z0-9])/.test(lead);
  const italic = /\\i(?![a-z0-9])/.test(lead);
  return {
    font: fonts.get(fontIndex) ?? fonts.values().next().value ?? DEFAULT_RTF_STYLE.font,
    sizePt: size ? Number(size) / 2 : DEFAULT_RTF_STYLE.sizePt,
    color: color ?? DEFAULT_RTF_STYLE.color,
    align: align === 'l' ? 'left' : align === 'r' ? 'right' : align === 'c' ? 'center' : DEFAULT_RTF_STYLE.align,
    ...(bold ? { bold } : {}),
    ...(italic ? { italic } : {})
  };
}

/** Replace the text of an RTF document, keeping its (first-run) styling. */
export function replaceRtfText(existing: Uint8Array | undefined, text: string): Uint8Array {
  return plainTextToRtf(text, existing && existing.length ? parseRtfStyle(existing) : DEFAULT_RTF_STYLE);
}

export function plainTextToRtf(text: string, style: RtfStyle = DEFAULT_RTF_STYLE): Uint8Array {
  const [r, g, b] = style.color;
  const align = { left: '\\ql', center: '\\qc', right: '\\qr' }[style.align];
  const rtf =
    '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n' +
    `{\\fonttbl\\f0\\fnil\\fcharset0 ${style.font};}\n` +
    `{\\colortbl;\\red${r}\\green${g}\\blue${b};}\n` +
    '{\\*\\expandedcolortbl;;}\n' +
    `\\pard\\pardirnatural${align}\\partightenfactor0\n\n` +
    `\\f0${style.bold ? '\\b' : ''}${style.italic ? '\\i' : ''}\\fs${Math.round(style.sizePt * 2)} \\cf1 ${escapeRtf(text)}}`;
  return new TextEncoder().encode(rtf);
}
