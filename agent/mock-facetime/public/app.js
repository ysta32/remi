// Mock FaceTime, browser side: the caller, plus the Chert Mac's call rules.
import { Room, RoomEvent, Track } from '/livekit-client.mjs';

const $ = id => document.getElementById(id);
const phone = document.querySelector('.phone');
const ui = {
  status: $('status'), call: $('call'), end: $('end'), mute: $('mute'), camera: $('camera'),
  again: $('again'), ended: $('ended'), endedWhy: $('ended-why'), log: $('log'), latency: $('latency'),
  remote: $('remote'), remoteFill: $('remote-fill'), self: $('self'),
  meterYou: $('meter-you'), meterRemi: $('meter-remi'),
  readyDelay: $('ready-delay'), silenceRule: $('silence-rule'), oneVoiceRule: $('one-voice-rule'),
};

const SILENCE_LIMIT_MS = 10_000;  // the Mac's remote_audio_timeout
const CALLER_VOICE = 0.025;       // RMS above this is the caller talking
const REMI_VOICE = 0.012;         // RMS above this is Remi talking
const CALLER_PAUSE_MS = 350;      // this much quiet ends the caller's turn
const REMI_PAUSE_MS = 500;
const MIC_DEAD = 0.0003;          // RMS below this, the whole time, is a muted-by-the-OS microphone

let waiting = null;   // { room, callId, agentName, openedAt, warm }
let call = null;      // per-call state, see startCall
let callCount = 0;
let audioCtx = null;

// ---------- log ----------
function group(title) {
  const li = document.createElement('li');
  li.className = 'group';
  li.innerHTML = `<span class="what"></span>`;
  li.querySelector('.what').textContent = title;
  ui.log.append(li);
}
function log(what, record, tone = '') {
  const li = document.createElement('li');
  if (tone) li.dataset.tone = tone;
  const t = waiting?.openedAt ? `+${((performance.now() - waiting.openedAt) / 1000).toFixed(1)} s` : '';
  li.innerHTML = `<time></time><span class="what"></span><code></code>`;
  li.querySelector('time').textContent = t;
  li.querySelector('.what').textContent = what;
  li.querySelector('code').textContent = record;
  ui.log.append(li);
  ui.log.scrollTop = ui.log.scrollHeight;
}
const secs = ms => `${(ms / 1000).toFixed(1)} s`;

async function api(method, path, body) {
  const res = await fetch(path, {
    method, headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `${method} ${path} returned ${res.status}`);
  return json;
}

function setState(state, status) {
  phone.dataset.state = state;
  if (status !== undefined) ui.status.textContent = status;
}

// ---------- waiting room (chert dev's prewarm) ----------
async function openWaitingRoom() {
  callCount += 1;
  group(`Call ${callCount}`);
  ui.call.disabled = true;
  ui.again.disabled = true;
  ui.again.textContent = 'Getting Remi ready…';
  try {
    const opened = await api('POST', '/api/rooms');
    waiting = { ...opened, openedAt: performance.now(), warm: false };
    log(`Waiting room open, ${opened.agentName} dispatched`, 'dispatch');
  } catch (err) {
    log(`Couldn't open a waiting room: ${err.message}. Check the mock server terminal.`, 'dispatch_failed', 'bad');
    setState(phone.dataset.state === 'ended' ? 'ended' : 'warming', 'Mock server unavailable');
    return;
  }
  const mine = waiting;
  const started = performance.now();
  let warned = false;
  while (waiting === mine && !mine.warm) {
    try {
      const { participants } = await api('GET', `/api/rooms/${encodeURIComponent(mine.room)}`);
      if (participants.some(p => p.agent)) {
        mine.warm = true;
        log('Remi is in the waiting room', 'agent_warm', 'good');
        if (phone.dataset.state !== 'ended') setState('ready', 'Ready to call');
        ui.call.disabled = false;
        ui.again.disabled = false;
        ui.again.textContent = 'Call again';
        return;
      }
    } catch { /* keep polling */ }
    if (!warned && performance.now() - started > 15_000) {
      warned = true;
      log(`Remi hasn't joined. Is npm start running, with AGENT_NAME=${mine.agentName}?`, 'agent_not_warm', 'bad');
      if (phone.dataset.state !== 'ended') setState('warming', 'Remi isn’t running');
    }
    await new Promise(r => setTimeout(r, warned ? 3000 : 700));
  }
}

function closeWaitingRoom() {
  if (waiting && !call) navigator.sendBeacon(`/api/rooms/${encodeURIComponent(waiting.room)}/close`);
}

// ---------- audio meters ----------
function meterFor(mediaStreamTrack) {
  const source = audioCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  };
}

function tick() {
  if (!call) return;
  const now = performance.now();
  const you = call.youMeter?.() ?? 0;
  const remi = call.remiMeter?.() ?? 0;
  ui.meterYou.style.width = `${Math.min(100, you * 500)}%`;
  ui.meterRemi.style.width = `${Math.min(100, remi * 500)}%`;

  // A working microphone always picks up some room noise (around -60 dBFS). A level
  // under MIC_DEAD for 4 s means the OS is handing the browser zeros, which macOS does
  // when the browser lacks microphone access (measured: 0.0001 after Chrome's processing).
  call.youMax = Math.max(call.youMax ?? 0, you);
  if (you > MIC_DEAD) call.youEverHeard = true;
  if (!call.youEverHeard && !call.muted && !call.silentMicWarned && call.micSince && now - call.micSince > 4000) {
    call.silentMicWarned = true;
    log('Your microphone is sending pure silence, so Remi can’t hear you. On a Mac: System Settings, Privacy & Security, Microphone, turn on your browser, then quit and reopen it.',
      'caller_mic_silent', 'bad');
    ui.status.textContent = 'Remi can’t hear you';
  }

  if (you > CALLER_VOICE && !call.muted) { call.youSpeaking = true; call.youVoicedAt = now; }
  else if (call.youSpeaking && now - call.youVoicedAt > CALLER_PAUSE_MS) {
    call.youSpeaking = false;
    if (!call.remiSpeaking) call.awaitingReplySince = call.youVoicedAt;
  }

  if (remi > REMI_VOICE) {
    if (!call.remiSpeaking) remiStarted(now);
    call.remiSpeaking = true; call.remiVoicedAt = now;
  } else if (call.remiSpeaking && now - call.remiVoicedAt > REMI_PAUSE_MS) {
    call.remiSpeaking = false;
  }
}

function remiStarted(now) {
  if (!call.remiHeard) {
    call.remiHeard = true;
    clearTimeout(call.silenceTimer);
    if (call.readyAt) {
      log(`Remi’s voice is coming through, ${secs(now - call.readyAt)} after FaceTime was ready`, 'call_media audio', 'good');
    } else if (call.youVoicedAt) {
      log('Remi’s voice is coming through, answering you', 'call_media audio', 'good');
    } else {
      log('Remi spoke before bridge_ready. On a real call FaceTime may still be connecting.', 'greeted_early', 'warn');
    }
  }
  if (call.awaitingReplySince != null) {
    const ms = now - call.awaitingReplySince;
    call.awaitingReplySince = null;
    call.latencies.push(ms);
    const sorted = [...call.latencies].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    ui.latency.textContent = `${secs(ms)} last, ${secs(median)} median`;
    log(`Remi replied ${secs(ms)} after you stopped`, 'turn_latency', ms > 2500 ? 'warn' : '');
  }
}

// ---------- the call ----------
async function startCall() {
  if (!waiting?.warm || call) return;
  audioCtx ??= new AudioContext();
  await audioCtx.resume();
  const { room: roomName, callId } = waiting;
  call = {
    roomName, callId, latencies: [], remiHeard: false, muted: false, ending: false,
    audioFrom: null, timers: [],
  };
  ui.ended.hidden = true;
  ui.latency.textContent = 'No turns yet';
  setState('calling', 'Calling…');
  log('Calling Remi', 'call_incoming');

  try {
    const { url, token, identity } = await api('POST', `/api/rooms/${encodeURIComponent(roomName)}/token`);
    const lk = new Room({ adaptiveStream: false, dynacast: false });
    call.lk = lk;
    wireRoom(lk);
    await lk.connect(url, token);
    if (call?.lk !== lk) return; // hung up while connecting
    log('FaceTime answered', `call_accepted ${identity}`);
    setState('connecting', 'Connecting…');
    const pub = await lk.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    });
    if (pub?.track) {
      call.youMeter = meterFor(pub.track.mediaStreamTrack);
      call.micSince = performance.now();
    }
    call.ticker = setInterval(tick, 40);
    lk.remoteParticipants.forEach(p => p.trackPublications.forEach(pub => {
      if (pub.track) onTrack(pub.track, pub, p);
    }));
    scheduleBridgeReady();
  } catch (err) {
    endCall(`Couldn’t join the room: ${err.message}`, 'join_failed', 'bad');
  }
}

function scheduleBridgeReady() {
  const delay = Number(ui.readyDelay.value);
  const mine = call;
  if (delay < 0) {
    log('bridge_ready will not be sent, so Remi should not greet. Speak first.', 'no_bridge_ready', 'warn');
    goLive(null);
    return;
  }
  mine.timers.push(setTimeout(async () => {
    if (call !== mine || mine.ending) return;
    try {
      await api('POST', `/api/rooms/${encodeURIComponent(mine.roomName)}/bridge-ready`);
    } catch (err) {
      log(`Couldn't set bridge_ready: ${err.message}`, 'bridge_ready_failed', 'bad');
      return;
    }
    if (call !== mine || mine.ending) return;
    mine.readyAt = performance.now();
    log('FaceTime is ready', 'call_bridge_ready', 'good');
    goLive(mine.readyAt);
    if (!mine.remiHeard) {
      mine.silenceTimer = setTimeout(() => {
        if (call !== mine || mine.remiHeard) return;
        if (ui.silenceRule.checked) {
          endCall('Remi said nothing within 10 seconds of FaceTime being ready, so the Mac ended the call.', 'remote_audio_timeout', 'bad');
        } else {
          log('Remi has been silent 10 s since ready. A real call would have ended.', 'remote_audio_timeout', 'warn');
        }
      }, SILENCE_LIMIT_MS);
    }
  }, delay));
}

function goLive(readyAt) {
  const startedAt = readyAt ?? performance.now();
  setState('live', '0:00');
  call.clock = setInterval(() => {
    if (call.silentMicWarned) return;
    const s = Math.floor((performance.now() - startedAt) / 1000);
    ui.status.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 250);
}

function audioPublishers(lk) {
  return [...lk.remoteParticipants.values()].filter(p =>
    [...p.audioTrackPublications.values()].some(pub => !pub.isMuted));
}

function onTrack(track, pub, participant) {
  if (!call) return;
  if (track.kind === Track.Kind.Audio) {
    const el = track.attach();
    el.hidden = true;
    document.body.append(el);
    const publishers = audioPublishers(call.lk);
    if (publishers.length > 1) {
      const names = publishers.map(p => p.identity).join(', ');
      if (ui.oneVoiceRule.checked) {
        endCall(`Two participants published audio (${names}). The Mac takes audio from exactly one, so it ended the call.`, 'two_audio_publishers', 'bad');
        return;
      }
      log(`Two participants publish audio: ${names}. A real call would end.`, 'two_audio_publishers', 'warn');
    }
    if (!call.audioFrom) {
      call.audioFrom = participant.identity;
      call.remiMeter = meterFor(track.mediaStreamTrack);
      log(participant.isAgent ? 'Remi’s audio track arrived' : 'Audio from a participant that is not an agent',
        `audio_track ${participant.identity}`, participant.isAgent ? '' : 'warn');
      if (call.pendingVideo) { const v = call.pendingVideo; call.pendingVideo = null; onTrack(...v); }
    }
  } else if (track.kind === Track.Kind.Video) {
    if (!call.audioFrom) { call.pendingVideo = [track, pub, participant]; return; }
    if (participant.identity !== call.audioFrom) {
      log(`Video from ${participant.identity} isn't shown: the Mac shows video only from the participant that speaks.`, 'video_not_from_speaker', 'warn');
      return;
    }
    if (call.videoShown) return;
    call.videoShown = true;
    track.attach(ui.remote);
    track.attach(ui.remoteFill);
    phone.dataset.video = 'on';
    log('Remi’s video is showing', 'call_media video', 'good');
  }
}

function wireRoom(lk) {
  lk.on(RoomEvent.TrackSubscribed, onTrack);
  lk.on(RoomEvent.TrackUnsubscribed, (track) => {
    track.detach();
    if (track.kind === Track.Kind.Video) phone.dataset.video = 'off';
  });
  lk.on(RoomEvent.TrackPublished, () => {
    if (call && ui.oneVoiceRule.checked && audioPublishers(lk).length > 1) {
      endCall('A second participant published audio, so the Mac ended the call.', 'two_audio_publishers', 'bad');
    }
  });
  lk.on(RoomEvent.ParticipantConnected, p => log(`${p.identity} joined`, p.isAgent ? 'agent_joined' : 'participant_joined', p.isAgent ? '' : 'warn'));
  lk.on(RoomEvent.ParticipantDisconnected, p => {
    if (call && p.isAgent) endCall('Remi left the call.', 'agent_left', 'bad');
  });
  lk.on(RoomEvent.Disconnected, () => {
    if (call && !call.ending) endCall('The room closed.', 'room_closed', 'bad');
  });
}

async function endCall(why, code, tone = '') {
  if (!call || call.ending) return;
  const mine = call;
  mine.ending = true;
  mine.timers.forEach(clearTimeout);
  clearTimeout(mine.silenceTimer);
  clearInterval(mine.ticker);
  clearInterval(mine.clock);
  log(why, `call_ended ${code}`, tone);
  api('POST', `/api/rooms/${encodeURIComponent(mine.roomName)}/ended`, { reason: code }).catch(() => {});
  try { await mine.lk?.disconnect(); } catch { /* already gone */ }
  document.querySelectorAll('body > audio').forEach(el => el.remove());
  phone.dataset.video = 'off';
  ui.remote.srcObject = null;
  ui.remoteFill.srcObject = null;
  ui.meterYou.style.width = ui.meterRemi.style.width = '0';
  setMute(false);
  call = null;
  waiting = null;
  ui.endedWhy.textContent = why;
  ui.ended.hidden = false;
  setState('ended', 'Call ended');
  openWaitingRoom(); // ready for the second call, as chert dev is
}

function setMute(muted) {
  ui.mute.setAttribute('aria-pressed', String(muted));
  ui.mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  if (call) {
    call.muted = muted;
    call.lk?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
  }
}

let selfStream = null;
async function toggleCamera() {
  if (selfStream) {
    selfStream.getTracks().forEach(t => t.stop());
    selfStream = null;
    ui.self.hidden = true;
    ui.camera.setAttribute('aria-pressed', 'false');
    return;
  }
  try {
    selfStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    ui.self.srcObject = selfStream;
    ui.self.hidden = false;
    ui.camera.setAttribute('aria-pressed', 'true');
  } catch (err) {
    log(`Camera unavailable: ${err.message}`, 'camera', 'warn');
  }
}

ui.call.addEventListener('click', startCall);
ui.again.addEventListener('click', startCall);
ui.end.addEventListener('click', () => endCall('You hung up.', 'caller_hangup'));
ui.mute.addEventListener('click', () => setMute(ui.mute.getAttribute('aria-pressed') !== 'true'));
ui.camera.addEventListener('click', toggleCamera);
window.addEventListener('pagehide', () => {
  closeWaitingRoom();
  call?.lk?.disconnect();
});

window.mockFaceTime = { get call() { return call; } }; // for debugging from the console
openWaitingRoom();
