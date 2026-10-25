// Photo upload storage: jpeg/png only (by magic bytes), <= 8 MB, random filenames under UPLOAD_DIR.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ImageMime = 'image/jpeg' | 'image/png';

export function sniffImage(buf: Uint8Array): ImageMime | 'heic' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return 'image/png';
  // ISO-BMFF "ftyp" box with a HEIF brand.
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...buf.slice(8, 12));
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif'].includes(brand)) return 'heic';
  }
  return null;
}

/** Writes bytes to a random filename; returns the path relative to UPLOAD_DIR. */
export function saveUpload(buf: Uint8Array, mime: ImageMime): string {
  const dir = config.uploadDir;
  fs.mkdirSync(dir, { recursive: true });
  const rel = `${randomUUID()}${mime === 'image/png' ? '.png' : '.jpg'}`;
  fs.writeFileSync(path.join(dir, rel), buf);
  return rel;
}

/** Absolute path for a stored relative file path; refuses anything that escapes UPLOAD_DIR. */
export function resolveUpload(rel: string): string | null {
  const root = path.resolve(config.uploadDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export function readUpload(rel: string): Buffer | null {
  const abs = resolveUpload(rel);
  if (!abs) return null;
  try {
    return fs.readFileSync(abs);
  } catch {
    return null;
  }
}

export function deleteUpload(rel: string): void {
  const abs = resolveUpload(rel);
  if (abs) fs.rmSync(abs, { force: true });
}

export function emptyUploadDir(): void {
  const dir = config.uploadDir;
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
}

export function imageResponse(rel: string, mime: string): Response | null {
  const buf = readUpload(rel);
  if (!buf) return null;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { 'Content-Type': mime, 'Content-Length': String(buf.length), 'Cache-Control': 'private, max-age=60' },
  });
}
