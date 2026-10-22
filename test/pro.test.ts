import { readFileSync } from 'node:fs';
import { create, toBinary } from '@bufbuild/protobuf';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { PlaylistDocumentSchema } from '../src/shared/gen/playlist_pb';
import { parsePlaylistFile, playlistViews } from '../src/shared/pro/playlist';
import {
  createPresentation,
  parseLyrics,
  parsePresentation,
  presentationToDeck,
  serializePresentation
} from '../src/shared/pro/presentation';
import { plainTextToRtf, rtfToPlainText } from '../src/shared/pro/rtf';

describe('rtf', () => {
  it('round-trips plain text including escapes and unicode', () => {
    const text = 'Amazing grace {how} sweet\\the sound\nThat saved a wretch — like me ♥ 🎵';
    expect(rtfToPlainText(plainTextToRtf(text))).toBe(text);
  });

  it('reads Cocoa-style RTF as ProPresenter writes it', () => {
    const rtf =
      '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639\n{\\fonttbl\\f0\\fnil\\fcharset0 HelveticaNeue;}\n' +
      '{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n' +
      '\\pard\\pardirnatural\\qc\\partightenfactor0\n\n\\f0\\fs120 \\cf1 How great \\\nis our God\\\'92s love}';
    expect(rtfToPlainText(rtf)).toBe('How great \nis our God’s love');
  });
});

describe('lyrics', () => {
  it('splits groups and slides', () => {
    expect(parseLyrics('[Verse 1]\nA\nB\n\nC\n\n[Chorus]\nD')).toEqual([
      { group: 'Verse 1', slides: ['A\nB', 'C'] },
      { group: 'Chorus', slides: ['D'] }
    ]);
  });
});

describe('presentation', () => {
  it('creates, serializes and reads back a presentation', () => {
    const sections = parseLyrics('[Verse]\nLine one\nLine two\n\n[Chorus]\nSing');
    const bytes = serializePresentation(createPresentation('Test Song', sections));
    const deck = presentationToDeck(parsePresentation(bytes), 'x');
    expect(deck.name).toBe('Test Song');
    expect(deck.slides.map((s) => [s.groupName, s.text])).toEqual([
      ['Verse', 'Line one\nLine two'],
      ['Chorus', 'Sing']
    ]);
  });

  const fixture = process.env.VESSEL_PRO_FIXTURE;
  // Data Vessel doesn't describe is kept, though it may be written after the parts it does,
  // so a re-saved file has the same size and content but not always the same byte order.
  it.skipIf(!fixture)('keeps everything in a real .pro file when re-saving it', () => {
    const original = new Uint8Array(readFileSync(fixture!));
    const parsed = parsePresentation(original);
    expect(presentationToDeck(parsed, 'x').slides.length).toBeGreaterThan(0);
    const resaved = serializePresentation(parsed);
    expect(resaved.length).toBe(original.length);
    expect(Buffer.from(serializePresentation(parsePresentation(resaved))).equals(Buffer.from(resaved))).toBe(true);
    expect(presentationToDeck(parsePresentation(resaved), 'x').slides.map((s) => s.text)).toEqual(presentationToDeck(parsed, 'x').slides.map((s) => s.text));
  });
});

describe('playlist', () => {
  const doc = create(PlaylistDocumentSchema, {
    rootNode: {
      name: 'Root',
      ChildrenType: {
        case: 'playlists',
        value: {
          playlists: [
            {
              name: 'Sunday',
              ChildrenType: {
                case: 'items',
                value: {
                  items: [
                    { name: 'Welcome', ItemType: { case: 'header', value: {} } },
                    {
                      name: 'Song',
                      ItemType: {
                        case: 'presentation',
                        value: { documentPath: { Storage: { case: 'absoluteString', value: 'file:///Users/x/Song%201.pro' } } }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    }
  });
  const raw = toBinary(PlaylistDocumentSchema, doc);

  it('reads a raw playlist document', () => {
    const views = playlistViews(parsePlaylistFile(raw).document);
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe('Root / Sunday');
    expect(views[0].entries.map((e) => [e.kind, e.documentPath])).toEqual([
      ['header', undefined],
      ['presentation', '/Users/x/Song 1.pro']
    ]);
  });

  it('reads a zipped .proPlaylist', () => {
    const zipped = zipSync({ data: raw, 'Media/bg.jpg': new Uint8Array([1, 2, 3]) });
    const file = parsePlaylistFile(zipped);
    expect(playlistViews(file.document)[0].entries).toHaveLength(2);
    expect(Object.keys(file.bundled)).toEqual(['Media/bg.jpg']);
  });
});
