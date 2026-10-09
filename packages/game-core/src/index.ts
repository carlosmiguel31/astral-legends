/**
 * Versão das regras. Incrementar sempre que fórmulas ou conteúdo mudarem resultados.
 * v2 (Fase 1): regiões do MVP, tabelas de itens, drops e liquidação idle.
 */
export const RULESET_VERSION = 2;

export * from './types.js';
export * from './imath.js';
export * from './rng.js';
export * from './progression.js';
export * from './stats.js';
export * from './combat.js';
export * from './loot.js';
export * from './idle.js';
export * from './content/classes.js';
export * from './content/affinities.js';
export * from './content/monsters.js';
export * from './content/regions.js';
export * from './content/items.js';
export * from './content/validate.js';
