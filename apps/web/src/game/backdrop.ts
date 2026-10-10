/**
 * Cenários das regiões em pixel art procedural (400×180, panorâmico), originais e determinísticos.
 * Usados pela cena Phaser (como textura) e pelas miniaturas das regiões na interface.
 *
 * Arte PROVISÓRIA da Fase 2B: composição em camadas (céu, lua, montanhas, castelo ou
 * penhascos, floresta, chão, trilha, ruínas e vegetação). Os cenários definitivos
 * desenhados à mão são o foco da Fase 2C.
 */

export const BACKDROP_W = 400;
/** Deslocamento dos elementos centrais (a arte foi composta numa grade de 320). */
const OFF = (BACKDROP_W - 320) / 2;
export const BACKDROP_H = 180;
/** Linha (y) onde ficam os pés dos personagens na trilha. */
export const STAGE_FLOOR_Y = 148;

interface RegionLook {
  sky: readonly string[];
  stars: readonly string[];
  moon: { x: number; y: number; r: number; color: string; shade: string; glow: string } | null;
  mountains: readonly [string, string];
  feature: 'castle' | 'grove' | 'cliffs';
  forest: readonly [string, string, string];
  ground: readonly [string, string, string];
  flowers: readonly string[];
  path: readonly [string, string, string];
  stone: readonly [string, string, string];
  moss: string;
  banner: readonly [string, string];
  water: readonly [string, string] | null;
  accent: string;
}

const LOOKS: Record<string, RegionLook> = {
  'campos-do-alvorecer': {
    sky: ['#070a2c', '#0c1140', '#141a5a', '#231f6e', '#3a2a80', '#563791'],
    stars: ['#ffffff', '#fff3c4', '#c9d6ff'],
    moon: { x: 214, y: 30, r: 13, color: '#f3f1ff', shade: '#c7c9ee', glow: '#5b5bc8' },
    mountains: ['#1a1a52', '#232566'],
    feature: 'castle',
    forest: ['#0d2232', '#112b37', '#183a3c'],
    ground: ['#1f4a30', '#245636', '#2c6640'],
    flowers: ['#ff8fc8', '#ffd36a', '#b79bff', '#ff7a5c'],
    path: ['#5b4a32', '#7a6444', '#998058'],
    stone: ['#3b3f5e', '#555a7d', '#7a80a3'],
    moss: '#2f6b45',
    banner: ['#4b2a8f', '#f2c46d'],
    water: ['#6fb7ff', '#d5f0ff'],
    accent: '#ffd77a',
  },
  'bosque-das-mares-de-prata': {
    sky: ['#06142a', '#0a1d3a', '#0f2a4a', '#173a5a', '#22506a', '#2f6a78'],
    stars: ['#ffffff', '#d9f4ff', '#c9d6ff'],
    moon: { x: 90, y: 28, r: 11, color: '#eaf6ff', shade: '#b9d4e6', glow: '#3d7fa8' },
    mountains: ['#0f2840', '#16354d'],
    feature: 'grove',
    forest: ['#0b2328', '#0f2f33', '#17423f'],
    ground: ['#1c3f3f', '#21494a', '#2a5a58'],
    flowers: ['#c9d6ff', '#7fe3d0', '#ffffff', '#9fd7ff'],
    path: ['#36566a', '#4a7086', '#6390a8'],
    stone: ['#334a5a', '#4a6577', '#6f8ea0'],
    moss: '#2f6b5e',
    banner: ['#1f5f7a', '#c9d6ff'],
    water: ['#3f8fb0', '#bfeaff'],
    accent: '#7fe3d0',
  },
  'desfiladeiro-dos-trovoes': {
    sky: ['#0c0718', '#160c26', '#231338', '#2f1a45', '#3d2250', '#4a2a55'],
    stars: ['#ffffff', '#ffe9b0'],
    moon: null,
    mountains: ['#1c1424', '#261c30'],
    feature: 'cliffs',
    forest: ['#1a1520', '#221b29', '#2b2333'],
    ground: ['#352d39', '#3d3441', '#463c4b'],
    flowers: ['#ffb347', '#7fe3ff', '#ffd37a'],
    path: ['#241e29', '#2f2735', '#3e3546'],
    stone: ['#2a2430', '#3d3445', '#574c60'],
    moss: '#4a3d55',
    banner: ['#6b2a2a', '#ffd37a'],
    water: null,
    accent: '#7fe3ff',
  },
};

export function regionLook(regionId: string): RegionLook {
  return LOOKS[regionId] ?? LOOKS['campos-do-alvorecer']!;
}

/** PRNG local apenas para decoração. Resultados de jogo vêm sempre do servidor. */
function decorRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function seedOf(regionId: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < regionId.length; i += 1)
    h = Math.imul(h ^ regionId.charCodeAt(i), 16_777_619);
  return h >>> 0;
}

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y += 1) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

/** Faixas de cor com transição pontilhada (dithering), típica de pixel art. */
function skyBands(ctx: Ctx, colors: readonly string[], height: number) {
  const band = height / colors.length;
  colors.forEach((color, i) => {
    const y0 = Math.floor(i * band);
    rect(ctx, 0, y0, BACKDROP_W, Math.ceil(band) + 1, color);
    const next = colors[i + 1];
    if (!next) return;
    const edge = Math.floor((i + 1) * band);
    ctx.fillStyle = next;
    // Transição em xadrez: densidade crescente nas 4 linhas antes da próxima faixa.
    for (let row = 1; row <= 4; row += 1) {
      const y = edge - row;
      for (let x = 0; x < BACKDROP_W; x += 1) {
        const on =
          row === 1
            ? (x + y) % 2 === 0
            : row === 2
              ? (x + y) % 3 === 0
              : (x * 3 + y) % (row * 3) === 0;
        if (on) ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

function ridge(
  ctx: Ctx,
  rand: () => number,
  base: number,
  amplitude: number,
  color: string,
  bottom: number,
) {
  ctx.fillStyle = color;
  let y = base;
  for (let x = 0; x < BACKDROP_W; x += 2) {
    y += (rand() - 0.5) * amplitude;
    y = Math.max(base - amplitude * 3, Math.min(base + amplitude, y));
    ctx.fillRect(x, Math.round(y), 2, bottom - Math.round(y));
  }
}

function castle(ctx: Ctx, look: RegionLook, rand: () => number) {
  const dark = '#121342';
  const mid = '#1a1c56';
  const base = 96;
  // Colina.
  for (let x = 150 + OFF; x < 262 + OFF; x += 1) {
    const h = Math.round(10 * Math.sin(((x - 150 - OFF) / 112) * Math.PI));
    rect(ctx, x, base - h, 1, h + 8, mid);
  }
  const towers: Array<[number, number, number]> = [
    [172, 22, 6],
    [184, 34, 8],
    [198, 44, 9],
    [212, 30, 7],
    [226, 38, 8],
    [240, 20, 6],
  ];
  rect(ctx, 168 + OFF, base - 18, 80, 18, dark); // muralha
  for (let x = 168 + OFF; x < 248 + OFF; x += 4) rect(ctx, x, base - 21, 2, 3, dark); // ameias
  for (const [tx, h, w] of towers) {
    const x = tx + OFF;
    rect(ctx, x, base - h, w, h, dark);
    // Telhado pontudo.
    for (let i = 0; i < Math.ceil(w / 2) + 2; i += 1) {
      rect(ctx, x + i - 1, base - h - (Math.ceil(w / 2) + 2) + i, w + 2 - i * 2, 1, dark);
    }
    // Janelas acesas.
    for (let wy = base - h + 4; wy < base - 6; wy += 6) {
      if (rand() < 0.75) rect(ctx, x + Math.floor(w / 2) - 1, wy, 1, 2, look.accent);
    }
  }
  // Portão e janelas na muralha.
  rect(ctx, 204 + OFF, base - 9, 6, 9, '#0a0b2c');
  for (let x = 172 + OFF; x < 246 + OFF; x += 9)
    if (rand() < 0.5) rect(ctx, x, base - 12, 1, 2, look.accent);
}

function grove(ctx: Ctx, look: RegionLook, rand: () => number) {
  // Árvores prateadas altas ao fundo.
  for (let i = 0; i < Math.ceil(BACKDROP_W / 34) - 1; i += 1) {
    const x = 20 + i * 34 + Math.floor(rand() * 12);
    const h = 40 + Math.floor(rand() * 24);
    rect(ctx, x, 100 - h, 3, h, '#9fb6c8');
    rect(ctx, x + 1, 100 - h, 1, h, '#d5e6f2');
    disc(ctx, x + 1, 100 - h, 9 + Math.floor(rand() * 4), i % 2 ? '#1d4a52' : '#235a5e');
    for (let k = 0; k < 6; k += 1) {
      rect(
        ctx,
        x - 6 + Math.floor(rand() * 14),
        100 - h - 6 + Math.floor(rand() * 10),
        1,
        1,
        look.accent,
      );
    }
  }
}

function cliffs(ctx: Ctx, look: RegionLook, rand: () => number) {
  // Penhascos de basalto nas laterais, com fendas incandescentes.
  for (const side of [0, 1]) {
    for (let x = 0; x < 70; x += 1) {
      const px = side === 0 ? x : BACKDROP_W - 1 - x;
      const top = 20 + Math.round(x * 0.9 + rand() * 6);
      rect(ctx, px, top, 1, 120 - top, x % 7 === 0 ? look.stone[1] : look.stone[0]);
    }
  }
  for (let i = 0; i < 14; i += 1) {
    const x = rand() < 0.5 ? Math.floor(rand() * 60) : BACKDROP_W - 1 - Math.floor(rand() * 60);
    let y = 50 + Math.floor(rand() * 50);
    for (let k = 0; k < 6; k += 1) {
      rect(ctx, x + (k % 2), y, 1, 1, '#ff9b3d');
      y += 1;
    }
  }
  // Nuvens de tempestade e um relâmpago.
  for (let i = 0; i < 6; i += 1) {
    const cx = 60 + OFF + i * 42 + Math.floor(rand() * 10);
    for (let k = 0; k < 5; k += 1) disc(ctx, cx + k * 6, 18 + Math.floor(rand() * 6), 7, '#2a1d3a');
  }
  let lx = 196 + OFF;
  for (let y = 26; y < 80; y += 1) {
    if (y % 6 === 0) {
      const step = rand() < 0.5 ? -3 : 3;
      rect(ctx, Math.min(lx, lx + step), y, Math.abs(step) + 1, 1, '#e8fbff');
      lx += step;
    }
    rect(ctx, lx, y, 1, 1, '#e8fbff');
    if (y % 2 === 0) rect(ctx, lx + 1, y, 1, 1, '#7fe3ff');
  }
}

function forestLine(ctx: Ctx, look: RegionLook, rand: () => number, base: number) {
  for (let x = -6; x < BACKDROP_W + 6; x += 5 + Math.floor(rand() * 4)) {
    const h = 10 + Math.floor(rand() * 14);
    const color = look.forest[Math.floor(rand() * look.forest.length)]!;
    if (rand() < 0.5) {
      // Pinheiro.
      for (let i = 0; i < h; i += 1)
        rect(ctx, x - Math.floor(i / 3), base - h + i, 1 + Math.floor((i / 3) * 2), 1, color);
    } else {
      disc(ctx, x, base - Math.floor(h / 2), Math.floor(h / 2), color);
    }
  }
  rect(ctx, 0, base, BACKDROP_W, 14, look.forest[0]);
}

function waterfall(ctx: Ctx, look: RegionLook) {
  if (!look.water || look.feature !== 'castle') return;
  const [deep, light] = look.water;
  // Rochedo de onde a água cai.
  for (let x = 112 + OFF; x < 158 + OFF; x += 1) {
    const top = 80 + Math.round(Math.abs(x - 135 - OFF) * 0.35);
    rect(ctx, x, top, 1, 30, x % 5 === 0 ? '#20235e' : '#181a4c');
  }
  rect(ctx, 128 + OFF, 82, 14, 28, deep);
  for (let y = 82; y < 110; y += 1) {
    for (let x = 129 + OFF; x < 141 + OFF; x += 3)
      if ((x + y) % 4 === 0) rect(ctx, x, y, 1, 2, light);
  }
  rect(ctx, 128 + OFF, 82, 1, 28, light);
  // Lago e névoa na base.
  for (let y = 0; y < 6; y += 1) rect(ctx, 116 + OFF - y * 2, 108 + y, 38 + y * 4, 1, deep);
  for (let x = 114 + OFF; x < 158 + OFF; x += 3) rect(ctx, x, 109 + (x % 2), 2, 1, light);
  ctx.globalAlpha = 0.35;
  disc(ctx, 135 + OFF, 108, 9, '#d5f0ff');
  ctx.globalAlpha = 1;
}

function pool(ctx: Ctx, look: RegionLook) {
  if (!look.water || look.feature !== 'grove') return;
  const [deep, light] = look.water;
  for (let y = 0; y < 10; y += 1) {
    const half = Math.round(60 * Math.sqrt(1 - ((y - 5) / 5.5) ** 2));
    rect(ctx, 160 + OFF - half, 116 + y, half * 2, 1, deep);
  }
  for (let x = 110 + OFF; x < 210 + OFF; x += 7) rect(ctx, x, 119 + (x % 3), 3, 1, light);
}

function ground(ctx: Ctx, look: RegionLook, rand: () => number) {
  const [dark, mid, light] = look.ground;
  // Faixas: mais claro perto do horizonte, mais escuro no primeiro plano.
  rect(ctx, 0, 112, BACKDROP_W, 22, mid);
  rect(ctx, 0, 134, BACKDROP_W, 46, dark);
  for (let x = 0; x < BACKDROP_W; x += 1) if ((x * 7) % 3 === 0) rect(ctx, x, 133, 1, 1, mid);
  // Manchas suaves de grama.
  for (let i = 0; i < 70; i += 1) {
    const x = Math.floor(rand() * BACKDROP_W);
    const y = 112 + Math.floor(rand() * 66);
    rect(ctx, x, y, 6 + Math.floor(rand() * 10), 2, y < 134 ? light : mid);
  }
  // Tufos de grama em forma de "v".
  for (let i = 0; i < 160; i += 1) {
    const x = Math.floor(rand() * BACKDROP_W);
    const y = 114 + Math.floor(rand() * 64);
    const c = y < 134 ? light : mid;
    rect(ctx, x, y, 1, 2, c);
    rect(ctx, x + 2, y, 1, 2, c);
    rect(ctx, x + 1, y + 1, 1, 2, c);
  }
}

function trail(ctx: Ctx, look: RegionLook, rand: () => number) {
  const [dark, mid, light] = look.path;
  for (let x = 0; x < BACKDROP_W; x += 1) {
    const wave = Math.round(Math.sin(x / 38) * 2);
    const top = STAGE_FLOOR_Y - 9 + wave;
    rect(ctx, x, top, 1, 16, mid);
    rect(ctx, x, top, 1, 1, dark);
    rect(ctx, x, top + 15, 1, 1, dark);
  }
  for (let i = 0; i < 90; i += 1) {
    rect(
      ctx,
      Math.floor(rand() * BACKDROP_W),
      STAGE_FLOOR_Y - 7 + Math.floor(rand() * 12),
      2,
      1,
      light,
    );
  }
}

function flowers(ctx: Ctx, look: RegionLook, rand: () => number) {
  for (let i = 0; i < 70; i += 1) {
    const x = Math.floor(rand() * BACKDROP_W);
    const y = 116 + Math.floor(rand() * 62);
    if (Math.abs(y - STAGE_FLOOR_Y) < 10) continue;
    const c = look.flowers[Math.floor(rand() * look.flowers.length)]!;
    rect(ctx, x, y, 1, 1, c);
    rect(ctx, x, y + 1, 1, 1, look.ground[0]);
  }
}

function ruins(ctx: Ctx, look: RegionLook, rand: () => number) {
  const [dark, mid, light] = look.stone;
  const pillar = (x: number, top: number, w: number) => {
    for (let y = top; y < STAGE_FLOOR_Y - 8; y += 5) {
      const offset = (y / 5) % 2 === 0 ? 0 : 3;
      for (let bx = x - offset; bx < x + w; bx += 6) {
        const left = Math.max(x, bx);
        const right = Math.min(x + w, bx + 6);
        rect(ctx, left, y, right - left, 5, mid);
        rect(ctx, left, y, right - left, 1, light);
        rect(ctx, left, y + 4, right - left, 1, dark);
        rect(ctx, right - 1, y, 1, 5, dark);
      }
    }
    for (let i = 0; i < 6; i += 1)
      rect(ctx, x + Math.floor(rand() * w), top + Math.floor(rand() * 40), 2, 1, look.moss);
  };
  pillar(8, 62, 14);
  pillar(44, 74, 12);
  // Arco entre as colunas.
  for (let i = 0; i < 22; i += 1) {
    const ax = 22 + i;
    const ay = 62 + Math.round(8 * (1 - Math.sin((i / 22) * Math.PI)));
    rect(ctx, ax, ay, 1, 6, mid);
    rect(ctx, ax, ay, 1, 1, light);
  }
  // Estandarte com uma estrela de quatro pontas (símbolo original do jogo).
  const [cloth, star] = look.banner;
  rect(ctx, 27, 70, 12, 26, cloth);
  for (let i = 0; i < 6; i += 1) rect(ctx, 27 + i, 96 + i, 12 - i * 2, 1, cloth);
  rect(ctx, 26, 69, 14, 2, '#b8872f');
  rect(ctx, 32, 76, 2, 12, star);
  rect(ctx, 28, 81, 10, 2, star);
  rect(ctx, 31, 79, 4, 6, star);
  rect(ctx, 32, 81, 2, 2, cloth);
  // Blocos caídos.
  rect(ctx, 64, STAGE_FLOOR_Y - 14, 8, 5, mid);
  rect(ctx, 64, STAGE_FLOOR_Y - 14, 8, 1, light);
  rect(ctx, BACKDROP_W - 34, STAGE_FLOOR_Y - 16, 10, 6, mid);
  rect(ctx, BACKDROP_W - 34, STAGE_FLOOR_Y - 16, 10, 1, light);
}

function canopy(ctx: Ctx, look: RegionLook, rand: () => number) {
  if (look.feature === 'cliffs') return;
  const [dark, mid] = look.forest;
  for (const side of [0, 1]) {
    for (let i = 0; i < 16; i += 1) {
      const x =
        side === 0 ? Math.floor(rand() * 40) - 10 : BACKDROP_W - Math.floor(rand() * 40) + 10;
      const y = Math.floor(rand() * 34) - 8;
      disc(ctx, x, y, 7 + Math.floor(rand() * 6), i % 3 === 0 ? mid : dark);
    }
    // Tronco escuro na borda.
    rect(ctx, side === 0 ? 0 : BACKDROP_W - 5, 0, 5, 140, dark);
  }
}

function foreground(ctx: Ctx, look: RegionLook, rand: () => number) {
  const dark = look.forest[0];
  for (let x = -4; x < BACKDROP_W + 4; x += 6) {
    const edge = x < 70 || x > BACKDROP_W - 70;
    const h = edge ? 8 + Math.floor(rand() * 8) : 2 + Math.floor(rand() * 4);
    disc(ctx, x, BACKDROP_H + 2, h, dark);
  }
}

/** Posições das tochas (o Phaser anima as chamas por cima do cenário). */
export function torchPositions(regionId: string): Array<{ x: number; y: number }> {
  return regionLook(regionId).feature === 'cliffs'
    ? [
        { x: 74, y: 112 },
        { x: BACKDROP_W - 68, y: 112 },
      ]
    : [
        { x: 15, y: 58 },
        { x: 50, y: 70 },
      ];
}

/** Desenha o cenário completo da região no contexto informado (400×180). */
export function paintBackdrop(ctx: Ctx, regionId: string): void {
  const look = regionLook(regionId);
  const rand = decorRng(seedOf(regionId));
  ctx.imageSmoothingEnabled = false;
  skyBands(ctx, look.sky, 112);
  for (let i = 0; i < 110; i += 1) {
    const x = Math.floor(rand() * BACKDROP_W);
    const y = Math.floor(rand() * 90);
    rect(ctx, x, y, 1, 1, look.stars[Math.floor(rand() * look.stars.length)]!);
  }
  if (look.moon) {
    const m = { ...look.moon, x: look.moon.x + OFF };
    for (let r = m.r + 9; r > m.r; r -= 3) {
      ctx.globalAlpha = 0.12;
      disc(ctx, m.x, m.y, r, m.glow);
    }
    ctx.globalAlpha = 1;
    disc(ctx, m.x, m.y, m.r, m.color);
    disc(ctx, m.x + 4, m.y - 3, 3, m.shade);
    disc(ctx, m.x - 5, m.y + 4, 2, m.shade);
    disc(ctx, m.x + 2, m.y + 6, 1, m.shade);
  }
  ridge(ctx, rand, 88, 3, look.mountains[0], 112);
  ridge(ctx, rand, 98, 2, look.mountains[1], 112);
  if (look.feature === 'castle') castle(ctx, look, rand);
  if (look.feature === 'grove') grove(ctx, look, rand);
  if (look.feature === 'cliffs') cliffs(ctx, look, rand);
  forestLine(ctx, look, rand, 108);
  waterfall(ctx, look);
  ground(ctx, look, rand);
  pool(ctx, look);
  trail(ctx, look, rand);
  flowers(ctx, look, rand);
  ruins(ctx, look, rand);
  canopy(ctx, look, rand);
  foreground(ctx, look, rand);
}
