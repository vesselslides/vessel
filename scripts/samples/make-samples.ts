// Makes Vessel's sample songs, presentations and service playlist, using
// Vessel's own code so they're exactly what it would save. Run after
// make_media.py (the media files must exist):
//
//   npx vitest run -c scripts/samples/vitest.config.ts
//
// Media and songs are written with placeholder paths under SAMPLES_ROOT;
// main/samples.ts points them at where they're installed on first start.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseBibleXml } from '../../src/shared/bible/formats';
import { lookUp } from '../../src/shared/bible/reference';
import { passageToPresentation } from '../../src/shared/bible/slides';
import { withSongInfo } from '../../src/shared/ccli';
import { decodeText, zipFiles } from '../../src/shared/import/documents';
import { backgroundForPath } from '../../src/shared/pro/background';
import { addSlideImage, applyLyrics, applyTheme, setPresentationTimer, setSlideBackground } from '../../src/shared/pro/edit';
import { createPresentation, parseLyrics, serializePresentation, uuidOf } from '../../src/shared/pro/presentation';
import { encodeService, newServiceId, type ServiceItem } from '../../src/shared/pro/service';
import { SAMPLES_ROOT, type SamplesManifest } from '../../src/shared/samples';
import { BUILT_IN_THEMES } from '../../src/shared/theme';
import type { Presentation } from '../../src/shared/gen/presentation_pb';

const OUT = join(__dirname, '../../resources/samples');
const media = (file: string): string => `${SAMPLES_ROOT}/media/${file}`;
const theme = (id: string) => BUILT_IN_THEMES.find((t) => t.id === id)!;

/** A song from lyrics text, styled, with its background on every slide and its details for the copyright line. */
function song(name: string, lyrics: string, opts: { theme: string; background: string; author: string; year: number }): Presentation {
  let p = applyLyrics(createPresentation(name, []), lyrics);
  p = applyTheme(p, theme(opts.theme));
  const bg = backgroundForPath(media(opts.background))!;
  for (const cue of p.cues) p = setSlideBackground(p, uuidOf(cue.uuid), bg);
  return withSongInfo(p, { title: name, authors: opts.author, publisher: 'Public domain', year: opts.year, songNumber: 0, display: false });
}

// ---- Public-domain hymns --------------------------------------------------------

const HYMNS: Array<{ file: string; p: Presentation }> = [
  {
    file: 'Holy, Holy, Holy',
    p: song(
      'Holy, Holy, Holy',
      `[Verse 1]
Holy, holy, holy! Lord God Almighty!
Early in the morning our song shall rise to Thee

Holy, holy, holy! Merciful and mighty!
God in three Persons, blessèd Trinity!

[Verse 2]
Holy, holy, holy! All the saints adore Thee,
Casting down their golden crowns around the glassy sea

Cherubim and seraphim falling down before Thee,
Which wert, and art, and evermore shalt be

[Verse 3]
Holy, holy, holy! Though the darkness hide Thee,
Though the eye of sinful man Thy glory may not see

Only Thou art holy; there is none beside Thee,
Perfect in power, in love, and purity

[Verse 4]
Holy, holy, holy! Lord God Almighty!
All Thy works shall praise Thy name, in earth, and sky, and sea

Holy, holy, holy! Merciful and mighty!
God in three Persons, blessèd Trinity!`,
      { theme: 'classic', background: 'Soft Light.mp4', author: 'Reginald Heber', year: 1826 }
    )
  },
  {
    file: 'Amazing Grace',
    p: song(
      'Amazing Grace',
      `[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!

I once was lost, but now am found;
Was blind, but now I see

[Verse 2]
'Twas grace that taught my heart to fear,
And grace my fears relieved;

How precious did that grace appear
The hour I first believed

[Verse 3]
Through many dangers, toils and snares,
I have already come;

'Tis grace hath brought me safe thus far,
And grace will lead me home

[Verse 4]
The Lord has promised good to me,
His Word my hope secures;

He will my Shield and Portion be,
As long as life endures

[Verse 5]
When we've been there ten thousand years,
Bright shining as the sun,

We've no less days to sing God's praise
Than when we'd first begun`,
      { theme: 'classic', background: 'Dawn.jpg', author: 'John Newton', year: 1779 }
    )
  },
  {
    file: 'Come, Thou Fount of Every Blessing',
    p: song(
      'Come, Thou Fount of Every Blessing',
      `[Verse 1]
Come, Thou Fount of every blessing,
Tune my heart to sing Thy grace;
Streams of mercy, never ceasing,
Call for songs of loudest praise

Teach me some melodious sonnet,
Sung by flaming tongues above;
Praise the mount! I'm fixed upon it,
Mount of Thy redeeming love

[Verse 2]
Here I raise my Ebenezer;
Hither by Thy help I'm come;
And I hope, by Thy good pleasure,
Safely to arrive at home

Jesus sought me when a stranger,
Wandering from the fold of God;
He, to rescue me from danger,
Interposed His precious blood

[Verse 3]
O to grace how great a debtor
Daily I'm constrained to be!
Let Thy goodness, like a fetter,
Bind my wandering heart to Thee

Prone to wander, Lord, I feel it,
Prone to leave the God I love;
Here's my heart, O take and seal it,
Seal it for Thy courts above`,
      { theme: 'lower-third', background: 'Morning Mist.jpg', author: 'Robert Robinson', year: 1758 }
    )
  },
  {
    // The chorus is sung after every verse: the repeats become the "Song order" arrangement.
    file: 'It Is Well with My Soul',
    p: song(
      'It Is Well with My Soul',
      `[Verse 1]
When peace like a river attendeth my way,
When sorrows like sea billows roll;

Whatever my lot, Thou hast taught me to say,
It is well, it is well with my soul

[Chorus]
It is well with my soul,
It is well, it is well with my soul

[Verse 2]
Though Satan should buffet, though trials should come,
Let this blest assurance control,

That Christ has regarded my helpless estate,
And hath shed His own blood for my soul

[Chorus]

[Verse 3]
My sin, oh, the bliss of this glorious thought!
My sin, not in part but the whole,

Is nailed to the cross, and I bear it no more,
Praise the Lord, praise the Lord, O my soul!

[Chorus]

[Verse 4]
And Lord, haste the day when my faith shall be sight,
The clouds be rolled back as a scroll;

The trump shall resound, and the Lord shall descend,
Even so, it is well with my soul

[Chorus]`,
      { theme: 'classic', background: 'Rising Embers.mp4', author: 'Horatio G. Spafford', year: 1873 }
    )
  },
  {
    file: 'Doxology',
    p: song(
      'Doxology',
      `[Doxology]
Praise God, from whom all blessings flow;
Praise Him, all creatures here below;

Praise Him above, ye heavenly host;
Praise Father, Son, and Holy Ghost. Amen.`,
      { theme: 'bold-caps', background: 'Night Sky.jpg', author: 'Thomas Ken', year: 1674 }
    )
  }
];

// ---- Other presentations -----------------------------------------------------------

/** Shown before the service starts, over a slow motion background. */
function beforeTheService(): Presentation {
  let p = applyTheme(createPresentation('Before the Service', parseLyrics('[Welcome]\nWelcome!\nWe’ll begin in a few minutes')), theme('classic'));
  p = setSlideBackground(p, uuidOf(p.cues[0].uuid), backgroundForPath(media('Aurora.mp4'))!);
  p.notes = 'Tip: show the message “We begin in {timer}” (Live panel ▸ Message) with the Stage timer counting down to the start time.';
  return p;
}

/** An announcement loop: each slide moves on by itself after 8 seconds, round and round. */
function announcements(): Presentation {
  let p = createPresentation(
    'Welcome and Announcements',
    parseLyrics(`[Announcements]
Welcome to Your Church
We’re glad you’re here

Coffee and fellowship
in the hall after the service

Kids Church, ages 4 to 11
during the sermon

Small groups meet midweek
Ask at the welcome desk`)
  );
  p = applyTheme(p, theme('bold-caps'));
  const backgrounds = ['Deep Blue.jpg', 'Dawn.jpg', 'Morning Mist.jpg', 'Night Sky.jpg'];
  p.cues.forEach((cue, i) => (p = setSlideBackground(p, uuidOf(cue.uuid), backgroundForPath(media(backgrounds[i % backgrounds.length]))!)));
  p = addSlideImage(p, [uuidOf(p.cues[0].uuid)], media('Your Church Logo.png'), 'top-right');
  return setPresentationTimer(p, 8, true);
}

/** Sermon slides: a title, then the main points. */
function sermon(): Presentation {
  let p = createPresentation(
    'Sermon: Grace That Leads Us Home',
    parseLyrics(`[Title]
Grace That Leads Us Home
Luke 15:11–24

[Points]
1. We all wander
“He went into a far country”

2. The Father watches
“While he was still far off, his father saw him”

3. Grace runs to meet us
“He ran, fell on his neck, and kissed him”`)
  );
  p = applyTheme(p, theme('lower-third'));
  for (const cue of p.cues) p = setSlideBackground(p, uuidOf(cue.uuid), backgroundForPath(media('Deep Blue.jpg'))!);
  return p;
}

/** A Bible reading, made from the World English Bible the samples include. */
function reading(): Presentation {
  const zip = zipFiles(new Uint8Array(readFileSync(join(OUT, 'bible', 'eng-web_usfx.zip'))));
  const [, xml] = [...zip.entries()].filter(([n]) => /\.(xml|usfx)$/i.test(n) && !/metadata/i.test(n)).sort((a, b) => b[1].length - a[1].length)[0];
  const bible = parseBibleXml(decodeText(xml), 'World English Bible');
  const passage = lookUp(bible, 'Luke 15:20-24');
  if (!passage || 'error' in passage) throw new Error('Luke 15:20-24 not found');
  const p = passageToPresentation(
    passage,
    { abbreviation: 'WEB', bookNames: (b) => bible.books[b].name, oneChapter: (b) => bible.books[b].chapters.length === 1 },
    theme('scripture'),
    { versesPerSlide: 1, verseNumbers: true, reference: 'every' }
  );
  p.name = 'Reading: Luke 15:20–24';
  return p;
}

it('makes the sample songs, presentations and service', () => {
  for (const dir of ['songs', 'playlists']) {
    rmSync(join(OUT, dir), { recursive: true, force: true });
    mkdirSync(join(OUT, dir), { recursive: true });
  }
  const files: Array<{ file: string; p: Presentation }> = [
    { file: 'Before the Service', p: beforeTheService() },
    { file: 'Welcome and Announcements', p: announcements() },
    ...HYMNS,
    { file: 'Reading - Luke 15', p: reading() },
    { file: 'Sermon - Grace That Leads Us Home', p: sermon() }
  ];
  for (const { file, p } of files) writeFileSync(join(OUT, 'songs', `${file}.pro`), serializePresentation(p));

  const songPath = (file: string): string => `${SAMPLES_ROOT}/songs/${file}.pro`;
  const header = (name: string, color: string): ServiceItem => ({ id: newServiceId(), kind: 'header', name, color });
  const item = (file: string, name = file): ServiceItem => ({ id: newServiceId(), kind: 'presentation', name, path: songPath(file) });
  const service = {
    name: 'Sample Sunday Service',
    items: [
      header('Before the service', '#5b6476'),
      item('Before the Service'),
      item('Welcome and Announcements'),
      header('Worship', '#c9a227'),
      item('Holy, Holy, Holy'),
      item('Amazing Grace'),
      item('Come, Thou Fount of Every Blessing'),
      header('Word', '#3b82f6'),
      item('Reading - Luke 15', 'Reading: Luke 15:20–24'),
      item('Sermon - Grace That Leads Us Home', 'Sermon: Grace That Leads Us Home'),
      header('Response', '#22a06b'),
      item('It Is Well with My Soul'),
      item('Doxology')
    ]
  };
  writeFileSync(join(OUT, 'playlists', 'Sample Sunday Service.proPlaylist'), encodeService(service));

  const manifest: SamplesManifest = {
    version: 1,
    playlist: 'Sample Sunday Service.proPlaylist',
    media: [
      { file: 'Soft Light.mp4', folder: 'Motion backgrounds', muted: true },
      { file: 'Aurora.mp4', folder: 'Motion backgrounds', muted: true },
      { file: 'Rising Embers.mp4', folder: 'Motion backgrounds', muted: true },
      { file: 'Dawn.jpg', folder: 'Backgrounds' },
      { file: 'Deep Blue.jpg', folder: 'Backgrounds' },
      { file: 'Morning Mist.jpg', folder: 'Backgrounds' },
      { file: 'Night Sky.jpg', folder: 'Backgrounds' },
      { file: 'Before the Service.m4a', folder: 'Audio' },
      { file: 'Prayer Pad.m4a', folder: 'Audio' },
      { file: 'Your Church Logo.png', folder: 'Backgrounds' }
    ],
    logo: 'Your Church Logo.png',
    bible: { file: 'eng-web_usfx.zip', id: 'web' },
    messages: ['We begin in {timer}', 'Welcome! Please take a seat; we’ll start soon.'],
    lowerThirds: [{ title: 'Pastor Sam', subtitle: 'Lead Pastor', color: '#e0a526' }]
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  expect(files).toHaveLength(9);
});
