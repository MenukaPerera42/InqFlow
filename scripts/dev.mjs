import { spawn } from 'node:child_process';
import { portAvailable } from './port-available.mjs';

for (const port of [3000, Number(process.env.PORT || 3001)]) {
  if (!(await portAvailable(port))) {
    console.error(
      `Port ${port} is already in use. Stop the existing service before running npm run dev.`,
    );
    process.exit(1);
  }
}

const commands = ['dev:api', 'dev:web'];
const children = commands.map((name) =>
  spawn('npm', ['run', name], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(`Could not start a development process: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`A development process exited (${signal ?? code}).`);
      stop(code || 1);
    }
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
