import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve(import.meta.dirname, '../cli.mjs');
const fixture = resolve(import.meta.dirname, '../fixtures/example-input.json');
const empty = { call: { elderId: 'fictional', callId: 'empty', startedAt: '2026-01-01T00:00:00Z', isSimulated: true, utterances: [] }, history: [], processingAllowed: true };
const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
const run = (args, env = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...cleanEnv, ...env } });
async function files(t, value = empty) {
  const directory = await mkdtemp(join(tmpdir(), 'remi-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'input.json');
  const output = join(directory, 'result.json');
  await writeFile(input, JSON.stringify(value));
  return { input, output };
}

test('help succeeds without credentials or stdout secrets', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--input.*--output/);
  assert.equal(result.stderr, '');
});

test('explicit empty-call output is exclusive JSON mode 0600 and stdout is empty', async (t) => {
  const { input, output } = await files(t);
  const result = run(['--input', input, '--output', output]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(await readFile(output, 'utf8')).status, 'ok');
  assert.equal((await stat(output)).mode & 0o777, 0o600);
});

test('existing output is never overwritten', async (t) => {
  const { input, output } = await files(t);
  await writeFile(output, 'keep-private-original');
  const result = run(['--input', input, '--output', output]);
  assert.notEqual(result.status, 0);
  assert.equal(await readFile(output, 'utf8'), 'keep-private-original');
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^OUTPUT_EXISTS\n$/);
});

test('fictional fixture has no planted extraction labels; no-key invocation fails safely', async (t) => {
  const value = JSON.parse(await readFile(fixture, 'utf8'));
  assert.equal(value.call.isSimulated, true);
  assert.deepEqual(Object.keys(value).sort(), ['call', 'history', 'processingAllowed']);
  assert.ok(value.call.utterances.some((turn) => turn.speaker === 'caller' && turn.text.trim()));
  assert.equal(/expected|golden|elicitation|isRepeat|repeatLabel/i.test(JSON.stringify(value)), false);
  const { output } = await files(t);
  const result = run(['--input', fixture, '--output', output], { OPENAI_EXTRACT_MODEL: 'fictional-model' });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^CONFIGURATION_ERROR\n$/);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.status, 'unavailable');
  assert.equal(saved.counts, null);
});

test('API keys in arguments or JSON input are rejected without disclosure', async (t) => {
  const { input, output } = await files(t, { ...empty, apiKey: 'sensitive-test-value' });
  for (const args of [['--input', input, '--output', output, '--api-key', 'sensitive-test-value'], ['--input', input, '--output', output]]) {
    const result = run(args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes('sensitive-test-value'), false);
    assert.match(result.stderr, /^INVALID_ARGUMENTS\n$|^INVALID_INPUT\n$/);
  }
});

test('missing output and malformed JSON report only safe codes', async (t) => {
  const { input, output } = await files(t);
  assert.notEqual(run(['--input', input]).status, 0);
  await writeFile(input, 'private broken transcript');
  const result = run(['--input', input, '--output', output]);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'INVALID_INPUT\n');
});

test('team embedding model name takes precedence over standalone alias', async (t) => {
  const { input, output } = await files(t);
  const result = run(['--input', input, '--output', output], { OPENAI_EMBED_MODEL: 'team-model', EMBEDDING_MODEL: 'alias-model', EMBEDDING_DIMENSIONS: '3', REPEAT_THRESHOLD: '0.9' });
  assert.equal(result.status, 0);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.provenance.embeddingModel, 'team-model');
  assert.equal(saved.provenance.embeddingDimensions, 3);
  assert.equal(saved.provenance.threshold, 0.9);
});

test('nonempty CLI fixture uses team extraction name, private JSON, and real pipeline via mocked HTTP', async (t) => {
  const { input, output } = await files(t);
  await writeFile(input, await readFile(fixture));
  // The preload is a test-only HTTP boundary. Every request is handled locally.
  const hook = join((await import('node:path')).dirname(output), 'mock-provider.mjs');
  await writeFile(hook, `
    import assert from 'node:assert/strict';
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === 'https://api.openai.com/v1/responses') {
        assert.equal(body.model, 'team-extractor');
        assert.equal(body.store, false);
        assert.equal(/expected|golden|elicitationLabel/.test(body.input[0].content), false);
        return Response.json({ status: 'completed', output: [{type:'message', role:'assistant', status:'completed', content:[{type:'output_text', text: JSON.stringify({ items: [
          {kind:'story',summary:'Orchard walk with June',quote:'I walked to the orchard with my friend June.',sourceTurnIndex:1,elicitation:'unprompted',promptTurnIndex:null},
          {kind:'question',summary:'Sunday library opening time',quote:'What time does the library open on Sunday?',sourceTurnIndex:3,elicitation:'unprompted',promptTurnIndex:null}
        ] })}]}]});
      }
      assert.equal(url, 'https://api.openai.com/v1/embeddings');
      assert.equal(body.model, 'team-embedding');
      return Response.json({model:body.model,data:body.input.map((_,index)=>({index,embedding:[1,0,0]}))});
    };
  `);
  const { pathToFileURL } = await import('node:url');
  const result = run(['--input', input, '--output', output], {
    NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
    OPENAI_API_KEY: 'fictional-test-key', OPENAI_EXTRACT_MODEL: 'team-extractor', OPENAI_EXTRACTION_MODEL: 'alias-extractor',
    OPENAI_EMBED_MODEL: 'team-embedding', EMBEDDING_DIMENSIONS: '3',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.status, 'ok');
  assert.equal(saved.items.length, 2);
  assert.equal(saved.provenance.extractionModel, 'team-extractor');
  assert.equal(saved.provenance.isSimulated, true);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
});

for (const name of ['REPEAT_THRESHOLD', 'EMBEDDING_DIMENSIONS']) {
  for (const value of ['', ' ', '\t\n']) {
    test(`${name} rejects ${JSON.stringify(value)} as safe configuration failure before HTTP`, async (t) => {
      const { output } = await files(t);
      const hook = `${output}.hook.mjs`;
      const marker = `${output}.http-called`;
      await writeFile(hook, `
        import { writeFile } from 'node:fs/promises';
        globalThis.fetch = async () => {
          await writeFile(${JSON.stringify(marker)}, 'HTTP called');
          throw Error('private provider failure');
        };
      `);
      const { pathToFileURL } = await import('node:url');
      const result = run(['--input', fixture, '--output', output], {
        NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
        OPENAI_API_KEY: 'sensitive-test-value', OPENAI_EXTRACT_MODEL: 'fictional-model',
        [name]: value,
      });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, 'CONFIGURATION_ERROR\n');
      await assert.rejects(stat(marker), { code: 'ENOENT' });
    });
  }
}

test('explicit threshold string zero remains valid without HTTP for an empty call', async (t) => {
  const { input, output } = await files(t);
  const hook = `${output}.hook.mjs`;
  const marker = `${output}.http-called`;
  await writeFile(hook, `
    import { writeFile } from 'node:fs/promises';
    globalThis.fetch = async () => {
      await writeFile(${JSON.stringify(marker)}, 'HTTP called');
      throw Error('private provider failure');
    };
  `);
  const { pathToFileURL } = await import('node:url');
  const result = run(['--input', input, '--output', output], {
    NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
    REPEAT_THRESHOLD: '0',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.status, 'ok');
  assert.equal(saved.provenance.threshold, 0);
  await assert.rejects(stat(marker), { code: 'ENOENT' });
});
