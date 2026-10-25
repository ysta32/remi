// Full-screen avatar. The Chert Mac shows the speaking participant's video "fit" inside a
// landscape (>=1280x720) window, and LemonSlice only renders 2x3 / 9x16 / 1x1, so its own
// track always has bars. Here Remi becomes the one participant with audio and video again:
//
//   video  Remi subscribes to the avatar's video, crops it to 16:9 (zoomed on the face) and
//          publishes that as its own camera.
//   audio  Remi's voice still streams to the avatar (it animates from it). A copy of each
//          spoken segment is held back and played from Remi's own audio track when the
//          avatar reports it started that segment (lk.playback_started), so lips and voice
//          start together. The avatar's own audio track is muted server-side, so the Mac
//          sees exactly one participant publishing audio.
//
// AVATAR_FILL=1 turns this on; otherwise the plain LemonSlice track (with bars) is used. AVATAR_CROP_Y (0..1, default
// 0.06) moves the crop window down the avatar's picture.
import { voice } from '@livekit/agents';
import {
  AudioSource, LocalAudioTrack, LocalVideoTrack, RoomEvent, TrackKind, TrackPublishOptions, TrackSource,
  VideoBufferType, VideoFrame, VideoSource, VideoStream,
} from '@livekit/rtc-node';
import { RoomServiceClient } from 'livekit-server-sdk';

export const OUT_W = 960;
export const OUT_H = 540;
const SAMPLE_RATE = 16000;     // what the LemonSlice plugin streams to the avatar
const START_GRACE_MS = 1500;   // play a segment anyway if the avatar never reports it started

export function fillEnabled(env = process.env) {
  return String(env.AVATAR_FILL ?? '').trim() === '1';
}

/**
 * Crop a W x H RGBA picture to OUT_W x OUT_H (16:9), full width, starting cropY of the way
 * down, nearest-neighbour scaled. Returns a function (src: Uint8Array) => Uint8Array that
 * reuses one output buffer; maps are rebuilt when the source size changes.
 */
export function createCropper({ outW = OUT_W, outH = OUT_H, cropY = 0.06 } = {}) {
  const out = new Uint8Array(outW * outH * 4);
  const out32 = new Uint32Array(out.buffer);
  let key = '';
  let xMap = null;
  let yRow = null;
  return (src, w, h) => {
    if (`${w}x${h}` !== key) {
      key = `${w}x${h}`;
      // Widest 16:9 window that fits in the source.
      let cw = w;
      let ch = Math.round((w * outH) / outW);
      if (ch > h) { ch = h; cw = Math.round((h * outW) / outH); }
      const x0 = Math.floor((w - cw) / 2);
      const y0 = Math.max(0, Math.min(h - ch, Math.round(h * cropY)));
      xMap = new Int32Array(outW);
      for (let x = 0; x < outW; x++) xMap[x] = x0 + Math.min(cw - 1, Math.floor((x * cw) / outW));
      yRow = new Int32Array(outH);
      for (let y = 0; y < outH; y++) yRow[y] = (y0 + Math.min(ch - 1, Math.floor((y * ch) / outH))) * w;
    }
    const src32 = new Uint32Array(src.buffer, src.byteOffset, (src.byteLength / 4) | 0);
    for (let y = 0, o = 0; y < outH; y++) {
      const row = yRow[y];
      for (let x = 0; x < outW; x++, o++) out32[o] = src32[row + xMap[x]];
    }
    return out;
  };
}

/**
 * Audio output that feeds the avatar (next in chain) and keeps a copy of each segment for
 * Remi's own track, released when the avatar starts playing that segment.
 */
export class HeldBackAudioOutput extends voice.AudioOutput {
  constructor(next, source, { log = () => {}, graceMs = START_GRACE_MS } = {}) {
    super(next.sampleRate, next, { pause: false });
    this.next = next;
    this.source = source;
    this.log = log;
    this.graceMs = graceMs;
    this.segments = [];        // [{ frames: AudioFrame[], started, closed, timer }]
    this.open = null;
    this.pumping = false;
    this.next.on(voice.AudioOutput.EVENT_PLAYBACK_STARTED, () => this.#release());
  }

  async captureFrame(frame) {
    await super.captureFrame(frame);
    if (!this.open) {
      this.open = { frames: [], started: false, closed: false, timer: null };
      this.open.timer = setTimeout(() => this.#start(this.open ?? this.segments[0]), this.graceMs);
      this.segments.push(this.open);
    }
    this.open.frames.push(frame);
    this.#pump();
    await this.next.captureFrame(frame);
  }

  flush() {
    super.flush();
    if (this.open) { this.open.closed = true; this.open = null; }
    this.next.flush();
  }

  clearBuffer() {
    for (const s of this.segments) clearTimeout(s.timer);
    this.segments = [];
    this.open = null;
    try { this.source.clearQueue(); } catch { /* nothing queued */ }
    this.next.clearBuffer();
  }

  #release() {
    // The avatar started its oldest unstarted segment.
    this.#start(this.segments.find((s) => !s.started));
  }

  #start(seg) {
    if (!seg || seg.started) return;
    seg.started = true;
    clearTimeout(seg.timer);
    this.#pump();
  }

  async #pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const seg = this.segments[0];
        if (!seg || !seg.started) break;
        const frame = seg.frames.shift();
        if (frame) { await this.source.captureFrame(frame); continue; }
        if (seg.closed) { this.segments.shift(); continue; }
        break;   // waiting for more frames of the open segment
      }
    } catch (err) {
      this.log(`[avatar] own audio: ${err.message}`);
    } finally {
      this.pumping = false;
    }
  }
}

/**
 * Turn a started LemonSlice session into a full-screen one. Call after avatar.start() and
 * before session.start(). Resolves { ok, detail }; on any failure the session keeps the
 * plain avatar output and nothing of Remi's is published.
 */
export async function fillScreen({ session, room, avatarIdentity = 'lemonslice-avatar-agent', env = process.env, cropY, log = () => {}, timeoutMs = 8000 }) {
  const svc = new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws/, 'http'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const crop = createCropper({ cropY: cropY ?? (Number.parseFloat(env.AVATAR_CROP_Y) || 0.06) });

  // Wait for the avatar's audio and video publications.
  const pubs = await new Promise((resolve) => {
    const found = {};
    const check = () => {
      const p = room.remoteParticipants.get(avatarIdentity);
      for (const pub of p?.trackPublications?.values?.() ?? []) {
        if (pub.kind === TrackKind.KIND_AUDIO) found.audio = pub;
        if (pub.kind === TrackKind.KIND_VIDEO) found.video = pub;
      }
      if (found.audio && found.video) { done(); resolve(found); }
    };
    const timer = setTimeout(() => { done(); resolve(null); }, timeoutMs);
    const done = () => { clearTimeout(timer); room.off(RoomEvent.TrackPublished, check); room.off(RoomEvent.ParticipantConnected, check); };
    room.on(RoomEvent.TrackPublished, check);
    room.on(RoomEvent.ParticipantConnected, check);
    check();
  });
  if (!pubs) return { ok: false, detail: 'avatar tracks did not appear' };

  try {
    await svc.mutePublishedTrack(room.name, avatarIdentity, pubs.audio.sid, true);
  } catch (err) {
    return { ok: false, detail: `could not mute the avatar's audio: ${err.message}` };
  }

  // Remi's own camera: the avatar's frames, cropped to fill a landscape screen.
  const video = new VideoSource(OUT_W, OUT_H);
  const videoTrack = LocalVideoTrack.createVideoTrack('agent-video', video);
  const audio = new AudioSource(SAMPLE_RATE, 1, 1000);
  const audioTrack = LocalAudioTrack.createAudioTrack('agent-voice', audio);
  pubs.video.setSubscribed(true);
  let frames = 0;
  let stopped = false;
  const pipe = async (track) => {
    for await (const ev of new VideoStream(track)) {
      if (stopped) break;
      const rgba = ev.frame.type === VideoBufferType.RGBA ? ev.frame : ev.frame.convert(VideoBufferType.RGBA);
      video.captureFrame(new VideoFrame(crop(rgba.data, rgba.width, rgba.height), OUT_W, OUT_H, VideoBufferType.RGBA));
      frames += 1;
    }
  };
  const onSub = (track, pub, p) => {
    if (p.identity === avatarIdentity && track.kind === TrackKind.KIND_VIDEO) pipe(track).catch((err) => log(`[avatar] video pipe: ${err.message}`));
  };
  room.on(RoomEvent.TrackSubscribed, onSub);
  if (pubs.video.track) onSub(pubs.video.track, pubs.video, room.remoteParticipants.get(avatarIdentity));

  await room.localParticipant.publishTrack(videoTrack, Object.assign(new TrackPublishOptions(), { source: TrackSource.SOURCE_CAMERA }));
  await room.localParticipant.publishTrack(audioTrack, Object.assign(new TrackPublishOptions(), { source: TrackSource.SOURCE_MICROPHONE }));
  session.output.audio = new HeldBackAudioOutput(session.output.audio, audio, { log });
  const t = setInterval(() => { if (frames) { log(`[avatar] full-screen: ${frames} frames in the last 10 s`); frames = 0; } }, 10000);
  return {
    ok: true,
    stop: async () => {
      stopped = true;
      clearInterval(t);
      room.off(RoomEvent.TrackSubscribed, onSub);
      await videoTrack.close().catch(() => {});
      await audioTrack.close().catch(() => {});
      await video.close().catch(() => {});
      await audio.close().catch(() => {});
    },
  };
}
