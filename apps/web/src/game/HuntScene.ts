import type { EncounterView } from '@astral/shared';
import Phaser from 'phaser';
import type { HuntDirector, HuntSceneApi } from './director';
import {
  MONSTER_LOOKS,
  heroSprite,
  heroTextureKey,
  paintSprite,
  spriteSize,
  type HeroLook,
  type PixelSprite,
} from './pixelArt';

/** Dimensões lógicas do mundo (pixels da arte). */
export const WORLD_W = 320;
export const WORLD_H = 180;
/**
 * O canvas real é 3× maior e a câmera aplica zoom 3: a arte continua com pixels
 * nítidos (filtro nearest) e os textos são rasterizados na resolução final.
 */
export const RENDER_SCALE = 3;
const TILE = 16;
const HOME = { x: 84, y: 112 } as const;
const WALK_SPEED = 70; // px/s (mundo)

const RARITY_COLOR: Record<string, string> = {
  common: '#e5e7eb',
  uncommon: '#86efac',
  rare: '#7dd3fc',
  epic: '#d8b4fe',
  legendary: '#fdba74',
  astral: '#fde68a',
};

interface GroundPalette {
  base: readonly string[];
  speck: readonly [string, string];
  accents: readonly string[];
  path: readonly [string, string];
}

const GROUNDS: Record<string, GroundPalette> = {
  'campos-do-alvorecer': {
    base: ['#2f5a3c', '#33613f', '#2b5338'],
    speck: ['#3f7a4c', '#24472f'],
    accents: ['#f2c46d', '#c9a7ff'],
    path: ['#7d6a4b', '#9a8460'],
  },
  'bosque-das-mares-de-prata': {
    base: ['#22424a', '#264a52', '#1e3b42'],
    speck: ['#3a6b70', '#16303a'],
    accents: ['#c9d6ff', '#7fe3d0'],
    path: ['#3f6a7a', '#5a8fa8'],
  },
  'desfiladeiro-dos-trovoes': {
    base: ['#3d3540', '#443b47', '#362f39'],
    speck: ['#5a4f5e', '#2a242d'],
    accents: ['#ffd37a', '#7fe3ff'],
    path: ['#2a242d', '#4a4250'],
  },
};

/** PRNG local apenas para decoração. Resultados de jogo vêm sempre do servidor. */
function decorRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/**
 * Cena da caçada. Reproduz, em ordem, os encontros já liquidados pelo servidor:
 * caminhada até o monstro, golpes (com os danos reais quando disponíveis),
 * resultado e recompensas confirmadas. Nunca decide nada sozinha.
 */
export class HuntScene extends Phaser.Scene implements HuntSceneApi {
  private director!: HuntDirector;
  private hero!: Phaser.GameObjects.Sprite;
  private look: HeroLook | null = null;
  private maxHp = 1;
  private regionId = '';
  private queue: EncounterView[] = [];
  private playing = false;
  /** Incrementa ao trocar de região ou ao destruir a cena: invalida animações em curso. */
  private generation = 0;
  private ground: Phaser.GameObjects.Image | null = null;
  private idleTween: Phaser.Tweens.Tween | null = null;

  constructor() {
    super('hunt');
  }

  create(): void {
    this.director = this.registry.get('director') as HuntDirector;
    this.createSparkTexture();
    this.cameras.main
      .setBackgroundColor('#0b0d1f')
      .setZoom(RENDER_SCALE)
      .centerOn(WORLD_W / 2, WORLD_H / 2);
    this.hero = this.add.sprite(HOME.x, HOME.y, '__DEFAULT').setVisible(false).setDepth(HOME.y);
    this.addStardust();
    this.director.attach(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.generation += 1;
      this.director.detach(this);
    });
  }

  // ── API usada pelo React ───────────────────────────────────────────────

  setHero(look: HeroLook, maxHp: number): void {
    this.maxHp = Math.max(1, maxHp);
    const same = this.look && heroTextureKey(this.look, 0) === heroTextureKey(look, 0);
    this.look = look;
    if (same) return;
    const keys = [0, 1].map((f) => {
      const key = heroTextureKey(look, f as 0 | 1);
      this.ensureTexture(key, heroSprite(look, f as 0 | 1));
      return key;
    });
    const anim = `walk-${keys[0]}`;
    if (!this.anims.exists(anim)) {
      this.anims.create({
        key: anim,
        frames: keys.map((key) => ({ key })),
        frameRate: 7,
        repeat: -1,
      });
    }
    this.hero.setTexture(keys[0]!).setVisible(true);
    this.hero.setData('walkAnim', anim);
    this.director.hooks.onHeroHp?.(this.maxHp, this.maxHp);
    this.startIdle();
    if (this.queue.length > 0 && !this.playing) void this.playQueue();
  }

  setRegion(regionId: string): void {
    if (regionId === this.regionId) return;
    this.regionId = regionId;
    this.generation += 1;
    this.skip(this.queue.splice(0));
    this.playing = false;
    this.children.list.filter((o) => o.getData('monster') === true).forEach((o) => o.destroy());
    this.paintGround(regionId);
    this.hero.setPosition(HOME.x, HOME.y).setAlpha(1);
  }

  enqueue(encounters: EncounterView[]): void {
    this.queue.push(...encounters);
    // Muito atraso acumulado: mantém só os mais recentes para não reproduzir horas.
    // Os descartados vão direto para o registro de combate, sem animação.
    if (this.queue.length > 6) this.skip(this.queue.splice(0, this.queue.length - 6));
    if (!this.playing) void this.playQueue();
  }

  // ── Reprodução ─────────────────────────────────────────────────────────

  private skip(encounters: EncounterView[]): void {
    for (const e of encounters) this.director.hooks.onEncounterShown?.(e);
  }

  private async playQueue(): Promise<void> {
    if (!this.look) return;
    this.playing = true;
    const gen = this.generation;
    while (this.queue.length > 0 && gen === this.generation) {
      const encounter = this.queue.shift()!;
      const speed = this.queue.length >= 3 ? 3 : this.queue.length >= 1 ? 1.8 : 1;
      await this.playEncounter(encounter, speed, gen);
    }
    if (gen === this.generation) {
      this.playing = false;
      await this.walkTo(HOME.x, HOME.y, 1, gen);
      this.startIdle();
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(Math.max(0, ms), () => resolve()));
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private async walkTo(x: number, y: number, speed: number, gen: number): Promise<void> {
    if (gen !== this.generation) return;
    this.stopIdle();
    const dist = Math.hypot(x - this.hero.x, y - this.hero.y);
    if (dist < 1) return;
    this.hero.setFlipX(x < this.hero.x);
    const walk = this.hero.getData('walkAnim') as string | undefined;
    if (walk) this.hero.play(walk);
    await this.tween({
      targets: this.hero,
      x,
      y,
      duration: Math.min(1_400, (dist / WALK_SPEED) * 1000) / speed,
      onUpdate: () => this.hero.setDepth(this.hero.y),
    });
    this.hero.stop();
    if (this.look) this.hero.setTexture(heroTextureKey(this.look, 0));
  }

  private monsterSpot(index: number): { x: number; y: number } {
    return { x: 196 + ((index * 53) % 92), y: 62 + ((index * 37) % 86) };
  }

  private async playEncounter(e: EncounterView, speed: number, gen: number): Promise<void> {
    const look = MONSTER_LOOKS[e.monsterId];
    const spot = this.monsterSpot(e.index);
    const key = `monster-${e.monsterId}`;
    if (look) this.ensureTexture(key, look.sprite);

    const monster = this.add
      .sprite(spot.x, spot.y, look ? key : 'spark')
      .setScale(look?.scale ?? 1)
      .setAlpha(0)
      .setDepth(spot.y)
      .setFlipX(true)
      .setData('monster', true);
    const hpBg = this.add
      .rectangle(spot.x, spot.y - 14 * (look?.scale ?? 1), 18, 3, 0x1a1530)
      .setDepth(1_000)
      .setData('monster', true);
    const hpBar = this.add
      .rectangle(hpBg.x - 9, hpBg.y, 18, 3, 0xef4444)
      .setOrigin(0, 0.5)
      .setDepth(1_001)
      .setData('monster', true);
    const label = this.text(
      spot.x,
      hpBg.y - 6,
      `${e.monsterName} Nv ${e.monsterLevel}`,
      '#e5e7eb',
      7,
    ).setData('monster', true);
    const cleanup = () => [monster, hpBg, hpBar, label].forEach((o) => o.destroy());
    const bob = this.tweens.add({
      targets: monster,
      y: spot.y - 1.5,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    await this.tween({ targets: [monster, hpBg, hpBar, label], alpha: 1, duration: 250 / speed });
    await this.walkTo(spot.x - 22, spot.y + 2, speed, gen);
    if (gen !== this.generation) return cleanup();
    this.hero.setFlipX(false);

    const setMonsterHp = (hp: number) =>
      hpBar.setSize(Math.max(0, (18 * hp) / Math.max(1, e.monsterMaxHp)), 3);

    if (e.events && e.events.length > 0) {
      let last = 0;
      for (const ev of e.events) {
        await this.wait(Math.min(700, ev.atMs - last) / speed);
        if (gen !== this.generation) return cleanup();
        last = ev.atMs;
        if (ev.attacker === 'player') {
          this.lunge(this.hero, 4);
          this.hit(monster, ev.damage, ev.crit, '#fde68a');
          setMonsterHp(ev.targetHpAfter);
        } else {
          this.lunge(monster, -4);
          this.hit(this.hero, ev.damage, ev.crit, '#fca5a5');
          this.director.hooks.onHeroHp?.(ev.targetHpAfter, e.playerMaxHp);
        }
      }
    } else {
      // Sem golpes individuais (encontro antigo): mostra os totais confirmados.
      for (let i = 0; i < 2; i += 1) {
        await this.wait(350 / speed);
        this.lunge(this.hero, 4);
        this.lunge(monster, -4);
      }
      this.hit(monster, e.damageDealt, false, '#fde68a');
      if (e.damageTaken > 0) this.hit(this.hero, e.damageTaken, false, '#fca5a5');
      setMonsterHp(e.outcome === 'win' ? 0 : e.monsterMaxHp - e.damageDealt);
    }
    if (gen !== this.generation) return cleanup();

    bob.stop();
    if (e.outcome === 'win') {
      await this.tween({
        targets: [monster, hpBg, hpBar, label],
        alpha: 0,
        scale: 0.3,
        duration: 260 / speed,
      });
      this.burst(spot.x, spot.y);
      const lines: Array<[string, string]> = [[`+${e.xp} XP`, '#a5b4fc']];
      if (e.gold > 0) lines.push([`+${e.gold} ouro`, '#fcd34d']);
      if (e.essence > 0) lines.push([`+${e.essence} essência`, '#c4b5fd']);
      if (e.drop) {
        lines.push([
          e.drop.kept ? `★ ${e.drop.name}` : `${e.drop.name} (inventário cheio)`,
          RARITY_COLOR[e.drop.rarity] ?? '#fff',
        ]);
      }
      lines.forEach(([text, color], i) =>
        this.floatText(this.hero.x, this.hero.y - 16 - i * 8, text, color, 900 + i * 120),
      );
      if (e.levelUp) this.levelUpBanner(e.levelAfter);
    } else {
      this.floatText(
        this.hero.x,
        this.hero.y - 16,
        e.outcome === 'loss' ? 'Derrotado' : 'Fuga',
        '#fca5a5',
        1_000,
      );
      await this.tween({ targets: this.hero, alpha: 0.35, duration: 200, yoyo: true, repeat: 2 });
      await this.tween({ targets: [monster, hpBg, hpBar, label], alpha: 0, duration: 300 / speed });
    }
    cleanup();
    this.director.hooks.onHeroHp?.(e.playerMaxHp, e.playerMaxHp);
    this.director.hooks.onEncounterShown?.(e);
    await this.wait(250 / speed);
  }

  // ── Efeitos ────────────────────────────────────────────────────────────

  private lunge(target: Phaser.GameObjects.Sprite, dx: number): void {
    this.tweens.add({ targets: target, x: target.x + dx, duration: 70, yoyo: true });
  }

  private hit(
    target: Phaser.GameObjects.Sprite,
    damage: number,
    crit: boolean,
    color: string,
  ): void {
    target.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(90, () => target.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
    this.floatText(
      target.x + (Math.random() * 6 - 3),
      target.y - 10,
      crit ? `${damage}!` : String(damage),
      crit ? '#fbbf24' : color,
      650,
      crit ? 10 : 8,
    );
  }

  private text(
    x: number,
    y: number,
    value: string,
    color: string,
    size = 8,
  ): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, value, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: `${size}px`,
        color,
        stroke: '#0b0d1f',
        strokeThickness: 2,
        resolution: RENDER_SCALE,
      })
      .setOrigin(0.5, 1)
      .setDepth(2_000);
    // Com pixelArt o Phaser usa filtro "nearest" em tudo; o texto usa linear
    // (já está na resolução final, então fica liso em vez de serrilhado).
    text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return text;
  }

  private floatText(
    x: number,
    y: number,
    value: string,
    color: string,
    duration: number,
    size = 8,
  ): void {
    const t = this.text(x, y, value, color, size);
    this.tweens.add({
      targets: t,
      y: y - 14,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private levelUpBanner(level: number): void {
    const t = this.text(WORLD_W / 2, 40, `Nível ${level}!`, '#fde68a', 14);
    this.burst(this.hero.x, this.hero.y - 8);
    this.tweens.add({
      targets: t,
      y: 32,
      alpha: 0,
      delay: 900,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  private burst(x: number, y: number): void {
    for (let i = 0; i < 6; i += 1) {
      const s = this.add.image(x, y, 'spark').setDepth(1_500).setScale(0.5);
      const angle = (Math.PI * 2 * i) / 6;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(angle) * 12,
        y: y + Math.sin(angle) * 12,
        alpha: 0,
        duration: 380,
        onComplete: () => s.destroy(),
      });
    }
  }

  private startIdle(): void {
    if (this.idleTween || !this.look) return;
    this.idleTween = this.tweens.add({
      targets: this.hero,
      scaleY: 0.96,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
  }

  private stopIdle(): void {
    this.idleTween?.stop();
    this.idleTween = null;
    this.hero.setScale(1);
  }

  // ── Texturas ───────────────────────────────────────────────────────────

  private ensureTexture(key: string, sprite: PixelSprite): void {
    if (this.textures.exists(key)) return;
    const { width, height } = spriteSize(sprite);
    const texture = this.textures.createCanvas(key, width, height);
    if (!texture) throw new Error(`não foi possível criar a textura ${key}`);
    paintSprite(texture.context, sprite);
    texture.refresh();
  }

  private createSparkTexture(): void {
    this.ensureTexture('spark', {
      palette: { w: '#ffffff', g: '#f2c46d' },
      rows: ['...g...', '...w...', '..gwg..', 'gwwwwwg', '..gwg..', '...w...', '...g...'],
    });
  }

  private paintGround(regionId: string): void {
    const key = `ground-${regionId}`;
    if (!this.textures.exists(key)) {
      const palette = GROUNDS[regionId] ?? GROUNDS['campos-do-alvorecer']!;
      const texture = this.textures.createCanvas(key, WORLD_W, WORLD_H);
      if (!texture) throw new Error('não foi possível criar o terreno');
      const ctx = texture.context;
      const rand = decorRng(regionId.length * 7_919 + 20_261_009);
      for (let row = 0; row * TILE < WORLD_H; row += 1) {
        for (let col = 0; col * TILE < WORLD_W; col += 1) {
          ctx.fillStyle = palette.base[Math.floor(rand() * palette.base.length)]!;
          ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
          for (let i = 0; i < 6; i += 1) {
            ctx.fillStyle = rand() < 0.5 ? palette.speck[0] : palette.speck[1];
            ctx.fillRect(
              col * TILE + Math.floor(rand() * TILE),
              row * TILE + Math.floor(rand() * TILE),
              1,
              2,
            );
          }
          if (rand() < 0.07) {
            ctx.fillStyle = palette.accents[Math.floor(rand() * palette.accents.length)]!;
            ctx.fillRect(
              col * TILE + 4 + Math.floor(rand() * 8),
              row * TILE + 4 + Math.floor(rand() * 8),
              2,
              2,
            );
          }
        }
      }
      // Trilha da área de caça.
      ctx.fillStyle = palette.path[0];
      ctx.fillRect(40, HOME.y + 8, WORLD_W - 60, 7);
      for (let i = 0; i < 70; i += 1) {
        ctx.fillStyle = palette.path[1];
        ctx.fillRect(
          40 + Math.floor(rand() * (WORLD_W - 60)),
          HOME.y + 9 + Math.floor(rand() * 5),
          2,
          1,
        );
      }
      texture.refresh();
    }
    this.ground?.destroy();
    this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-1_000);
  }

  private addStardust(): void {
    const rand = decorRng(777);
    for (let i = 0; i < 26; i += 1) {
      const dot = this.add
        .rectangle(rand() * WORLD_W, rand() * WORLD_H, 1, 1, rand() < 0.7 ? 0xfff3c4 : 0xbfd4ff)
        .setDepth(2_500)
        .setAlpha(0);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0, to: 0.8 },
        y: dot.y - 5,
        duration: 1_600 + rand() * 1_800,
        delay: rand() * 3_000,
        yoyo: true,
        repeat: -1,
      });
    }
  }
}
