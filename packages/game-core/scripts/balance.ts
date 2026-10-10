/**
 * Simulação de balanceamento das waves (Fase 2A).
 *
 *   pnpm --filter @astral/game-core sim:waves            → tabela no terminal
 *   pnpm --filter @astral/game-core sim:waves -- --md    → Markdown (docs/BALANCE.md)
 *
 * Modelo de jogador: entra na região no nível mínimo, com equipamento comum da região
 * anterior (ou só a arma inicial nos Campos), usa o modo Avançar e confere o jogo a cada
 * hora; se houve recuo automático, reativa o Avançar. Itens obtidos não são equipados
 * (cenário conservador). Tudo usa o motor real (`settleHunt`), sem atalhos.
 */

import {
  AFFINITY_IDS,
  CLASS_IDS,
  REGIONS,
  REGION_ORDER,
  applyWaveSettings,
  initialWaveProgress,
  settleHunt,
  waveCount,
  type AffinityId,
  type ClassId,
  type EquippedItem,
  type WaveClearEvent,
} from '../src/index.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_790_000_000_000;
const HOURS = 12;
/** O jogador confere o jogo a cada hora; a liquidação é feita em passos de 5 min. */
const STEP = 5 * MIN;

/** Equipamento comum "médio" usado ao entrar em cada região. */
function gearFor(regionId: string, classId: ClassId): EquippedItem[] {
  const starterAttack = classId === 'arcanist' ? 4 : 3;
  const weapon = (attack: number): EquippedItem => ({
    slot: 'weapon',
    rarity: 'common',
    upgradeLevel: 0,
    bonuses: { stats: { attack } },
  });
  if (regionId === 'campos-do-alvorecer') return [weapon(starterAttack)];
  const armor = (tier: 1 | 2): EquippedItem[] => [
    {
      slot: 'head',
      rarity: 'common',
      upgradeLevel: 0,
      bonuses: { stats: { defense: tier === 1 ? 2 : 4 } },
    },
    {
      slot: 'chest',
      rarity: 'common',
      upgradeLevel: 0,
      bonuses: { stats: { maxHp: tier === 1 ? 12 : 27, defense: tier === 1 ? 1 : 3 } },
    },
    {
      slot: 'hands',
      rarity: 'common',
      upgradeLevel: 0,
      bonuses: { stats: { critChanceBp: tier === 1 ? 85 : 150 } },
    },
    {
      slot: 'legs',
      rarity: 'common',
      upgradeLevel: 0,
      bonuses: { stats: { maxHp: tier === 1 ? 9 : 20 } },
    },
    {
      slot: 'feet',
      rarity: 'common',
      upgradeLevel: 0,
      bonuses: { attributes: { agi: tier === 1 ? 1 : 3 } },
    },
  ];
  if (regionId === 'bosque-das-mares-de-prata') return [weapon(4), ...armor(1)];
  return [weapon(10), ...armor(2)];
}

export interface RegionRun {
  regionId: string;
  classId: ClassId;
  affinity: AffinityId;
  startLevel: number;
  /** Minuto da primeira conclusão de cada wave; null = não concluída em 12 h. */
  clearedAtMin: Array<number | null>;
  retreats: number;
  winRateBp: number;
  xpPerHour: number;
  goldPerHour: number;
  finalLevel: number;
}

export function simulateRegion(
  regionId: string,
  classId: ClassId,
  affinity: AffinityId,
): RegionRun {
  const region = REGIONS[regionId]!;
  const equipment = gearFor(regionId, classId);
  let level = region.minLevel;
  let xp = 0;
  let next = 0;
  let last = T0;
  let progress = initialWaveProgress('advance', 1, 0);
  const clearedAtMin: Array<number | null> = Array.from({ length: waveCount(region) }, () => null);
  let retreats = 0;
  let wins = 0;
  let encounters = 0;
  let xpTotal = 0;
  let gold = 0;

  for (let elapsed = STEP; elapsed <= HOURS * HOUR; elapsed += STEP) {
    const r = settleHunt({
      regionId,
      seed: 1_000,
      nextEncounter: next,
      lastSettledAtMs: last,
      nowMs: T0 + elapsed,
      character: { classId, affinity, level, xp, equipment },
      progress,
    });
    next = r.nextEncounter;
    last = r.windowEndMs;
    level = r.level;
    xp = r.xp;
    progress = r.progress;
    wins += r.wins;
    encounters += r.encounters;
    xpTotal += r.xpGained;
    gold += r.gold + r.firstClearGold;
    for (const e of r.waveEvents) {
      if (e.type === 'retreat') retreats += 1;
      else if ((e as WaveClearEvent).firstClear) {
        clearedAtMin[e.wave - 1] ??= Math.ceil((e.atMs - T0) / MIN);
      }
    }
    // O jogador confere a cada hora: depois de um recuo, volta a avançar.
    if (elapsed % HOUR === 0 && progress.mode === 'farm' && progress.notice?.type === 'retreat') {
      progress = applyWaveSettings(region, progress, { mode: 'advance' }, level).progress;
    }
  }
  return {
    regionId,
    classId,
    affinity,
    startLevel: region.minLevel,
    clearedAtMin,
    retreats,
    winRateBp: encounters === 0 ? 0 : Math.floor((wins * 10_000) / encounters),
    xpPerHour: Math.floor(xpTotal / HOURS),
    goldPerHour: Math.floor(gold / HOURS),
    finalLevel: level,
  };
}

export interface FarmRun {
  wave: number;
  xpPerHour: number;
  goldPerHour: number;
  essencePerHour: number;
  itemsPerHour: number;
  winRateBp: number;
}

/** Rendimento de farmar cada wave por 1 h (Guardião Solar nível 6 com equipamento comum). */
export function farmComparison(regionId = 'campos-do-alvorecer', level = 6): FarmRun[] {
  const region = REGIONS[regionId]!;
  const equipment = gearFor('bosque-das-mares-de-prata', 'guardian');
  return Array.from({ length: waveCount(region) }, (_, i) => {
    const wave = i + 1;
    const r = settleHunt({
      regionId,
      seed: 2_024,
      nextEncounter: 0,
      lastSettledAtMs: T0,
      nowMs: T0 + HOUR,
      character: { classId: 'guardian', affinity: 'solar', level, xp: 0, equipment },
      progress: initialWaveProgress('farm', wave, waveCount(region)),
    });
    return {
      wave,
      xpPerHour: r.xpGained,
      goldPerHour: r.gold,
      essencePerHour: r.essence,
      itemsPerHour: r.drops.length,
      winRateBp: Math.floor((r.wins * 10_000) / Math.max(1, r.encounters)),
    };
  });
}

export function simulateAll(): RegionRun[] {
  const runs: RegionRun[] = [];
  for (const regionId of REGION_ORDER) {
    for (const classId of CLASS_IDS) {
      for (const affinity of AFFINITY_IDS) runs.push(simulateRegion(regionId, classId, affinity));
    }
  }
  return runs;
}

// Execução direta (tsx scripts/balance.ts)
if (process.argv[1]?.endsWith('balance.ts')) {
  const md = process.argv.includes('--md');
  const runs = simulateAll();
  const fmtHour = (m: number | null) => (m === null ? '—' : `${m}`);
  for (const regionId of REGION_ORDER) {
    const region = REGIONS[regionId]!;
    const header = Array.from({ length: waveCount(region) }, (_, i) => `W${i + 1}`);
    if (md) {
      console.log(`\n### ${region.name} (início no nível ${region.minLevel})\n`);
      console.log(
        `| Classe / afinidade | ${header.join(' | ')} | Recuos | Vitórias | XP/h | Ouro/h | Nível final |`,
      );
      console.log(`| --- | ${header.map(() => '---').join(' | ')} | --- | --- | --- | --- | --- |`);
    } else {
      console.log(
        `\n== ${region.name} (nível ${region.minLevel})  colunas: minuto da 1ª conclusão de cada wave`,
      );
    }
    for (const r of runs.filter((x) => x.regionId === regionId)) {
      const cells = [
        `${r.classId}/${r.affinity}`,
        ...r.clearedAtMin.map(fmtHour),
        String(r.retreats),
        `${(r.winRateBp / 100).toFixed(1)}%`,
        String(r.xpPerHour),
        String(r.goldPerHour),
        String(r.finalLevel),
      ];
      console.log(md ? `| ${cells.join(' | ')} |` : cells.join('  '));
    }
  }
  const farm = farmComparison();
  if (md) {
    console.log('\n### Farmar cada wave dos Campos por 1 h (Guardião Solar nível 6)\n');
    console.log('| Wave | XP/h | Ouro/h | Essência/h | Itens/h | Vitórias |');
    console.log('| --- | --- | --- | --- | --- | --- |');
  } else console.log('\n== Farmar cada wave dos Campos por 1 h (guardião solar nv 6)');
  for (const f of farm) {
    const cells = [
      String(f.wave),
      String(f.xpPerHour),
      String(f.goldPerHour),
      String(f.essencePerHour),
      String(f.itemsPerHour),
      `${(f.winRateBp / 100).toFixed(1)}%`,
    ];
    console.log(md ? `| ${cells.join(' | ')} |` : cells.join('  '));
  }
}
