'use strict';
// Runs after `npm install` in the project root.
// Installs web-ui dependencies by spawning a child npm process
// whose working directory IS web-ui — so it reads web-ui/package.json,
// not the root one, preventing infinite recursion.

const { execSync } = require('child_process');
const { join, resolve } = require('path');

const rootDir = resolve(__dirname, '..');
const webUiDir = join(rootDir, 'web-ui');

// Guard: skip entirely in Docker / CI environments that handle web-ui separately.
if (process.env.SKIP_WEB_UI_INSTALL === 'true') {
  process.exit(0);
}

// Guard: INIT_CWD is set by npm to the directory where `npm install` was
// originally invoked. If it differs from rootDir we are being called from
// a nested context (e.g. from within web-ui itself) — bail out immediately.
const initCwd = resolve(process.env.INIT_CWD || process.cwd());
if (initCwd !== rootDir) {
  process.exit(0);
}

console.log('[postinstall] Installing web-ui dependencies...');
try {
  execSync('npm install', { cwd: webUiDir, stdio: 'inherit' });
  console.log('[postinstall] web-ui dependencies installed.');
} catch (e) {
  console.error('[postinstall] web-ui install failed:', e.message);
  process.exit(1);
}
