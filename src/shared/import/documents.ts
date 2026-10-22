// Plain text out of word-processor documents: Word (.docx), OpenDocument
// (.odt, from LibreOffice or Google Docs), RTF and text files.
import { unzipSync } from 'fflate';
import { parseXml, type XNode } from '../pro/legacy';
import { rtfToPlainText } from '../pro/rtf';
import { readZipEntries } from '../zip';

export interface DocumentText {
  text: string;
  /** A paragraph the document styled as its title (or first heading). */
  title?: string;
}

/** One file out of an Office-style zip. Falls back to a header walk for zips with a damaged directory. */
export function zipFile(zip: Uint8Array, name: string): Uint8Array | undefined {
  try {
    const found = unzipSync(zip, { filter: (f) => f.name === name });
    if (found[name]) return found[name];
  } catch {
    // Not readable through the central directory; try the local headers.
  }
  try {
    return readZipEntries(zip).find((e) => e.name === name)?.data;
  } catch {
    return undefined;
  }
}

/** All files in a zip, by name. */
export function zipFiles(zip: Uint8Array): Map<string, Uint8Array> {
  try {
    return new Map(Object.entries(unzipSync(zip)));
  } catch {
    return new Map(readZipEntries(zip).map((e) => [e.name, e.data]));
  }
}

const decodeEntities = (s: string): string =>
  s.replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));

export const xmlOf = (bytes: Uint8Array): XNode[] => parseXml(new TextDecoder().decode(bytes), { trim: false });

/** Text files: UTF-8 (with or without BOM), UTF-16 with BOM, or Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

interface Paragraph {
  text: string;
  /** Lines inside the paragraph made with Shift+Enter. */
  softBreaks: boolean;
  heading: boolean;
  /** A page break before or inside it. */
  pageBreak: boolean;
}

/**
 * Join paragraphs into lyrics. Most lyric sheets put each line in its own
 * paragraph with an empty one between verses; others put a whole verse in one
 * paragraph using Shift+Enter, separated only by spacing. When most
 * paragraphs are like that, each paragraph is a verse.
 */
function joinParagraphs(paragraphs: Paragraph[]): DocumentText {
  let title: string | undefined;
  const firstText = paragraphs.findIndex((p) => p.text.trim());
  if (firstText >= 0 && paragraphs[firstText].heading) {
    title = paragraphs[firstText].text.trim();
    paragraphs = paragraphs.slice(firstText + 1);
  }
  const filled = paragraphs.filter((p) => p.text.trim());
  const versePerParagraph = filled.length > 1 && filled.filter((p) => p.softBreaks).length >= filled.length / 2;
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (p.pageBreak && lines.length) lines.push('');
    if (versePerParagraph && !p.text.trim()) continue;
    // Later headings are section labels, written the way New Song understands.
    lines.push(p.heading && p.text.trim() ? `[${p.text.trim()}]` : p.text);
    if (versePerParagraph) lines.push('');
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return { text: lines.join('\n'), title };
}

// ---- Word (.docx) ----------------------------------------------------------

function wordParagraph(p: XNode): Paragraph {
  let text = '';
  let softBreaks = false;
  let pageBreak = false;
  const props = p.children.find((c) => c.tag === 'w:pPr');
  const style = props?.children.find((c) => c.tag === 'w:pStyle')?.attrs['w:val'] ?? '';
  if (props?.children.some((c) => c.tag === 'w:pageBreakBefore' && c.attrs['w:val'] !== '0' && c.attrs['w:val'] !== 'false')) pageBreak = true;
  const walk = (node: XNode): void => {
    for (const c of node.children) {
      switch (c.tag) {
        case 'w:t':
          text += decodeEntities(c.children.filter((t) => t.tag === '#text').map((t) => t.text).join(''));
          break;
        case 'w:tab':
          text += ' ';
          break;
        case 'w:br':
        case 'w:cr':
          if (c.attrs['w:type'] === 'page') pageBreak = true;
          else {
            text += '\n';
            softBreaks = true;
          }
          break;
        case 'w:noBreakHyphen':
          text += '-';
          break;
        // Deleted text (tracked changes), field codes and the paragraph's own settings aren't shown.
        case 'w:del':
        case 'w:instrText':
        case 'w:pPr':
        case 'w:rPr':
          break;
        default:
          walk(c);
      }
    }
  };
  walk(p);
  return { text, softBreaks, pageBreak, heading: /^(title|heading\d?|subtitle)$/i.test(style) && !/^subtitle$/i.test(style) };
}

export function docxToText(bytes: Uint8Array): DocumentText {
  const doc = zipFile(bytes, 'word/document.xml');
  if (!doc) throw new Error('This Word file has no document inside. Is it a .docx?');
  const paragraphs: Paragraph[] = [];
  // Paragraphs anywhere in the body, including inside tables and content controls.
  const collect = (node: XNode): void => {
    for (const c of node.children) {
      if (c.tag === 'w:p') paragraphs.push(wordParagraph(c));
      else collect(c);
    }
  };
  for (const root of xmlOf(doc)) collect(root);
  return joinParagraphs(paragraphs);
}

// ---- OpenDocument (.odt) ---------------------------------------------------

function odfParagraph(p: XNode): Paragraph {
  let text = '';
  let softBreaks = false;
  const walk = (node: XNode): void => {
    for (const c of node.children) {
      // ODF collapses runs of white space in text; <text:s/> and <text:tab/> are kept.
      if (c.tag === '#text') text += decodeEntities(c.text).replace(/[ \t\r\n]+/g, ' ');
      else if (c.tag === 'text:line-break') {
        text += '\n';
        softBreaks = true;
      } else if (c.tag === 'text:tab') text += ' ';
      else if (c.tag === 'text:s') text += ' '.repeat(Number(c.attrs['text:c'] ?? 1) || 1);
      else if (c.tag === 'text:note' || c.tag === 'office:annotation') continue;
      else walk(c);
    }
  };
  walk(p);
  const style = p.attrs['text:style-name'] ?? '';
  return { text: text.split('\n').map((l) => l.trim()).join('\n'), softBreaks, pageBreak: false, heading: p.tag === 'text:h' || /^title$/i.test(style) };
}

export function odtToText(bytes: Uint8Array): DocumentText {
  const content = zipFile(bytes, 'content.xml');
  if (!content) throw new Error('This OpenDocument file has no content inside.');
  const paragraphs: Paragraph[] = [];
  const collect = (node: XNode): void => {
    for (const c of node.children) {
      if (c.tag === 'text:p' || c.tag === 'text:h') paragraphs.push(odfParagraph(c));
      else collect(c);
    }
  };
  for (const root of xmlOf(content)) collect(root);
  return joinParagraphs(paragraphs);
}

// ---- RTF and text ------------------------------------------------------------

export const rtfDocumentToText = (bytes: Uint8Array): DocumentText => ({ text: rtfToPlainText(bytes) });
export const textFileToText = (bytes: Uint8Array): DocumentText => ({ text: decodeText(bytes) });
