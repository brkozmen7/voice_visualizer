import { spawn } from 'child_process';
import { createRequire } from 'module';

// Clean up environment variables injected by VS Code to prevent it from intercepting Electron
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_NO_ASAR;

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code || 0);
});
