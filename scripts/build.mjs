import { cp, mkdir, rm, stat } from 'node:fs/promises';

// Only these source directories enter the static export.
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'src', 'assets']) {
  await cp(path, `dist/${path}`, { recursive: true });
}
const html = await stat('dist/index.html');
console.log(`Built dist/index.html (${html.size} bytes) and local assets. No runtime or build dependencies.`);
