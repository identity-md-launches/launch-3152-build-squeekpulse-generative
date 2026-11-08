import assert from 'node:assert/strict';
import { readFile, readdir, stat, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function files(path) {
  const info = await lstat(path);
  assert.ok(!info.isSymbolicLink(), `Symlink is not allowed in the deliverable: ${path}`);
  if (info.isFile()) return [path];
  const result = [];
  for (const entry of await readdir(path)) {
    assert.ok(!['node_modules', '.cache', '.npm', '.vite'].includes(entry), `Generated directory in delivery: ${path}/${entry}`);
    result.push(...await files(`${path}/${entry}`));
  }
  return result;
}
const originals = ['index.html', ...await files('src'), ...await files('assets')];
const exported = await files('dist');
assert.deepEqual(exported.sort(), originals.map((file) => `dist/${file}`).sort(), 'Export must contain exactly the complete source and runtime assets');
for (const file of originals) {
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(await readFile(file)), hash(await readFile(`dist/${file}`)), `Outdated export: ${file}`);
}
const html = await readFile('dist/index.html', 'utf8');
for (const tag of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  assert.ok(tag[1].startsWith('./'), `Runtime asset URL is not relative: ${tag[1]}`);
  await stat(`dist/${tag[1]}`);
}
assert.match(html, /property="og:image" content="\.\/assets\/social\.png"/);
const social = await readFile('dist/assets/social.png');
assert.equal(social.readUInt32BE(16), 1200); assert.equal(social.readUInt32BE(20), 630);
assert.ok((await stat('.gitignore')).size <= 512, '.gitignore exceeds its explicit 512-byte budget');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length, 0);

const budget = JSON.parse(await readFile('artifacts/submission-budget.json', 'utf8'));
for (const group of budget.pathBudgets) {
  const groupFiles = (await Promise.all(group.paths.map((path) => files(path.replace(/\/$/, ''))))).flat();
  let groupBytes = 0;
  for (const file of groupFiles) groupBytes += (await stat(file)).size;
  assert.ok(groupBytes <= group.maxBytes, `Path budget exceeded for ${group.paths.join(', ')}: ${groupBytes} / ${group.maxBytes}`);
}

const paths = ['index.html', 'src', 'assets', 'scripts', 'tests', 'dist', 'artifacts', 'README.md', 'DESIGN.md', 'NOTICE.md', 'package.json', 'package-lock.json', 'jsconfig.json', '.gitignore'];
const delivered = (await Promise.all(paths.map(files))).flat();
for (const file of delivered) assert.ok(!/\.(?:tgz|zip|tar|gz)$/.test(file), `Unnecessary packaging archive: ${file}`);
let bytes = 0;
for (const file of delivered) bytes += (await stat(file)).size;
assert.ok(bytes <= 8_388_608, `Submission is over 8 MiB: ${bytes} bytes`);
const exportBytes = (await Promise.all(exported.map(async (file) => (await stat(file)).size))).reduce((a, b) => a + b, 0);
console.log(`PASS: ${exported.length} export files exactly match source; relative assets resolve; share image is 1200×630.`);
console.log(`PASS: ${delivered.length} delivery files, ${bytes.toLocaleString('en-US')} bytes total / 8,388,608 bytes. Static export: ${exportBytes.toLocaleString('en-US')} bytes.`);
console.log('PASS: zero package dependencies; no delivery symlinks, generated dependency directories or packaging archives; all explicit path budgets pass, including .gitignore <= 512 bytes.');
