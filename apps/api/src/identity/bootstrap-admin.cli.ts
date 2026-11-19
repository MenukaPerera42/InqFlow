import { bootstrapAdmin } from './admin-bootstrap.js';
import { disconnectDatabase, getDatabase } from '../db/client.js';

const email = process.env.INQFLOW_ADMIN_EMAIL;
const password = process.env.INQFLOW_ADMIN_PASSWORD;
if (!email || !password) {
  console.error(
    'Set INQFLOW_ADMIN_EMAIL and INQFLOW_ADMIN_PASSWORD in the process environment.',
  );
  process.exitCode = 1;
} else {
  bootstrapAdmin(getDatabase(), { email, password })
    .then(() => console.info('Administrator account created.'))
    .catch((error: unknown) => {
      console.error(
        error instanceof Error
          ? error.message
          : 'Administrator bootstrap failed.',
      );
      process.exitCode = 1;
    })
    .finally(disconnectDatabase);
}
