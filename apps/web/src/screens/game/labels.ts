import type { WaveClearView, WaveNoticeView } from '@astral/shared';

export const CLASS_NAMES: Record<string, string> = {
  guardian: 'Guardião Astral',
  arcanist: 'Arcanista Celestial',
  blade: 'Lâmina Estelar',
};

export const AFFINITY: Record<string, { name: string; text: string }> = {
  solar: { name: 'Solar', text: 'text-solar' },
  lunar: { name: 'Lunar', text: 'text-lunar' },
  storm: { name: 'Tempestade', text: 'text-storm' },
  abyssal: { name: 'Abissal', text: 'text-abyssal' },
};

export const RARITY_LOWER: Record<string, string> = {
  common: 'comum',
  uncommon: 'incomum',
  rare: 'raro',
  epic: 'épico',
  legendary: 'lendário',
  astral: 'astral',
};

export const MODE_LABEL = { advance: 'Avançar', farm: 'Farmar' } as const;

export function noticeText(n: WaveNoticeView): string {
  switch (n.type) {
    case 'retreat':
      return `Derrotas seguidas: o herói recuou da wave ${n.fromWave} para a ${n.toWave} e passou a farmar. Fortaleça-se e volte a avançar quando quiser.`;
    case 'content_limit':
      return `Você concluiu todo o conteúdo disponível nesta região (wave ${n.wave}). O herói segue farmando a última wave; novas waves chegam em atualizações futuras.`;
    case 'level_gate':
      return `A wave ${n.nextWave} exige nível ${n.minLevel}. O herói repete a wave ${n.wave} até alcançá-lo.`;
  }
}

export function nextStepText(
  p: { mode: 'advance' | 'farm'; wave: number; waveCount: number },
  level: number,
  nextMinLevel: number | null,
): string {
  if (p.mode === 'farm') return `Ao concluir, repete a wave ${p.wave}.`;
  if (p.wave >= p.waveCount)
    return 'Ao concluir, passa a farmar esta wave (fim do conteúdo atual).';
  if (nextMinLevel !== null && level < nextMinLevel)
    return `Ao concluir, repete esta wave até o nível ${nextMinLevel}.`;
  return `Ao concluir, avança para a wave ${p.wave + 1}.`;
}

export function clearNextText(c: WaveClearView): string {
  switch (c.next.reason) {
    case 'advance':
      return `Avançando para a wave ${c.next.wave}.`;
    case 'repeat':
      return `Repetindo a wave ${c.next.wave}.`;
    case 'level_gate':
      return `Repetindo a wave ${c.next.wave} até liberar a próxima pelo nível.`;
    case 'content_limit':
      return `Fim do conteúdo atual: farmando a wave ${c.next.wave}.`;
  }
}
