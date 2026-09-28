import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { syncDocs } from './sync-docs.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'aes-docs-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'generated');
  await mkdir(source);
  const write = async (relative, text, directory = source) => {
    const target = path.join(directory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  };
  return { source, destination, write, sync: () => syncDocs({ source, destination, logger: {} }) };
}

test('preserves source text and rewrites flat Markdown links and fragments', async (t) => {
  const f = await fixture(t);
  const source = '# Start\n\n[Guide](GUIDE.md#plan) [Web](https://example.org/GUIDE.md) [Anchor](#local)\n';
  await f.write('START.md', source);
  await f.write('GUIDE.md', '# Guide\n');
  await f.sync();
  const result = await readFile(path.join(f.destination, 'START.md'), 'utf8');
  assert.match(result, /title: "Start"/);
  assert.match(result, /\[Guide\]\(\.\.\/guide\/#plan\)/);
  assert.match(result, /\[Web\]\(https:\/\/example.org\/GUIDE.md\)/);
  assert.match(result, /\[Anchor\]\(#local\)/);
  assert.equal(await readFile(path.join(f.source, 'START.md'), 'utf8'), source);
});

test('resolves nested links by path, not by colliding basenames', async (t) => {
  const f = await fixture(t);
  await f.write('one/GUIDE.md', '# One\n\n[Other](../two/GUIDE.md)\n');
  await f.write('two/GUIDE.md', '# Two\n\n[Self](GUIDE.md#here)\n');
  await f.sync();
  assert.match(await readFile(path.join(f.destination, 'one', 'GUIDE.md'), 'utf8'), /\.\.\/\.\.\/two\/guide\//);
  assert.match(await readFile(path.join(f.destination, 'two', 'GUIDE.md'), 'utf8'), /\[Self\]\(\.\/#here\)/);
});

test('removes only stale generated Markdown', async (t) => {
  const f = await fixture(t);
  await f.write('LIVE.md', '# Live\n');
  await f.write('STALE.md', '# Stale\n', f.destination);
  await f.write('asset.txt', 'keep', f.destination);
  await f.sync();
  await assert.rejects(readFile(path.join(f.destination, 'STALE.md')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.destination, 'asset.txt'), 'utf8'), 'keep');
});

test('rejects ambiguous routes and overlapping input/output before deleting anything', async (t) => {
  const f = await fixture(t);
  await f.write('A B.md', '# Space\n');
  await f.write('A-B.md', '# Hyphen\n');
  await assert.rejects(f.sync(), /duplicate page routes/);
  await assert.rejects(syncDocs({ source: f.source, destination: f.source }), /must not overlap/);
  await assert.rejects(syncDocs({ source: f.source, destination: path.join(f.source, 'out') }), /must not overlap/);
});
