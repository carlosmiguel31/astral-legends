import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('aplica valores padrão seguros', () => {
    const config = loadConfig(base);
    expect(config.NODE_ENV).toBe('development');
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.PORT).toBe(3000);
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
  });

  it('interpreta listas e booleanos', () => {
    const config = loadConfig({
      ...base,
      CORS_ORIGINS: 'http://a.test, http://b.test ,',
      TRUST_PROXY: 'true',
    });
    expect(config.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(config.TRUST_PROXY).toBe(true);
  });

  it('falha rápido sem DATABASE_URL e sem vazar valores', () => {
    expect(() => loadConfig({ REDIS_URL: 'redis://secret-host:6379' })).toThrow(/DATABASE_URL/);
    try {
      loadConfig({ REDIS_URL: 'redis://secret-host:6379' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-host');
    }
  });

  it('rejeita protocolos errados', () => {
    expect(() => loadConfig({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('exige origens https em produção', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'http://jogo.test' }),
    ).toThrow(/https/);
    expect(
      loadConfig({ ...base, NODE_ENV: 'production', CORS_ORIGINS: 'https://jogo.test' }).NODE_ENV,
    ).toBe('production');
  });
});
