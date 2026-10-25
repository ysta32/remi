import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const cwd = dirname(dirname(cli));
function run(args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/OPENAI|LIVEKIT|CHERT/.test(key)) delete env[key];
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
}
async function temp(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'remi-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('help needs no credentials and describes the offline exclusive-output interface', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--output/); assert.match(result.stdout, /--config/);
  assert.match(result.stdout, /offline|synthetic/i); assert.equal(result.stderr, '');
});

test('strict argument errors are sanitized and create no output', async t => {
  const root = await temp(t), output = join(root, 'out');
  for (const args of [[], ['--unknown', 'PRIVATE_SENTINEL'], ['--output'], ['--config'], ['--output', output, '--output', output], ['--config', 'x', '--config', 'y', '--output', output], ['--help', '--output', output], ['--output', output, 'extra'], ['--output', output, '--force']]) {
    const result = run(args);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, ''); assert.match(result.stderr, /^SYNTHETIC_[A-Z_]+\n$/);
    assert.doesNotMatch(result.stderr, /PRIVATE_SENTINEL|Error:|at /);
  }
  assert.deepEqual(await readdir(root), []);
});

test('default and explicit valid configurations produce complete offline output', async t => {
  const root = await temp(t);
  const config = join(root, 'config.json'); await writeFile(config, JSON.stringify({ seed: 7, callsPerWeek: 2, startDate: '2026-09-28' }));
  for (const [name, args, calls] of [['default', [], 12], ['configured', ['--config', config], 8]]) {
    const output = join(root, name), result = run([...args, '--output', output]);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.callIds.length, calls); assert.equal(manifest.isSimulated, true);
    assert.equal(Object.keys(manifest.files).length, calls * 4 + 3);
    const retry = run([...args, '--output', output]);
    assert.notEqual(retry.status, 0); assert.equal(retry.stderr, 'SYNTHETIC_OUTPUT_EXISTS\n');
  }
});

test('invalid configs fail before creating output and never echo file content or paths', async t => {
  const root = await temp(t), config = join(root, 'PRIVATE_SENTINEL.json');
  const cases = ['{bad json PRIVATE_SENTINEL', 'null', '[]', ...[
    { startDate: '2026-02-30' }, { startDate: '2026-09-29' }, { seed: -1 }, { seed: 1.5 },
    { seed: 4294967296 }, { callsPerWeek: 5 }, { PRIVATE_SENTINEL: true }, { schemaVersion: 2 },
  ].map(JSON.stringify)];
  for (const contents of cases) {
    await writeFile(config, contents);
    const result = run(['--config', config, '--output', join(root, 'out')]);
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    assert.match(result.stderr, /^SYNTHETIC_CONFIG_INVALID\n$/);
    assert.doesNotMatch(result.stderr, /PRIVATE_SENTINEL|Error:|at /);
  }
  assert.deepEqual(await readdir(root), ['PRIVATE_SENTINEL.json']);
});
