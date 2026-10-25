// One tap on the caller's audio track: 20 ms frames at 16 kHz mono, each with its RMS
// (0..1). The turn guard and the WAV capture both read from it, so the track is
// decoded once. Frames keep flowing while the model's input is muted.
import { AudioStream, RoomEvent, TrackKind } from '@livekit/rtc-node';

export const TAP_RATE = 16000;

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) { const v = samples[i] / 32768; sum += v * v; }
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * @param {import('@livekit/rtc-node').Room} room
 * @param {string} identity  caller identity (chert-bridge-<callId>)
 * @param {(frame: {data: Int16Array, rms: number, at: number}) => void} onFrame
 */
export function tapCallerAudio(room, identity, onFrame, log = () => {}) {
  let stopped = false;
  let reading = null;

  async function read(track) {
    const stream = new AudioStream(track, { sampleRate: TAP_RATE, numChannels: 1, frameSizeMs: 20 });
    log('[tap] reading caller audio');
    try {
      for await (const frame of stream) {
        if (stopped) break;
        const data = frame.data instanceof Int16Array ? frame.data : new Int16Array(frame.data.buffer);
        try { onFrame({ data, rms: rms(data), at: Date.now() }); } catch (err) { log(`[tap] ${err.message}`); }
      }
    } catch (err) {
      if (!stopped) log(`[tap] stream ended: ${err.message}`);
    }
  }

  function attach(track, participant) {
    if (stopped || reading || participant?.identity !== identity || track.kind !== TrackKind.KIND_AUDIO) return;
    reading = read(track);
  }

  const onSub = (track, _pub, participant) => attach(track, participant);
  room.on(RoomEvent.TrackSubscribed, onSub);
  const caller = room.remoteParticipants.get(identity);
  for (const pub of caller?.trackPublications.values() ?? []) if (pub.track) attach(pub.track, caller);

  return () => { stopped = true; room.off(RoomEvent.TrackSubscribed, onSub); };
}
