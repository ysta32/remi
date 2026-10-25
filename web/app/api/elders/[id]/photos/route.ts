import { getSqlite } from '@/db/client';
import { photoView, type PhotoRow } from '@/lib/server/elders';
import { error, json, notFound } from '@/lib/server/http';
import { newId, nowIso } from '@/lib/server/ids';
import { MAX_UPLOAD_BYTES, saveUpload, sniffImage } from '@/lib/server/uploads';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const db = getSqlite();
  if (!db.prepare('SELECT 1 FROM elders WHERE id = ?').get(id)) return notFound('elder not found');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error(400, 'body must be multipart/form-data with a "file" field');
  }
  const file = form.get('file');
  const caption = form.get('caption');
  const people = form.get('people');
  if (!(file instanceof Blob)) return error(400, 'missing "file"');
  if (typeof caption !== 'string' || !caption.trim()) return error(400, 'missing "caption"');
  if (caption.length > 300) return error(400, '"caption" is too long (max 300 characters)');
  if (people !== null && typeof people !== 'string') return error(400, '"people" must be text');
  if (file.size > MAX_UPLOAD_BYTES) return error(413, 'photo is too large (max 8 MB)');

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (kind === 'heic')
    return error(
      415,
      'HEIC photos (the iPhone default) are not supported. Please export the photo as JPEG, or set iPhone Settings > Camera > Formats to "Most Compatible", and upload again.',
    );
  if (!kind) return error(415, 'only JPEG or PNG photos are supported');

  const filePath = saveUpload(buf, kind);
  const row: PhotoRow = {
    id: newId(),
    elder_id: id,
    file_path: filePath,
    mime: kind,
    caption: caption.trim(),
    people: (people ?? '').trim().slice(0, 300),
    last_shown_at: null,
    is_simulated: 0,
    created_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO photos (id, elder_id, file_path, mime, caption, people, last_shown_at, is_simulated, created_at)
     VALUES (@id, @elder_id, @file_path, @mime, @caption, @people, @last_shown_at, @is_simulated, @created_at)`,
  ).run(row);
  return json(photoView(row), 201);
}
