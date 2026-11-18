import { createApp } from './app.js';
import { readAuthConfig } from './config/auth.js';
import { createSessionStore } from './auth/session.js';
import { disconnectDatabase, getDatabase } from './db/client.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const config = readAuthConfig(process.env);
const { store, pool } = createSessionStore(config);
const server = createApp(config, getDatabase(), store).listen(port, () => {
  console.info(`API listening on port ${port}`);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await Promise.resolve(store.close());
  await pool.end();
  await disconnectDatabase();
}

function closeSafely() {
  void shutdown().catch(() => {
    console.error('API failed to shut down cleanly');
    process.exitCode = 1;
  });
}

server.on('error', () => {
  console.error('API failed to start');
  process.exitCode = 1;
  closeSafely();
});
process.once('SIGTERM', closeSafely);
process.once('SIGINT', closeSafely);
