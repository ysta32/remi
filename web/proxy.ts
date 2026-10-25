// Gate for the operator control panel, and for dev tools reached from outside this machine.
// /control and /api/control/* need the remi_control cookie (sha-256 of CONTROL_PASSCODE),
// except the sign-in page and its endpoint. /api/dev/* (reset, seed, reprocess) is open on
// localhost as before, but through the public tunnel it needs the same cookie.
import { NextResponse, type NextRequest } from 'next/server';

const CONTROL_COOKIE = 'remi_control'; // same name as lib/server/control-auth.ts

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const isLocal = (req: NextRequest) => {
  const host = (req.headers.get('host') ?? '').split(':')[0];
  return (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') && !req.headers.get('cf-connecting-ip');
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/control/login' || pathname === '/api/control/login') return NextResponse.next();
  if (pathname.startsWith('/api/dev/') && isLocal(req)) return NextResponse.next();

  const passcode = process.env.CONTROL_PASSCODE || '';
  const ok = passcode !== '' && req.cookies.get(CONTROL_COOKIE)?.value === (await sha256(passcode));
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.redirect(new URL('/control/login', req.url));
}

export const config = { matcher: ['/control/:path*', '/api/control/:path*', '/api/dev/:path*'] };
