import { describe, expect, it } from 'vitest';
import { CLASSES } from '../src/content/classes.js';
import { AFFINITIES } from '../src/content/affinities.js';
import { validateContent } from '../src/content/validate.js';
import { AFFINITY_IDS, CLASS_IDS } from '../src/types.js';

describe('conteúdo estático', () => {
  it('passa na validação de integridade', () => {
    expect(() => validateContent()).not.toThrow();
  });

  it('define todas as classes e afinidades com ids consistentes', () => {
    for (const id of CLASS_IDS) expect(CLASSES[id].id).toBe(id);
    for (const id of AFFINITY_IDS) expect(AFFINITIES[id].id).toBe(id);
  });
});
