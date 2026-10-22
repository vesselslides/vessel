import { create } from '@bufbuild/protobuf';
import { URL_Platform, URLSchema, type URL } from '../gen/common_pb';

/** Local path for a file:// URL string; other strings are returned unchanged. */
export function fileUrlToPath(s: string): string {
  if (!s.startsWith('file:')) return s;
  // file:///C:/x on Windows, file:///Users/x on macOS; file://localhost/ is also seen.
  const path = decodeURIComponent(s.replace(/^file:\/\/(localhost)?/, ''));
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

/** Best-effort local file path for a ProPresenter URL. */
export function urlToPath(url: URL | undefined): string {
  if (!url) return '';
  if (url.Storage.case === 'absoluteString') return fileUrlToPath(url.Storage.value);
  if (url.RelativeFilePath.case === 'local') return url.RelativeFilePath.value.path;
  if (url.RelativeFilePath.case === 'external') return url.RelativeFilePath.value.path;
  if (url.Storage.case === 'relativePath') return url.Storage.value;
  return '';
}

/** A file URL for a local path, the way ProPresenter writes absolute media references. */
export function pathToUrl(path: string): URL {
  const windows = /^[A-Za-z]:[\\/]/.test(path);
  const normalized = (windows ? '/' : '') + path.replace(/\\/g, '/');
  const encoded = normalized
    .split('/')
    .map((part, i) => (windows && i === 1 ? part : encodeURIComponent(part)))
    .join('/');
  return create(URLSchema, {
    Storage: { case: 'absoluteString', value: `file://${encoded}` },
    platform: windows ? URL_Platform.WIN32 : URL_Platform.MACOS
  });
}
