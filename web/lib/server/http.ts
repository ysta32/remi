// Shared response helpers for route handlers. Error shape: {"error": "...", "issues"?: [...]}.
import { timingSafeEqual } from 'node:crypto';
import type { ZodError, ZodType } from 'zod';
import { config } from '../config';

export const json = (body: unknown, status = 200): Response => Response.json(body, { status });
export const noContent = (): Response => new Response(null, { status: 204 });
export const error = (status: number, message: string, issues?: unknown[]): Response =>
  Response.json(issues ? { error: message, issues } : { error: message }, { status });
export const notFound = (what = 'not found'): Response => error(404, what);
export const badRequest = (err: ZodError): Response => error(400, 'invalid request', err.issues);

/** Parse a JSON body with a zod schema. Returns the data, or a 400 Response to return as-is. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return error(400, 'body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : badRequest(parsed.error);
}

/** Bearer-token check for /api/agent/*. Returns a 401 Response when unauthorized, else null. */
export function requireAgentAuth(req: Request): Response | null {
  const expected = config.agentApiToken;
  const header = req.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  // Compare byte lengths (not string lengths): timingSafeEqual throws on unequal byte lengths,
  // e.g. a non-ASCII token with the same character count.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length) return error(401, 'unauthorized');
  return timingSafeEqual(a, b) ? null : error(401, 'unauthorized');
}

/** 404 unless DEV_TOOLS=1. */
export function requireDevTools(): Response | null {
  return config.devTools ? null : notFound();
}
