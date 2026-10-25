// Mock FaceTime: a local stand-in for the Chert Mac, for testing the agent in a browser.
//
// It plays the parts chert dev and the Mac play on a real call:
//   - opens a waiting room with the agent dispatched by name before any call (prewarm),
//   - lets the browser join that room as the caller, chert-bridge-<callId>,
//   - sets {"chert_bridge_ready": true} in the room metadata, as chert dev does at bridge_ready.
// The browser page enforces the Mac's rules (10 s silence timeout, one audio publisher).
//
// Run with `npm run mock` (reads .env.local). Listens on 127.0.0.1 only. Never logs env values.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessToken, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.MOCK_FACETIME_PORT || 5175);
const missing = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'AGENT_NAME']
  .filter(k => !process.env[k] || process.env[k].includes('YOUR_'));
if (missing.length) {
  console.error(`[mock-facetime] missing in agent/.env.local: ${missing.join(', ')}`);
  process.exit(1);
}
const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, AGENT_NAME } = process.env;
const host = LIVEKIT_URL.replace(/^ws/, 'http');
const rooms = new RoomServiceClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const dispatch = new AgentDispatchClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const AGENT_KIND = 4; // ParticipantInfo_Kind.AGENT in @livekit/protocol

// room name -> { callId, called }, for rooms this server opened.
const calls = new Map();

const STATIC = {
  '/': ['public/index.html', 'text/html'],
  '/app.js': ['public/app.js', 'text/javascript'],
  '/style.css': ['public/style.css', 'text/css'],
  '/livekit-client.mjs': ['../node_modules/livekit-client/dist/livekit-client.esm.mjs', 'text/javascript'],
};

const routes = {
  // Open a waiting room and dispatch the agent into it, as chert dev does before a call.
  'POST /api/rooms': async () => {
    // Like chert dev, keep one waiting room: close any earlier room nobody called
    // (a reloaded or killed page), so its agent job ends instead of waiting forever.
    await Promise.allSettled([...calls].filter(([, c]) => !c.called).map(([name]) => closeRoom(name)));
    const callId = `mock-${randomUUID()}`;
    const room = `mock-facetime-${callId}`;
    await rooms.createRoom({ name: room, emptyTimeout: 600, departureTimeout: 20 });
    await dispatch.createDispatch(room, AGENT_NAME);
    calls.set(room, { callId, called: false });
    log(`waiting room ${room} opened, ${AGENT_NAME} dispatched`);
    return { room, callId, agentName: AGENT_NAME };
  },
  // Who is in the room: the page waits for the agent before enabling the call button.
  'GET /api/rooms/:room': async ({ room }) => {
    const people = await rooms.listParticipants(room);
    return {
      participants: people.map(p => ({
        identity: p.identity,
        agent: p.kind === AGENT_KIND,
        audioTracks: p.tracks.filter(t => t.type === 0 && !t.muted).length, // TrackType.AUDIO
      })),
    };
  },
  // A join token for the caller. The identity matches the Chert bridge's.
  'POST /api/rooms/:room/token': async ({ room }) => {
    const callId = needCall(room);
    calls.get(room).called = true;
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: `chert-bridge-${callId}`, ttl: '1h' });
    at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
    return { url: LIVEKIT_URL, token: await at.toJwt(), identity: `chert-bridge-${callId}` };
  },
  // FaceTime is ready: the same metadata chert dev writes at bridge_ready.
  'POST /api/rooms/:room/bridge-ready': async ({ room }) => {
    const callId = needCall(room);
    const metadata = { chert_call: callId, chert_bridge_ready: true, at: new Date().toISOString() };
    await rooms.updateRoomMetadata(room, JSON.stringify(metadata));
    log(`call_bridge_ready ${callId}`);
    return metadata;
  },
  // Close a waiting room nobody called (page closed or reloaded). The agent's job
  // ends with no caller, which is the prewarm path chert doctor also exercises.
  'POST /api/rooms/:room/close': async ({ room }) => {
    await closeRoom(room);
    return { ok: true };
  },
  // The page reports how a call ended, so the terminal has the same record.
  'POST /api/rooms/:room/ended': async ({ room }, body) => {
    log(`call_ended ${calls.get(room)?.callId ?? room}: ${String(body?.reason ?? 'unknown').slice(0, 80)}`);
    calls.delete(room);
    return { ok: true };
  },
};

function needCall(room) {
  if (!calls.has(room)) throw Object.assign(new Error('unknown room; open a new waiting room'), { status: 404 });
  return calls.get(room).callId;
}

async function closeRoom(room) {
  if (!calls.get(room) || calls.get(room).called) return;
  calls.delete(room);
  await rooms.deleteRoom(room).catch(() => {});
  log(`waiting room ${room} closed without a call`);
}

function log(line) {
  console.log(`[mock-facetime] ${new Date().toLocaleTimeString()} ${line}`);
}

function match(method, path) {
  for (const [key, handler] of Object.entries(routes)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const names = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'))}$`);
    const hit = path.match(re);
    if (hit) return [handler, Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(hit[i + 1])]))];
  }
  return [null, null];
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    const file = req.method === 'GET' && STATIC[path];
    if (file) {
      res.writeHead(200, { 'content-type': `${file[1]}; charset=utf-8`, 'cache-control': 'no-store' });
      return res.end(await readFile(join(HERE, file[0])));
    }
    const [handler, params] = match(req.method, path);
    if (!handler) { res.writeHead(404); return res.end('not found'); }
    const out = await handler(params, await readJson(req));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  } catch (err) {
    const status = err.status ?? 502;
    log(`${req.method} ${path} failed: ${err.message}`);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

async function shutdown() {
  // Only unused waiting rooms: a room with a call in it ends when the caller leaves.
  await Promise.allSettled([...calls].filter(([, c]) => !c.called).map(([room]) => rooms.deleteRoom(room)));
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '127.0.0.1', () => {
  log(`open http://localhost:${PORT} — calls dispatch agent "${AGENT_NAME}". Keep npm start running in another terminal.`);
});
