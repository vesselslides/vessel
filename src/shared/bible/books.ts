// The 66 books of the Protestant canon in order, with the ids Bible files use
// for them (OSIS, and USFM/USFX) and common abbreviations people type.

export interface CanonBook {
  /** 1–66, the numbering Zefania and most XML Bibles use. */
  number: number;
  name: string;
  osis: string;
  usfm: string;
  /** Lower case, without spaces or dots. */
  abbreviations: string[];
}

const RAW: Array<[string, string, string, string]> = [
  ['Genesis', 'Gen', 'GEN', 'gn ge gen'],
  ['Exodus', 'Exod', 'EXO', 'ex exo exod'],
  ['Leviticus', 'Lev', 'LEV', 'lv le lev'],
  ['Numbers', 'Num', 'NUM', 'nm nu num nb'],
  ['Deuteronomy', 'Deut', 'DEU', 'dt de deu deut'],
  ['Joshua', 'Josh', 'JOS', 'jos josh jsh'],
  ['Judges', 'Judg', 'JDG', 'jdg judg jg jdgs'],
  ['Ruth', 'Ruth', 'RUT', 'rt ru rth'],
  ['1 Samuel', '1Sam', '1SA', '1sa 1sam 1sm 1s'],
  ['2 Samuel', '2Sam', '2SA', '2sa 2sam 2sm 2s'],
  ['1 Kings', '1Kgs', '1KI', '1ki 1kgs 1kg 1k'],
  ['2 Kings', '2Kgs', '2KI', '2ki 2kgs 2kg 2k'],
  ['1 Chronicles', '1Chr', '1CH', '1ch 1chr 1chron'],
  ['2 Chronicles', '2Chr', '2CH', '2ch 2chr 2chron'],
  ['Ezra', 'Ezra', 'EZR', 'ezr'],
  ['Nehemiah', 'Neh', 'NEH', 'ne neh'],
  ['Esther', 'Esth', 'EST', 'es est esth'],
  ['Job', 'Job', 'JOB', 'jb'],
  ['Psalms', 'Ps', 'PSA', 'ps psa pss psalm psm'],
  ['Proverbs', 'Prov', 'PRO', 'pr pro prov prv'],
  ['Ecclesiastes', 'Eccl', 'ECC', 'ec ecc eccl eccles qoh'],
  ['Song of Solomon', 'Song', 'SNG', 'song sos so sng songofsongs canticles'],
  ['Isaiah', 'Isa', 'ISA', 'is isa'],
  ['Jeremiah', 'Jer', 'JER', 'je jer jr'],
  ['Lamentations', 'Lam', 'LAM', 'la lam'],
  ['Ezekiel', 'Ezek', 'EZK', 'eze ezek ezk'],
  ['Daniel', 'Dan', 'DAN', 'da dan dn'],
  ['Hosea', 'Hos', 'HOS', 'ho hos'],
  ['Joel', 'Joel', 'JOL', 'jl joe jol'],
  ['Amos', 'Amos', 'AMO', 'am amo'],
  ['Obadiah', 'Obad', 'OBA', 'ob oba obad'],
  ['Jonah', 'Jonah', 'JON', 'jon jnh'],
  ['Micah', 'Mic', 'MIC', 'mi mic'],
  ['Nahum', 'Nah', 'NAM', 'na nah nam'],
  ['Habakkuk', 'Hab', 'HAB', 'hab hb'],
  ['Zephaniah', 'Zeph', 'ZEP', 'zep zeph zp'],
  ['Haggai', 'Hag', 'HAG', 'hag hg'],
  ['Zechariah', 'Zech', 'ZEC', 'zec zech zc'],
  ['Malachi', 'Mal', 'MAL', 'mal ml'],
  ['Matthew', 'Matt', 'MAT', 'mt mat matt'],
  ['Mark', 'Mark', 'MRK', 'mk mr mrk mar'],
  ['Luke', 'Luke', 'LUK', 'lk lu luk'],
  ['John', 'John', 'JHN', 'jn jhn joh'],
  ['Acts', 'Acts', 'ACT', 'ac act'],
  ['Romans', 'Rom', 'ROM', 'ro rom rm'],
  ['1 Corinthians', '1Cor', '1CO', '1co 1cor'],
  ['2 Corinthians', '2Cor', '2CO', '2co 2cor'],
  ['Galatians', 'Gal', 'GAL', 'ga gal'],
  ['Ephesians', 'Eph', 'EPH', 'ep eph ephes'],
  ['Philippians', 'Phil', 'PHP', 'php phil pp'],
  ['Colossians', 'Col', 'COL', 'co col'],
  ['1 Thessalonians', '1Thess', '1TH', '1th 1thes 1thess'],
  ['2 Thessalonians', '2Thess', '2TH', '2th 2thes 2thess'],
  ['1 Timothy', '1Tim', '1TI', '1ti 1tim 1tm'],
  ['2 Timothy', '2Tim', '2TI', '2ti 2tim 2tm'],
  ['Titus', 'Titus', 'TIT', 'ti tit'],
  ['Philemon', 'Phlm', 'PHM', 'phm phlm philem'],
  ['Hebrews', 'Heb', 'HEB', 'he heb'],
  ['James', 'Jas', 'JAS', 'jas jm ja'],
  ['1 Peter', '1Pet', '1PE', '1pe 1pet 1pt 1p'],
  ['2 Peter', '2Pet', '2PE', '2pe 2pet 2pt 2p'],
  ['1 John', '1John', '1JN', '1jn 1jo 1joh 1jhn'],
  ['2 John', '2John', '2JN', '2jn 2jo 2joh 2jhn'],
  ['3 John', '3John', '3JN', '3jn 3jo 3joh 3jhn'],
  ['Jude', 'Jude', 'JUD', 'jud jd'],
  ['Revelation', 'Rev', 'REV', 're rev rv revelations apocalypse']
];

export const CANON: CanonBook[] = RAW.map(([name, osis, usfm, abbr], i) => ({ number: i + 1, name, osis, usfm, abbreviations: abbr.split(' ') }));

/** Lower case, no spaces or punctuation; "I John", "First John" and "1st John" become "1john". */
export function normalizeBookName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^\s*(iii|3rd|third)\b\.?/, '3')
    .replace(/^\s*(ii|2nd|second)\b\.?/, '2')
    .replace(/^\s*(i|1st|first)\b\.?(?=\s*\p{L})/u, '1')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

const byOsis = new Map(CANON.map((b) => [b.osis.toLowerCase(), b]));
const byUsfm = new Map(CANON.map((b) => [b.usfm.toLowerCase(), b]));
const byName = new Map(CANON.map((b) => [normalizeBookName(b.name), b]));

/** The canonical book for an OSIS id, USFM id or English name, if any. */
export function canonBook(idOrName: string): CanonBook | undefined {
  const k = idOrName.trim().toLowerCase();
  return byOsis.get(k) ?? byUsfm.get(k) ?? byName.get(normalizeBookName(idOrName)) ?? CANON.find((b) => b.abbreviations.includes(normalizeBookName(idOrName)));
}
