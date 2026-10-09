import { flushRedis, resetDatabase } from '../db-reset.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from '../helpers.js';

/**
 * Prepara o banco de teste: recria o schema e aplica todas as migrações em ordem.
 * Contadores de login e limites ficam no Redis: começa cada execução do zero.
 */
export default async function setup(): Promise<void> {
  await resetDatabase(TEST_DATABASE_URL, ['_test']);
  await flushRedis(TEST_REDIS_URL);
}
