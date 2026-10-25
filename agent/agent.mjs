// Remi on a FaceTime call (Chert). Built on the Chert video starter: join at once,
// wait for the caller, greet on bridge_ready, one audio track and one video track,
// both from this agent. What Remi says and does lives in brain/; how it talks to the
// backend lives in lib/. Nothing on the backend path can end a live call.
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
import { createWavWriter } from './lib/wav.mjs';

const PHOTO_SECONDS = 90;   // then the face comes back
const log = (line) => console.log(line);

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
    log(`[call] caller ${caller.identity} joined`);
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

    // Photos load in the background; show_photo uses whatever has arrived.
    const photoBytes = new Map();
    for (const p of context.photos) {
      api.fetchPhoto(p.imageUrl).then((buf) => { if (buf) photoBytes.set(p.id, buf); });
    }

    // Video: the face, or a photo card for PHOTO_SECONDS after show_photo.
    const source = new VideoSource(WIDTH, HEIGHT);
    const track = LocalVideoTrack.createVideoTrack('agent-video', source);
    let tick = 0;
    let speaking = false;
    let card = null;   // { pixels, until }
    const frame = () => {
      if (card && Date.now() > card.until) card = null;
      const pixels = card ? withPulse(card.pixels, tick, speaking) : drawFace(tick, speaking);
      tick += 1;
      source.captureFrame(new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA));
    };
    frame();
    await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    const timer = setInterval(frame, 1000 / FPS);

    const showPhoto = (photo) => {
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

    const session = new voice.AgentSession({
      llm: new realtime.RealtimeModel({
        model: config.realtimeModel,
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
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => { speaking = ev.newState === 'speaking'; });
    session.on(voice.AgentSessionEventTypes.Error, (ev) => log(`[session] error: ${ev.error?.message ?? ev.error}`));

    const guard = createTurnGuard(session, {
      echoGuard: config.echoGuard,
      bargeIn: config.bargeIn,
      bargeMinRms: config.bargeMinRms,
      log,
    });
    const transcript = collectTranscript(session, { t0: startedMs, log });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item?.role === 'user' && item.textContent) brain.safetyCheck(item.textContent);
    });

    // One decode of the caller's audio feeds barge-in and (optionally) the WAV capture.
    let wav = null;
    const wavReady = config.captureAudio
      ? call.ready.then((id) => createWavWriter(join(TMP_DIR, 'calls', `${id ?? call.localId}.wav`))).then((w) => { wav = w; }).catch((err) => log(`[wav] ${err.message}`))
      : Promise.resolve();
    const stopTap = tapCallerAudio(ctx.room, caller.identity, (f) => {
      guard.onCallerFrame(f);
      wav?.write(f.data);
    }, log);

    // Finish once: caller hangs up, or the job shuts down.
    let finished = null;
    const finish = (reason) => {
      if (finished) return finished;
      finished = (async () => {
        stopTap();
        guard.stop();
        transcript.stop();
        await wavReady;
        const audio = wav ? await wav.finish() : null;
        const utterances = transcript.utterances();
        const lat = transcript.latencies;
        const med = lat.length ? [...lat].sort((a, b) => a - b)[Math.floor(lat.length / 2)] : null;
        log(`[call] ending (${reason}): ${utterances.length} utterances, ${Math.round((Date.now() - startedMs) / 1000)} s, median reply ${med ?? '-'} ms, barge-ins ${guard.stats.bargeIns}, stuck turns ${guard.stats.stuckCommits}`);
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
      clearInterval(timer);
      await session.close();
      await track.close();
      await source.close();
    });

    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions: buildInstructions(context, { contractV2: config.contractV2 }), tools }),
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

    // Greet once, when chert dev reports FaceTime is ready (the Mac ends the call if it
    // hears nothing within 10 s of that). GREET_ON_JOIN=1 greets now: browser tests only.
    const greet = () => {
      log(`[call] greeting (${Date.now() - startedMs} ms after join)`);
      session.generateReply({ instructions: openingInstructions(context) });
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
