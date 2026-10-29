import { decode, encode, type Action } from './garden';

/**
 * A garden as a link: the saved stroke log, deflated and written into the URL's #fragment (which
 * never leaves the phone for the server), plus the moment it was shared (time of day, weather).
 *   #g=<data>&t=<0–1000>&w=<weather>
 * Data starting "z" is deflate-raw + base64url; "u" is plain base64url (no CompressionStream).
 */

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes.slice()]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The garden's data for a link (compressed where the browser can). */
export async function packGarden(actions: Action[]): Promise<string> {
  const raw = new TextEncoder().encode(encode(actions));
  if (typeof CompressionStream === 'undefined') return 'u' + toBase64Url(raw);
  return 'z' + toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')));
}

export async function unpackGarden(data: string): Promise<Action[]> {
  const bytes = fromBase64Url(data.slice(1));
  const raw = data[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return decode(new TextDecoder().decode(raw));
}

export interface SharedLink {
  data: string;
  /** Time of day 0–1, and weather, as the sharer saw it. */
  time: number | null;
  weather: string | null;
}

/** A garden in this page's address, if it was opened from a share link. */
export function sharedInAddress(): SharedLink | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const data = params.get('g');
  if (!data || data.length < 2) return null;
  const t = params.get('t');
  return { data, time: t !== null && isFinite(+t) ? Math.min(1, Math.max(0, +t / 1000)) : null, weather: params.get('w') };
}

/** The address of this garden, to send to someone. */
export function linkFor(data: string, time: number, weather: string): string {
  return `${location.origin}${location.pathname}#g=${data}&t=${Math.round(time * 1000)}&w=${weather}`;
}

/** Back to the plain address (no shared garden in it), without reloading. */
export function clearAddress() {
  history.replaceState(null, '', location.pathname + location.search);
}
