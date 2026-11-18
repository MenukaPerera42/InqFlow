import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { portAvailable } from './port-available.mjs';

test('startup port check rejects a port already owned by another process', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    assert.equal(await portAvailable(server.address().port), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
