// Public-domain Bibles Vessel can download, from eBible.org (the World English
// Bible's publisher). Each is a zipped USFX file; it's read once and kept offline.

export interface FreeBible {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  url: string;
  /** Download size in MB, for the button. */
  sizeMb: number;
  note: string;
}

export const FREE_BIBLES: FreeBible[] = [
  {
    id: 'web',
    name: 'World English Bible',
    abbreviation: 'WEB',
    language: 'en',
    url: 'https://ebible.org/Scriptures/eng-web_usfx.zip',
    sizeMb: 3.3,
    note: 'A modern English translation, free to use with no restrictions.'
  },
  {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'en',
    url: 'https://ebible.org/Scriptures/eng-kjv2006_usfx.zip',
    sizeMb: 2.5,
    note: 'Public domain, except in the United Kingdom, where the Crown holds the rights.'
  },
  {
    id: 'asv',
    name: 'American Standard Version',
    abbreviation: 'ASV',
    language: 'en',
    url: 'https://ebible.org/Scriptures/eng-asv_usfx.zip',
    sizeMb: 2.9,
    note: 'The 1901 revision of the King James Version, in the public domain.'
  }
];
