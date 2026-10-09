import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createRedis } from '../../src/infra/redis.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from '../helpers.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../prisma/migrations');

/**
 * Prepara o banco de teste: recria o schema e aplica todas as migrações em ordem.
 * Recusa-se a rodar em qualquer banco cujo nome não termine em `_test`.
 */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL deve apontar para um banco *_test (recebido: ${dbName})`);
  }

  await ensureDatabase(url, dbName);

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    const migrations = readdirSync(migrationsDir)
      .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
      .sort();
    for (const name of migrations) {
      const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }

  // Contadores de login e limites ficam no Redis: começa cada execução do zero.
  const redis = createRedis(TEST_REDIS_URL);
  await redis.connect();
  await redis.flushdb();
  redis.disconnect();
}

async function ensureDatabase(url: URL, dbName: string): Promise<void> {
  const probe = new pg.Client({ connectionString: url.toString() });
  try {
    await probe.connect();
    await probe.end();
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') throw error;
  }
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName.replaceAll('"', '')}"`);
  } finally {
    await client.end();
  }
}
