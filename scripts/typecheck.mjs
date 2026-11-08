import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Validation-only tool, outside the submission. The site and build need no packages.
const local = 'test/scratch/tooling/node_modules/typescript/bin/tsc';
const args = existsSync(local)
  ? [process.execPath, [local, '--project', 'jsconfig.json', '--noEmit']]
  : ['npm', ['exec', '--yes', '--cache=test/scratch/npm-cache', '--logs-dir=test/scratch/npm-logs', '--package=typescript@5.9.3', '--', 'tsc', '--project', 'jsconfig.json', '--noEmit']];
const result = spawnSync(args[0], args[1], { stdio: 'inherit', shell: false });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
