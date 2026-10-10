import pg from 'pg';

/**
 * Acesso direto ao banco descartável do E2E (`astral_e2e`, recriado a cada execução)
 * apenas para simular tempo decorrido. Nunca é usado contra o banco de desenvolvimento.
 */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://astral:astral_dev@localhost:5432/astral_e2e';

if (!new URL(DATABASE_URL).pathname.endsWith('_e2e')) {
  throw new Error('O helper de banco do E2E só pode ser usado com um banco *_e2e');
}

/** Desloca a caçada do personagem para o passado, como se `ms` tivessem passado offline. */
export async function rewindHunt(characterName: string, ms: number): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(
      `UPDATE hunt_sessions
          SET started_at = started_at - make_interval(secs => $2::double precision / 1000),
              last_settled_at = last_settled_at - make_interval(secs => $2::double precision / 1000)
        WHERE character_id = (SELECT id FROM characters WHERE name = $1)`,
      [characterName, ms],
    );
    if (res.rowCount !== 1) throw new Error(`caçada de ${characterName} não encontrada`);
  } finally {
    await client.end();
  }
}
