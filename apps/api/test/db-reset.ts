import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createRedis } from '../src/infra/redis.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');

/**
 * Recria um banco descartável e aplica todas as migrações em ordem.
 * Só aceita bancos cujo nome termine com um dos sufixos permitidos (proteção
 * contra apagar o banco de desenvolvimento por engano).
 */
export async function resetDatabase(databaseUrl: string, allowedSuffixes: string[]): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.slice(1);
  if (!allowedSuffixes.some((suffix) => dbName.endsWith(suffix))) {
    throw new Error(`Recusado: o banco ${dbName} não termina com ${allowedSuffixes.join(' ou ')}`);
  }

  await ensureDatabase(url, dbName);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    const migrations = readdirSync(migrationsDir)
      .filter((name) => statSync(join(migrationsDir, name)).isDirectory())
      .sort();
    for (const name of migrations) {
      await client.query(readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

export async function flushRedis(redisUrl: string): Promise<void> {
  const redis = createRedis(redisUrl);
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
