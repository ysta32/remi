// Remi on a FaceTime call (Chert). Built on the Chert video starter: join at once,
// wait for the caller, greet on bridge_ready, one audio track and one video track,
// both from this agent (or both from the LemonSlice avatar, lib/avatar.mjs). What Remi says and does lives in brain/; how it talks to the
// backend lives in lib/. Nothing on the backend path can end a live call.
import { accessSync, constants, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AutoSubscribe, cli, defineAgent, llm, ServerOptions, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-openai';
import { LocalVideoTrack, RoomEvent, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { buildInstructions, createBrain, fallbackContext, openingInstructions } from './brain/index.mjs';
import { createApi } from './lib/api.mjs';
import { createCallSession, isoNow } from './lib/call-session.mjs';
import { readConfig, TMP_DIR } from './lib/config.mjs';
import { tapCallerAudio } from './lib/caller-audio.mjs';
import { createTurnGuard } from './lib/turn-guard.mjs';
import { collectTranscript } from './lib/transcript.mjs';
import { renderPhotoCard, withPulse } from './lib/card.mjs';
import { startCapture } from './lib/wav.mjs';
import { createLatencyProbe, formatLatency } from './lib/latency-probe.mjs';
import { missingTextConfig } from './brain/notify.mjs';
import { fillSharedEnv } from './lib/env.mjs';
import { createCallMemory } from './lib/call-memory.mjs';
import { avatarEnabled, keepAvatarOut, startAvatar } from './lib/avatar.mjs';
import { fillEnabled, fillScreen } from './lib/avatar-fill.mjs';

const PHOTO_SECONDS = 90;   // then the face comes back
const MEMORY_EVERY = 3;     // caller turns between in-call memory refreshes
const log = (line) => console.log(line);
export const CALLS_DIR = join(TMP_DIR, 'calls');

// At startup: say plainly if texting contacts can't work (placeholders in .env.local).
const sharedFromRoot = fillSharedEnv();
if (sharedFromRoot.length) console.log(`[env] from the repo-root .env.local: ${sharedFromRoot.join(', ')}`);
const missingText = missingTextConfig();
if (missingText.length) console.warn(`[contacts] texting is off until ${missingText.join(' and ')} are filled in agent/.env.local`);

// At startup, before any call: make sure caller audio has somewhere to go.
if (readConfig().captureAudio) {
  try {
    mkdirSync(CALLS_DIR, { recursive: true });
    accessSync(CALLS_DIR, constants.W_OK);
  } catch (err) {
    console.error(`[wav] ${CALLS_DIR} is not writable (${err.message}); calls will have no audio`);
  }
}

export default defineAgent({
  entry: async (ctx) => {
    const config = readConfig();
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    // Chert keeps a waiting room open before any call. Join now, open nothing paid
    // until a caller arrives; a room that closes first (prewarm, doctor) exits quietly.
    let caller;
    try {
      caller = await ctx.waitForParticipant();
    } catch {
      return;
    }
    const startedMs = Date.now();
    // Outbound calls (lib/outbound.mjs) dispatch Remi with {"outbound":true}.
    let outbound = false;
    try { outbound = JSON.parse(ctx.job?.metadata || '{}').outbound === true; } catch { /* inbound */ }
    log(`[call] caller ${caller.identity} joined${outbound ? ' (Remi placed this call)' : ''}`);
    const api = createApi(config);

    // Context: short wait, then the cache, then a generic persona.
    const fetched = await api.getContext(config.elderId);
    const context = fetched ?? fallbackContext({ elderId: config.elderId });
    const language = context.elder?.language === 'zh' ? 'zh' : 'en';
    log(`[call] context: ${fetched ? (fetched.cached ? 'cached' : 'live') : 'fallback'} for ${context.elder.preferredName}; ${context.photos.length} photos, ${context.knownFacts.length} facts`);

    const call = createCallSession({
      api,
      contractV2: config.contractV2,
      log,
      create: {
        elderId: config.elderId,
        startedAt: isoNow(startedMs),
        language,
        bridgeIdentity: caller.identity,
        themeId: context.theme?.id ?? null,
      },
    });

    // Caller audio is captured from the moment the caller joins; renamed to <callId>.wav at the end.
    const wav = config.captureAudio ? startCapture(join(CALLS_DIR, `${call.localId}.wav`), { log }) : null;
    // One decode of the caller's audio feeds the WAV now and barge-in once the guard exists.
    let guard = null;
    const probe = createLatencyProbe({ log });
    const stopTap = tapCallerAudio(ctx.room, caller.identity, (f) => {
      wav?.write(f.data);
      guard?.onCallerFrame(f);
      probe.onCallerFrame(f);
    }, log);

    // Photos load in the background; show_photo uses whatever has arrived.
    const photoBytes = new Map();
    for (const p of context.photos) {
      api.fetchPhoto(p.imageUrl).then((buf) => { if (buf) photoBytes.set(p.id, buf); });
    }

    // Video: the face, or a photo card for PHOTO_SECONDS after show_photo. With the
    // LemonSlice avatar (lib/avatar.mjs) the avatar publishes the face instead, and this
    // starts only if the avatar can't.
    let source = null;
    let track = null;
    let timer = null;
    let tick = 0;
    let speaking = false;
    let card = null;   // { pixels, until }
    let avatarOn = false;
    const frame = () => {
      if (card && Date.now() > card.until) card = null;
      const pixels = card ? withPulse(card.pixels, tick, speaking) : drawFace(tick, speaking);
      tick += 1;
      source.captureFrame(new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA));
    };
    const startOwnVideo = async () => {
      source = new VideoSource(WIDTH, HEIGHT);
      track = LocalVideoTrack.createVideoTrack('agent-video', source);
      frame();
      await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
      timer = setInterval(frame, 1000 / FPS);
    };
    const wantAvatar = avatarEnabled();
    if (!wantAvatar) await startOwnVideo();

    const showPhoto = (photo) => {
      // Only one participant's video reaches FaceTime; while the avatar owns it, no photo cards.
      if (avatarOn) { log(`[video] avatar on; not showing ${photo.id}`); return; }
      renderPhotoCard({ image: photoBytes.get(photo.id) ?? null, caption: photo.caption, people: photo.people })
        .then((pixels) => { card = { pixels, until: Date.now() + PHOTO_SECONDS * 1000 }; log(`[video] showing ${photo.id}${photoBytes.has(photo.id) ? '' : ' (caption card)'}`); })
        .catch((err) => log(`[video] photo card failed: ${err.message}`));
    };

    const brain = createBrain({
      ctx: context,
      emit: call.emit,
      elapsedMs: call.elapsedMs,
      contractV2: config.contractV2,
      onShowPhoto: showPhoto,
    });
    const tools = brain.tools.map((t) => llm.tool({ name: t.name, description: t.description, parameters: t.parameters, execute: async (args) => t.execute(args) }));
    // Live tab on the family page: what Remi learns, as it happens (never the raw transcript).
    tools.push(llm.tool({
      name: 'note_for_family',
      description: `Write a short note on ${context.elder.preferredName}'s family page while you talk. Call it right away, without mentioning it, whenever ${context.elder.preferredName} asks you to remember something or shares a lasting personal fact (a favorite, a person, a place, a plan, a preference) — kind "fact" — or tells a story or memory worth keeping — kind "moment". One short line in third person, e.g. "Favorite fruit is an apple." Not for small talk.`,
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['fact', 'moment'] },
          text: { type: 'string', description: 'One short line, third person, under 20 words.' },
        },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
      execute: async ({ kind, text }) => {
        const line = String(text ?? '').trim().slice(0, 300);
        if (!line) return 'Nothing to note.';
        call.note(kind === 'moment' ? 'moment' : 'fact', line);
        log(`[note] ${kind}: ${line.length} chars`);
        return 'Noted. If they asked you to remember it, say you will; otherwise keep talking naturally.';
      },
    }));

    // Instructions: the call plan, plus a running memory of this call added as it goes.
    const instructions = buildInstructions(context, { contractV2: config.contractV2 });
    const agent = new voice.Agent({ instructions, tools });
    const memory = createCallMemory({ t0: startedMs });

    const session = new voice.AgentSession({
      llm: new realtime.RealtimeModel({
        model: config.realtimeModel,
        ...(config.realtimeReasoning !== 'default' ? { reasoning: { effort: config.realtimeReasoning } } : {}),
        voice: config.voice,
        inputAudioTranscription: { model: 'gpt-4o-mini-transcribe', language },
        inputAudioNoiseReduction: { type: config.noiseReduction },
        turnDetection: config.turnDetection === 'semantic'
          ? { type: 'semantic_vad', eagerness: 'high', create_response: true, interrupt_response: true }
          : {
            type: 'server_vad',
            threshold: config.vadThreshold,
            prefix_padding_ms: 300,
            silence_duration_ms: config.turnSilenceMs,
            create_response: true,
            interrupt_response: true,
          },
      }),
    });
    // Unanswered-turn watchdog: room noise can cancel the model's reply to a finished caller
    // turn (a false speech start interrupts it), and Remi then waits until "hello?". If the
    // caller finished and Remi is still just listening after NO_REPLY_MS, answer anyway.
    let noReply = null;
    const clearNoReply = () => { if (noReply) { clearTimeout(noReply); noReply = null; } };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      speaking = ev.newState === 'speaking';
      probe.onAgentState(ev.newState);
      if (ev.newState !== 'listening') clearNoReply();
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => { if (ev.newState === 'speaking') clearNoReply(); });
    session.on(voice.AgentSessionEventTypes.Error, (ev) => log(`[session] error: ${ev.error?.message ?? ev.error}`));

    guard = createTurnGuard(session, {
      echoGuard: config.echoGuard,
      bargeIn: config.bargeIn,
      bargeMinRms: config.bargeMinRms,
      bargeHoldMs: config.bargeHoldMs,
      log,
    });
    const transcript = collectTranscript(session, { t0: startedMs, log });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (!item?.textContent) return;
      memory.add(item.role, item.textContent);
      if (item.role !== 'user') return;
      clearNoReply();
      noReply = setTimeout(() => {
        noReply = null;
        if (session.agentState !== 'listening' || session.userState === 'speaking') return;
        log('[turn] no reply to the last caller turn; answering');
        try { session.generateReply(); } catch (err) { log(`[turn] reply: ${err.message}`); }
      }, config.noReplyMs);
      brain.safetyCheck(item.textContent);
      if (memory.callerTurns % MEMORY_EVERY === 0) {
        const section = memory.section(context.elder.preferredName);
        agent.updateInstructions(`${instructions}\n\n${section}`)
          .then(() => log(`[memory] refreshed after ${memory.callerTurns} caller turns (${section.length} chars)`))
          .catch((err) => log(`[memory] update failed: ${err.message}`));
      }
    });


    // Finish once: caller hangs up, or the job shuts down.
    let finished = null;
    const finish = (reason) => {
      if (finished) return finished;
      finished = (async () => {
        stopTap();
        guard?.stop();
        transcript.stop();
        const id = await call.ready;
        const audio = wav ? await wav.finish(join(CALLS_DIR, `${id ?? call.localId}.wav`)) : null;
        if (audio) log(`[wav] ${audio.ms} ms of caller audio → ${audio.path}`);
        log(`[lat] call: ${formatLatency(probe.summary())}`);
        const utterances = transcript.utterances();
        const lat = transcript.latencies;
        const med = lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)] : null;
        log(`[call] ending (${reason}): ${utterances.length} utterances, ${Math.round((Date.now() - startedMs) / 1000)} s, median reply ${med ?? '-'} ms, barge-ins ${guard?.stats.bargeIns ?? 0}, stuck turns ${guard?.stats.stuckCommits ?? 0}`);
        await call.complete({
          endedAt: isoNow(),
          endReason: reason,
          utterances,
          ...(audio && audio.bytes > 0 ? { audioPath: audio.path } : {}),
        });
      })().catch((err) => log(`[call] finish failed: ${err.message}`));
      return finished;
    };
    ctx.room.on(RoomEvent.ParticipantDisconnected, (p) => { if (p.identity === caller.identity) finish('caller_hangup'); });

    ctx.addShutdownCallback(async () => {
      await finish('agent_shutdown');
      await Promise.allSettled([brain.safety.flush(4000), call.flush(4000)]);
      if (timer) clearInterval(timer);
      await session.close();
      await track?.close();
      await source?.close();
    });

    if (wantAvatar) {
      avatarOn = (await startAvatar({ session, room: ctx.room, log })).ok;
      if (!avatarOn) {
        const stopGuard = keepAvatarOut(ctx.room, { log });
        ctx.addShutdownCallback(async () => stopGuard());
        await startOwnVideo();
      } else if (fillEnabled()) {
        // Remi republishes the avatar cropped to fill FaceTime's landscape window.
        const fill = await fillScreen({ session, room: ctx.room, log, timeoutMs: 5000 })
          .catch((err) => ({ ok: false, detail: err.message }));
        if (fill.ok) { log('[avatar] full-screen on'); ctx.addShutdownCallback(fill.stop); }
        else log(`[avatar] full-screen off (${fill.detail}); avatar keeps its own track`);
      }
    }
    await session.start({
      room: ctx.room,
      agent,
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Raw OpenAI events with their arrival time, for the latency breakdown. The realtime
    // session is internal to AgentActivity in 1.8.0 (same reach as lib/turn-guard.mjs).
    const rt = session.activity?.realtimeSession;
    if (rt?.on) rt.on('openai_server_event_received', probe.onServerEvent);
    else log('[lat] realtime session not reachable; model timings off');

    // Greet once, when chert dev reports FaceTime is ready (the Mac ends the call if it
    // hears nothing within 10 s of that). GREET_ON_JOIN=1 greets now: browser tests only.
    const greet = () => {
      log(`[call] greeting (${Date.now() - startedMs} ms after join)`);
      session.generateReply({ instructions: openingInstructions(context, { outbound, pitch: config.greetPitch }) });
    };
    if (config.greetOnJoin) greet();
    else {
      const stopGreeting = greetOnBridgeReady(ctx.room, greet);
      ctx.addShutdownCallback(async () => stopGreeting());
    }
  },
});

cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: process.env.AGENT_NAME || 'remi',
}));
