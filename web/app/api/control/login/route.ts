import { NextResponse } from 'next/server';
import { z } from 'zod';
import { error, parseBody } from '@/lib/server/http';
import { CONTROL_COOKIE, controlToken, passcodeMatches, tooManyTries } from '@/lib/server/control-auth';
import { config } from '@/lib/config';

export const runtime = 'nodejs';

const schema = z.object({ passcode: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!config.controlPasscode) return error(503, 'the control panel is closed: CONTROL_PASSCODE is not set');
  const client = req.headers.get('cf-connecting-ip') ?? 'local';
  if (tooManyTries(client)) return error(429, 'too many tries; wait a minute');
  const body = await parseBody(req, schema);
  if (body instanceof Response) return body;
  if (!passcodeMatches(body.passcode)) return error(401, 'wrong passcode');
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONTROL_COOKIE, controlToken(config.controlPasscode), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.headers.get('x-forwarded-proto') === 'https' || new URL(req.url).protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(CONTROL_COOKIE);
  return res;
}
