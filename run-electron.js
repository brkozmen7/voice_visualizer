import { spawn, execSync } from 'child_process';
import { createRequire } from 'module';

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_NO_ASAR;

try {
  execSync('xset s off', { env: process.env });
  execSync('xset -dpms', { env: process.env });
  execSync('xset s noblank', { env: process.env });
} catch (e) { }

const require = createRequire(import.meta.url);
const electronPath = require('electron');

// Süreci doğrudan 'nice' ve 'ionice' öncelikleriyle spawn ediyoruz
const child = spawn('sudo', [
  'nice', '-n', '-20',
  'ionice', '-c', '1', '-n', '0',
  electronPath,
  '.',
  '--no-sandbox',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  '--enable-accelerated-2d-canvas',
  '--disable-logging',
  '--log-level=3'
], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code || 0);
});