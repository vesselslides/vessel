// Bibles Vessel can download, from eBible.org (the World English Bible's
// publisher). Each is a zipped USFX file; it's read once and kept offline.
// All are free to use and show: public domain, or Creative Commons
// Attribution-ShareAlike 4.0 (those carry a credit line, kept with the Bible).

export interface FreeBible {
  id: string;
  name: string;
  abbreviation: string;
  /** ISO 639-3 code, as eBible uses. */
  language: string;
  /** The language's name in English, for the language list. */
  languageName: string;
  url: string;
  /** Download size in MB, for the button. */
  sizeMb: number;
  note: string;
  /** For openly licensed (not public-domain) translations: the credit their licence asks for. */
  credit?: string;
}

const ccBySa = (who: string): string => `${who}. Creative Commons Attribution-ShareAlike 4.0.`;
const url = (id: string): string => `https://ebible.org/Scriptures/${id}_usfx.zip`;

type Entry = Omit<FreeBible, 'url' | 'id'> & { ebible: string; id?: string };

const ENTRIES: Entry[] = [
  // English
  { ebible: 'eng-web', id: 'web', name: 'World English Bible', abbreviation: 'WEB', language: 'eng', languageName: 'English', sizeMb: 3.3, note: 'A modern English translation, free to use with no restrictions.' },
  { ebible: 'engbsb', name: 'Berean Standard Bible', abbreviation: 'BSB', language: 'eng', languageName: 'English', sizeMb: 2.9, note: 'A modern, readable translation, placed in the public domain in 2023.' },
  { ebible: 'eng-kjv2006', id: 'kjv', name: 'King James Version', abbreviation: 'KJV', language: 'eng', languageName: 'English', sizeMb: 2.5, note: 'Public domain, except in the United Kingdom, where the Crown holds the rights.' },
  { ebible: 'englsv', name: 'Literal Standard Version', abbreviation: 'LSV', language: 'eng', languageName: 'English', sizeMb: 2.7, note: 'A close, word-for-word modern translation.', credit: ccBySa('Literal Standard Version © 2020 Covenant Press') },
  { ebible: 'engwebpb', name: 'World English Bible (British Edition)', abbreviation: 'WEBBE', language: 'eng', languageName: 'English', sizeMb: 3.2, note: 'The World English Bible with British spelling and the Deuterocanon.' },
  { ebible: 'eng-asv', id: 'asv', name: 'American Standard Version', abbreviation: 'ASV', language: 'eng', languageName: 'English', sizeMb: 2.9, note: 'The 1901 revision of the King James Version, in the public domain.' },
  { ebible: 'engDRA', name: 'Douay-Rheims Bible', abbreviation: 'DRA', language: 'eng', languageName: 'English', sizeMb: 2.8, note: 'The traditional Catholic English Bible (1899), with the Deuterocanon.' },
  { ebible: 'enggnv', name: 'Geneva Bible 1599', abbreviation: 'GNV', language: 'eng', languageName: 'English', sizeMb: 1.4, note: 'The Reformation-era English Bible.' },
  { ebible: 'engylt', name: 'Young’s Literal Translation', abbreviation: 'YLT', language: 'eng', languageName: 'English', sizeMb: 1.4, note: 'A very literal translation (1898).' },
  { ebible: 'engDBY', name: 'Darby Translation', abbreviation: 'DBY', language: 'eng', languageName: 'English', sizeMb: 2.6, note: 'J. N. Darby’s literal translation (1890).' },
  { ebible: 'engBBE', name: 'Bible in Basic English', abbreviation: 'BBE', language: 'eng', languageName: 'English', sizeMb: 2.7, note: 'Simple English with a small vocabulary (1965).' },
  // Languages of the Philippines
  { ebible: 'tglulb', name: 'Tagalog Bible (Unlocked Literal)', abbreviation: 'TULB', language: 'tgl', languageName: 'Tagalog', sizeMb: 1.6, note: 'A modern Tagalog translation.', credit: ccBySa('Tagalog Unlocked Literal Bible © 2018 Door43 World Missions Community') },
  { ebible: 'cebocb', name: 'Ang Pulong sa Dios', abbreviation: 'APSD', language: 'ceb', languageName: 'Cebuano', sizeMb: 1.6, note: 'A modern Cebuano translation from Biblica.', credit: ccBySa('Biblica® Open Ang Pulong sa Dios © 2009, 2010, 2014, 2024 Biblica, Inc.') },
  { ebible: 'cebulb', name: 'Cebuano Bible (Unlocked Literal)', abbreviation: 'CULB', language: 'ceb', languageName: 'Cebuano', sizeMb: 1.5, note: 'A literal Cebuano translation.', credit: ccBySa('Cebuano Unlocked Literal Bible © 2019 Door43 World Missions Community') },
  { ebible: 'iloulb', name: 'Ilocano Bible (Unlocked Literal)', abbreviation: 'IULB', language: 'ilo', languageName: 'Ilocano', sizeMb: 1.5, note: 'A literal Ilocano translation.', credit: ccBySa('Ilocano Unlocked Literal Bible © 2019 Door43 World Missions Community') },
  { ebible: 'hil', name: 'Ang Pulong Sang Dios', abbreviation: 'APSDH', language: 'hil', languageName: 'Hiligaynon', sizeMb: 1.6, note: 'A modern Hiligaynon translation from Biblica.', credit: ccBySa('Biblica® Libre Ang Pulong Sang Dios © 1996, 2006, 2011, 2022 Biblica, Inc.') },
  // Other languages
  { ebible: 'spaRV1909', name: 'Reina-Valera 1909', abbreviation: 'RV1909', language: 'spa', languageName: 'Spanish', sizeMb: 2.3, note: 'The classic Spanish Bible.' },
  { ebible: 'spabes', name: 'La Biblia en Español Sencillo', abbreviation: 'BES', language: 'spa', languageName: 'Spanish', sizeMb: 2.2, note: 'Modern, simple Spanish.' },
  { ebible: 'porbrbsl', name: 'Bíblia Livre para Todos', abbreviation: 'BLT', language: 'por', languageName: 'Portuguese', sizeMb: 1.9, note: 'A modern Portuguese translation.' },
  { ebible: 'fraLSG', name: 'Louis Segond 1910', abbreviation: 'LSG', language: 'fra', languageName: 'French', sizeMb: 3.3, note: 'The classic French Protestant Bible.' },
  { ebible: 'deu1912', name: 'Lutherbibel 1912', abbreviation: 'LUT1912', language: 'deu', languageName: 'German', sizeMb: 2.4, note: 'Luther’s Bible in its 1912 revision.' },
  { ebible: 'ita1927', name: 'Riveduta 1927', abbreviation: 'RIV', language: 'ita', languageName: 'Italian', sizeMb: 1.5, note: 'The Italian Riveduta (Luzzi) Bible.' },
  { ebible: 'nld', name: 'Statenvertaling (1917)', abbreviation: 'SV1917', language: 'nld', languageName: 'Dutch', sizeMb: 1.5, note: 'The Dutch States Bible, 1917 spelling.' },
  { ebible: 'russyn', name: 'Синодальный перевод', abbreviation: 'SYN', language: 'rus', languageName: 'Russian', sizeMb: 1.7, note: 'The Russian Synodal Bible.' },
  { ebible: 'ukr1871', name: 'Біблія Куліша', abbreviation: 'UKR1871', language: 'ukr', languageName: 'Ukrainian', sizeMb: 1.7, note: 'The Ukrainian Bible by P. Kulish.' },
  { ebible: 'cmn-cu89s', name: '和合本 (简体)', abbreviation: 'CUVS', language: 'cmn', languageName: 'Chinese', sizeMb: 1.5, note: 'The Chinese Union Version, simplified characters.' },
  { ebible: 'cmn-cu89t', name: '和合本 (繁體)', abbreviation: 'CUVT', language: 'cmn', languageName: 'Chinese', sizeMb: 1.5, note: 'The Chinese Union Version, traditional characters.' },
  { ebible: 'kor', name: '개역한글 1910', abbreviation: 'KOR1910', language: 'kor', languageName: 'Korean', sizeMb: 1.5, note: 'The Korean Bible of 1910.' },
  { ebible: 'jpnm', name: '口語訳 自由聖書', abbreviation: 'JFB', language: 'jpn', languageName: 'Japanese', sizeMb: 1.6, note: 'The Japanese Freedom Bible.' },
  { ebible: 'vie1934', name: 'Kinh Thánh 1923', abbreviation: 'VIE1923', language: 'vie', languageName: 'Vietnamese', sizeMb: 1.5, note: 'The classic Vietnamese Bible.' }
];

export const FREE_BIBLES: FreeBible[] = ENTRIES.map(({ ebible, id, ...rest }) => ({ ...rest, id: id ?? ebible.toLowerCase(), url: url(ebible) }));

/** Languages in the list, in the list's order: English first, then the Philippines, then the rest. */
export const FREE_BIBLE_LANGUAGES: string[] = [...new Set(FREE_BIBLES.map((b) => b.languageName))];
