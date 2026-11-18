import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
dotenv.config({ path: path.join(root, '.env') });
const developmentUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;
if (!developmentUrl || !testUrl) {
  throw new Error('DATABASE_URL and TEST_DATABASE_URL are required');
}
const development = new URL(developmentUrl);
const test = new URL(testUrl);
if (
  development.href === test.href ||
  test.searchParams.get('schema') !== 'inquiry_test' ||
  development.searchParams.get('schema') === 'inquiry_test'
) {
  throw new Error('Test database must use the dedicated inquiry_test schema');
}
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/prisma/build/index.js'),
    'migrate',
    'deploy',
    '--schema',
    path.join(root, 'apps/api/prisma/schema.prisma'),
  ],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: testUrl } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
