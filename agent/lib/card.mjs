// Video frames for show_photo: the family photo, fitted on a warm backdrop with its
// caption underneath; a caption-only card when the image can't be loaded. Rendered once
// per photo with @napi-rs/canvas, then a small "Remi is talking" pulse is painted per
// frame so the picture never looks frozen. Same 640x360 RGBA as face.mjs.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { WIDTH, HEIGHT } from '../face.mjs';

const BG = '#1d3340';
const INK = '#fbf6ec';
const SOFT = '#c9d8d2';
const FONT = ['Avenir Next', 'Helvetica Neue', 'Arial'].find((f) => GlobalFonts.has(f)) ?? 'sans-serif';

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w; } else line = next;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** @returns {Promise<Uint8Array>} WIDTH*HEIGHT*4 RGBA */
export async function renderPhotoCard({ image, caption, people }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  let img = null;
  if (image) { try { img = await loadImage(image); } catch { img = null; } }

  const captionH = 64;
  if (img) {
    const boxW = WIDTH - 32, boxH = HEIGHT - captionH - 24;
    const s = Math.min(boxW / img.width, boxH / img.height);
    const w = Math.round(img.width * s), h = Math.round(img.height * s);
    const x = Math.round((WIDTH - w) / 2), y = 16 + Math.round((boxH - h) / 2);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 6, y - 6, w + 12, h + 12);       // print border
    ctx.drawImage(img, x, y, w, h);
    ctx.fillStyle = INK;
    ctx.font = `600 24px "${FONT}"`;
    ctx.textAlign = 'center';
    const [line] = wrap(ctx, caption, WIDTH - 48, 1);
    ctx.fillText(line ?? '', WIDTH / 2, HEIGHT - 30);
  } else {
    // No image: the caption is the picture.
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = `600 34px "${FONT}"`;
    const lines = wrap(ctx, caption, WIDTH - 96, 3);
    const top = HEIGHT / 2 - (lines.length * 44) / 2 + 22;
    lines.forEach((l, i) => ctx.fillText(l, WIDTH / 2, top + i * 44));
    if (people) {
      ctx.fillStyle = SOFT;
      ctx.font = `400 20px "${FONT}"`;
      ctx.fillText(people, WIDTH / 2, top + lines.length * 44 + 8);
    }
  }
  const data = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** Copy of base with a three-dot pulse in the corner while Remi talks. */
export function withPulse(base, tick, speaking) {
  const out = new Uint8Array(base);
  if (!speaking) return out;
  const cy = 22;
  for (let d = 0; d < 3; d++) {
    const cx = WIDTH - 52 + d * 16;
    const r = 4 + 2.5 * Math.abs(Math.sin(tick * 0.5 + d));
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        const i = (y * WIDTH + x) * 4;
        out[i] = 141; out[i + 1] = 224; out[i + 2] = 196; out[i + 3] = 255;
      }
    }
  }
  return out;
}
