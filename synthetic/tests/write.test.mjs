import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, readFile, readdir, rm, mkdir, writeFile, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const writer = await import('../src/write.mjs').catch(() => null);
const generator = await import('../src/generate.mjs').catch(() => null);
function modules() {
  assert.equal(typeof writer?.writeBundle, 'function', 'exclusive writer must exist');
  assert.equal(typeof writer?.bundleFiles, 'function', 'bundle serializer must exist');
  assert.equal(typeof generator?.generateBundle, 'function', 'generator dependency must exist');
}
async function temp(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'remi-write-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function absent(path) { await assert.rejects(lstat(path), { code: 'ENOENT' }); }

test('publication has deterministic complete payloads, independently verified hashes and manifest last', async t => {
  modules();
  const root = await temp(t), bundle = await generator.generateBundle();
  const snapshot = JSON.stringify(bundle);
  const files = writer.bundleFiles(bundle);
  assert.ok(files instanceof Map);
  assert.equal([...files.keys()].at(-1), 'manifest.json');
  assert.equal(files.size, bundle.calls.length * 4 + 4);
  for (const path of ['profile.json', 'ground-truth/splits.json', 'README.txt']) assert.ok(files.has(path));
  for (const call of bundle.calls) {
    for (const type of ['calls', 'detector-inputs', 'ground-truth', 'timing']) assert.ok(files.has(`${type}/${call.callId}.json`));
  }
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.isSimulated, true);
  assert.equal(manifest.files['manifest.json'], undefined);
  assert.deepEqual(Object.keys(manifest.files), [...files.keys()].filter(path => path !== 'manifest.json'));
  assert.match(files.get('README.txt'), /synthetic|simulated|fiction/i);
  for (const [path, contents] of files) {
    assert.ok(contents.endsWith('\n'));
    if (path !== 'manifest.json') assert.equal(manifest.files[path], createHash('sha256').update(contents).digest('hex'));
    if (path.endsWith('.json')) assert.equal(JSON.parse(contents).isSimulated, true);
  }
  const dirs = [join(root, 'one'), join(root, 'two')];
  for (const dir of dirs) assert.deepEqual(await writer.writeBundle(bundle, dir), { outputDir: dir, fileCount: files.size });
  for (const [path, contents] of files) {
    assert.equal(await readFile(join(dirs[0], path), 'utf8'), contents);
    assert.equal(await readFile(join(dirs[1], path), 'utf8'), contents);
  }
  assert.equal(JSON.stringify(bundle), snapshot, 'writer must not mutate its input');
});

test('existing files, directories, symlinks and ancestor symlinks preserve all content', async t => {
  modules();
  const root = await temp(t), bundle = await generator.generateBundle();
  const file = join(root, 'file'), dir = join(root, 'dir'), link = join(root, 'link');
  await writeFile(file, 'sentinel'); await mkdir(dir); await writeFile(join(dir, 'sentinel'), 'keep');
  await symlink(dir, link);
  for (const target of [file, dir, link, join(link, 'nested')]) await assert.rejects(writer.writeBundle(bundle, target));
  const dangling = join(root, 'dangling'); await symlink(join(root, 'absent'), dangling);
  await assert.rejects(writer.writeBundle(bundle, dangling));
  assert.equal(await readFile(file, 'utf8'), 'sentinel');
  assert.equal(await readFile(join(dir, 'sentinel'), 'utf8'), 'keep');
  await absent(join(dir, 'nested')); await absent(join(root, 'absent'));
});

test('invalid bundles and traversal paths fail before output creation', async t => {
  modules();
  const root = await temp(t), bundle = await generator.generateBundle();
  const invalid = structuredClone(bundle); invalid.calls[0].isSimulated = false;
  const invalidOutput = join(root, 'invalid');
  await assert.rejects(writer.writeBundle(invalid, invalidOutput)); await absent(invalidOutput);
  for (const output of [`${root}/../escape`, `${root}/./dot`, `${root}//empty`, `${root}/back\\slash`, '', '\0']) {
    await assert.rejects(writer.writeBundle(bundle, output));
  }
  const malicious = structuredClone(bundle); malicious.calls[0].callId = '../../escape';
  assert.throws(() => writer.bundleFiles(malicious));
  assert.deepEqual((await readdir(root)), []);
});

test('competing publication permits exactly one complete winner without overwriting', async t => {
  modules();
  const root = await temp(t), bundle = await generator.generateBundle(), output = join(root, 'race');
  const results = await Promise.allSettled([writer.writeBundle(bundle, output), writer.writeBundle(bundle, output)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  for (const [path, contents] of writer.bundleFiles(bundle)) assert.equal(await readFile(join(output, path), 'utf8'), contents);
});

test('bundled README supplies portable commands, artifact formats and safe evaluation handoff', async () => {
  modules();
  const guide = writer.bundleFiles(await generator.generateBundle()).get('README.txt');
  assert.match(guide, /node synthetic\/cli\.mjs --output synthetic\/output-fresh/);
  assert.match(guide, /fresh|new.*director/i);
  for (const key of ['schemaVersion', 'seed', 'startDate', 'callsPerWeek']) assert.ok(guide.includes(key), key);
  for (const path of ['manifest.json', 'profile.json', 'calls/', 'detector-inputs/', 'ground-truth/', 'timing/', 'ground-truth/splits.json']) assert.ok(guide.includes(path), path);
  assert.match(guide, /SHA-256/);
  assert.match(guide, /UTF-16/);
  assert.match(guide, /synthetic_authored/);
  assert.match(guide, /not.*audio|no.*audio/i);
  assert.match(guide, /incident.*famil|famil.*incident/i);
  assert.match(guide, /fresh histor/i);
  assert.match(guide, /tuning.*threshold|threshold.*tuning/i);
  assert.match(guide, /held-out/i);
  assert.match(guide, /POST/);
  assert.match(guide, /isSimulated/);
  assert.match(guide, /API/);
  assert.match(guide, /no.*accuracy|not.*accuracy/i);
});
