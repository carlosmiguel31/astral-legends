import type { EncounterView } from '@astral/shared';
import Phaser from 'phaser';
import {
  BACKDROP_H,
  BACKDROP_W,
  STAGE_FLOOR_Y,
  paintBackdrop,
  regionLook,
  torchPositions,
} from './backdrop';
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
export const WORLD_W = BACKDROP_W;
export const WORLD_H = BACKDROP_H;
/**
 * O canvas real é 3× maior e a câmera aplica zoom 3: a arte continua com pixels
 * nítidos (filtro nearest) e os textos são rasterizados na resolução final.
 */
export const RENDER_SCALE = 3;
/** Personagens em escala inteira (pixels nítidos, sem distorção). */
const HERO_SCALE = 2;
const HERO_H = 16 * HERO_SCALE;
const HOME = { x: 118, y: STAGE_FLOOR_Y } as const;
const WALK_SPEED = 90; // px/s (mundo)

/** Destaque visual dos encontros especiais (sempre indicados pelo servidor). */
const SPECIAL = {
  elite: { tag: 'ELITE', color: '#d9c8ff', aura: 0xa78bfa, banner: 'Um elite se aproxima!' },
  boss: { tag: 'CHEFE', color: '#fecdd3', aura: 0xf43f5e, banner: 'O chefe da região surgiu!' },
} as const;

const RARITY_COLOR: Record<string, string> = {
  common: '#e5e7eb',
  uncommon: '#86efac',
  rare: '#7dd3fc',
  epic: '#f0abfc',
  legendary: '#fdba74',
  astral: '#fde68a',
};

/** PRNG local apenas para decoração. Resultados de jogo vêm sempre do servidor. */
function decorRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

/** Escala inteira do monstro: dobra a escala de referência da arte, arredondada. */
function monsterScale(lookScale: number): number {
  return Math.max(2, Math.round(lookScale * 2));
}

interface HpBar {
  bg: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  width: number;
}

/**
 * Cena da caçada. Reproduz, em ordem, os encontros já liquidados pelo servidor:
 * caminhada até o monstro, golpes (com os danos reais quando disponíveis),
 * resultado e recompensas confirmadas. Nunca decide nada sozinha.
 */
export class HuntScene extends Phaser.Scene implements HuntSceneApi {
  private director!: HuntDirector;
  private hero!: Phaser.GameObjects.Sprite;
  private heroBar!: HpBar;
  private look: HeroLook | null = null;
  private maxHp = 1;
  private regionId = '';
  private queue: EncounterView[] = [];
  private playing = false;
  /** Incrementa ao trocar de região ou ao destruir a cena: invalida animações em curso. */
  private generation = 0;
  private scenery: Phaser.GameObjects.GameObject[] = [];
  private idleTween: Phaser.Tweens.Tween | null = null;
  private hunting = false;
  private searchText: Phaser.GameObjects.Text | null = null;
  /** Última wave anunciada na tela (para a transição "Wave N"). */
  private shownWave: string | null = null;

  constructor() {
    super('hunt');
  }

  create(): void {
    this.director = this.registry.get('director') as HuntDirector;
    this.createSparkTexture();
    this.createFlameTextures();
    this.cameras.main
      .setBackgroundColor('#070a2c')
      .setZoom(RENDER_SCALE)
      .centerOn(WORLD_W / 2, WORLD_H / 2);
    this.hero = this.add
      .sprite(HOME.x, HOME.y, '__DEFAULT')
      .setOrigin(0.5, 1)
      .setScale(HERO_SCALE)
      .setVisible(false)
      .setDepth(HOME.y);
    this.heroBar = this.makeBar(HOME.x, HOME.y - HERO_H - 4, 24, 0x4ade80, 2_100);
    this.setBarVisible(this.heroBar, false);
    this.addFireflies();
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
        frameRate: 8,
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
    this.shownWave = null;
    this.children.list.filter((o) => o.getData('monster') === true).forEach((o) => o.destroy());
    this.paintScenery(regionId);
    this.stopIdle();
    this.hero.setPosition(HOME.x, HOME.y).setAlpha(1).setAngle(0);
    this.setBarVisible(this.heroBar, false);
    this.startIdle();
  }

  setHunting(active: boolean): void {
    if (active === this.hunting) return;
    this.hunting = active;
    if (!active) this.shownWave = null;
    // Troca entre patrulha (procurando monstros) e descanso, se nada estiver tocando.
    if (!this.playing) {
      this.stopIdle();
      this.startIdle();
    }
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
      onUpdate: () => {
        this.hero.setDepth(this.hero.y);
        this.moveBar(this.heroBar, this.hero.x, this.hero.y - HERO_H - 4);
      },
    });
    this.hero.stop();
    if (this.look) this.hero.setTexture(heroTextureKey(this.look, 0));
  }

  private monsterSpot(index: number): { x: number; y: number } {
    return { x: 232 + ((index * 53) % 96), y: STAGE_FLOOR_Y - 2 + ((index * 37) % 7) };
  }

  private async playEncounter(e: EncounterView, speed: number, gen: number): Promise<void> {
    const look = MONSTER_LOOKS[e.monsterId];
    const special = e.kind === 'elite' || e.kind === 'boss' ? SPECIAL[e.kind] : null;
    // Especiais nunca são acelerados: são o clímax da wave.
    if (special) speed = 1;
    const spot = special ? { x: 290, y: STAGE_FLOOR_Y + 1 } : this.monsterSpot(e.index);
    const key = `monster-${e.monsterId}`;
    if (look) this.ensureTexture(key, look.sprite);
    const scale = monsterScale(look?.scale ?? 1);
    const height = (look ? spriteSize(look.sprite).height : 8) * scale;
    const width = (look ? spriteSize(look.sprite).width : 8) * scale;
    // Encontro confirmado: a patrulha de busca termina antes de o monstro aparecer.
    this.stopIdle();

    if (gen !== this.generation) return;
    await this.waveIntro(e, gen);
    if (special) await this.specialIntro(special, e.kind === 'boss', gen);
    if (gen !== this.generation) return;

    const aura = special
      ? this.add
          .ellipse(spot.x, spot.y - 1, width + 14, 10, special.aura, 0.35)
          .setDepth(spot.y - 1)
          .setAlpha(0)
          .setData('monster', true)
      : null;
    const shadow = this.add
      .ellipse(spot.x, spot.y, width * 0.8, 4, 0x000000, 0.35)
      .setDepth(spot.y - 2)
      .setData('monster', true);
    const monster = this.add
      .sprite(spot.x, spot.y, look ? key : 'spark')
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setAlpha(0)
      .setDepth(spot.y)
      .setFlipX(true)
      .setData('monster', true);
    const barW = special ? 40 : 28;
    // A placa fica sempre acima da barra de vida do herói (que fica à esquerda do monstro).
    const plateY = Math.min(spot.y - height - 5, STAGE_FLOOR_Y - HERO_H - 14);
    const bar = this.makeBar(spot.x, plateY, barW, special ? special.aura : 0xef4444, 1_001);
    bar.bg.setData('monster', true);
    bar.fill.setData('monster', true);
    const label = this.text(
      spot.x,
      plateY - 3,
      special
        ? `${special.tag} · ${e.monsterName} Nv ${e.monsterLevel}`
        : `${e.monsterName}  Nv ${e.monsterLevel}`,
      special ? special.color : '#f1f5f9',
      6,
    ).setData('monster', true);
    const parts = [monster, shadow, bar.bg, bar.fill, label, ...(aura ? [aura] : [])];
    const cleanup = () => parts.forEach((o) => o.destroy());
    const bob = this.tweens.add({
      targets: monster,
      scaleY: scale * 0.96,
      duration: special ? 800 : 520,
      yoyo: true,
      repeat: -1,
    });
    const pulse = aura
      ? this.tweens.add({
          targets: aura,
          scaleX: 1.15,
          scaleY: 1.3,
          duration: 600,
          yoyo: true,
          repeat: -1,
        })
      : null;

    await this.tween({ targets: parts, alpha: 1, duration: (special ? 500 : 250) / speed });
    if (aura) aura.setAlpha(0.35);
    shadow.setAlpha(0.35);
    await this.walkTo(spot.x - width / 2 - 22, spot.y, speed, gen);
    if (gen !== this.generation) return cleanup();
    this.hero.setFlipX(false);
    this.setBar(this.heroBar, this.maxHp, this.maxHp);
    this.moveBar(this.heroBar, this.hero.x, this.hero.y - HERO_H - 4);
    this.setBarVisible(this.heroBar, true);

    const monsterMid = () => monster.y - height / 2;
    if (e.events && e.events.length > 0) {
      let last = 0;
      for (const ev of e.events) {
        await this.wait(Math.min(700, ev.atMs - last) / speed);
        if (gen !== this.generation) return cleanup();
        last = ev.atMs;
        if (ev.attacker === 'player') {
          this.lunge(this.hero, 7);
          this.slash(monster.x - width / 2 + 2, monsterMid(), ev.crit);
          this.hit(monster, monsterMid() - height / 2, ev.damage, ev.crit, '#fff3c4');
          this.setBar(bar, ev.targetHpAfter, e.monsterMaxHp);
        } else {
          this.lunge(monster, -7);
          this.claw(this.hero.x + 6, this.hero.y - HERO_H / 2);
          this.hit(this.hero, this.hero.y - HERO_H, ev.damage, ev.crit, '#fca5a5');
          this.setBar(this.heroBar, ev.targetHpAfter, e.playerMaxHp);
          this.director.hooks.onHeroHp?.(ev.targetHpAfter, e.playerMaxHp);
        }
      }
    } else {
      // Sem golpes individuais (encontro antigo): mostra os totais confirmados.
      for (let i = 0; i < 2; i += 1) {
        await this.wait(350 / speed);
        this.lunge(this.hero, 6);
        this.lunge(monster, -6);
      }
      this.hit(monster, monsterMid() - height / 2, e.damageDealt, false, '#fff3c4');
      if (e.damageTaken > 0)
        this.hit(this.hero, this.hero.y - HERO_H, e.damageTaken, false, '#fca5a5');
      this.setBar(bar, e.outcome === 'win' ? 0 : e.monsterMaxHp - e.damageDealt, e.monsterMaxHp);
    }
    if (gen !== this.generation) return cleanup();

    bob.stop();
    pulse?.stop();
    monster.setScale(scale);
    if (e.outcome === 'win') {
      // Derrota do monstro: clarão branco, tombo e dissolução em faíscas.
      monster.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      await this.wait(90);
      await this.tween({
        targets: monster,
        angle: 90,
        x: monster.x + 4,
        alpha: 0,
        duration: (special ? 560 : 300) / speed,
        ease: 'Quad.easeIn',
      });
      await this.tween({
        targets: [bar.bg, bar.fill, label, shadow, ...(aura ? [aura] : [])],
        alpha: 0,
        duration: 120,
      });
      this.burst(spot.x, spot.y - height / 2, special ? 16 : 8, special ? 26 : 14);
      const lines: Array<[string, string]> = [[`+${e.xp} XP`, '#c4b5fd']];
      if (e.gold > 0) lines.push([`+${e.gold} ouro`, '#fcd34d']);
      if (e.essence > 0) lines.push([`+${e.essence} essência`, '#e9d5ff']);
      if (e.drop) {
        lines.push([
          e.drop.kept ? `★ ${e.drop.name}` : `${e.drop.name} (inventário cheio)`,
          RARITY_COLOR[e.drop.rarity] ?? '#fff',
        ]);
      }
      lines.forEach(([text, color], i) =>
        this.floatText(
          this.hero.x,
          this.hero.y - HERO_H - 10 - i * 9,
          text,
          color,
          1_000 + i * 120,
          8,
        ),
      );
      if (e.levelUp) this.levelUpBanner(e.levelAfter);
    } else {
      this.floatText(
        this.hero.x,
        this.hero.y - HERO_H - 10,
        e.outcome === 'loss' ? 'Derrotado' : 'Fuga',
        '#fca5a5',
        1_100,
        9,
      );
      // O herói é empurrado para trás e pisca; o monstro permanece até sumir.
      await this.tween({
        targets: this.hero,
        x: this.hero.x - 14,
        duration: 180,
        ease: 'Quad.easeOut',
        onUpdate: () => this.moveBar(this.heroBar, this.hero.x, this.hero.y - HERO_H - 4),
      });
      await this.tween({ targets: this.hero, alpha: 0.35, duration: 200, yoyo: true, repeat: 2 });
      await this.tween({ targets: parts, alpha: 0, duration: 300 / speed });
    }
    cleanup();
    this.setBarVisible(this.heroBar, false);
    if (e.waveCleared) await this.waveClearEffect(e, gen);
    this.director.hooks.onHeroHp?.(e.playerMaxHp, e.playerMaxHp);
    this.director.hooks.onEncounterShown?.(e);
    await this.wait(250 / speed);
  }

  /** Transição ao entrar numa wave nova (primeiro encontro dela vindo do servidor). */
  private async waveIntro(e: EncounterView, gen: number): Promise<void> {
    if (e.wave === undefined) return;
    const key = `${e.wave}:${e.mode ?? ''}`;
    const isStart = e.position === 1;
    const changed = this.shownWave !== null && this.shownWave !== key;
    const first = this.shownWave === null;
    this.shownWave = key;
    if (!(isStart || changed) || first) return;
    const plate = this.add
      .rectangle(WORLD_W / 2, 44, 104, 24, 0x0a0c24, 0.85)
      .setStrokeStyle(1, 0xf2c46d, 0.9)
      .setDepth(2_400)
      .setAlpha(0);
    const title = this.text(WORLD_W / 2, 46, `Wave ${e.wave}`, '#fde68a', 10)
      .setDepth(2_401)
      .setAlpha(0);
    const sub = this.text(
      WORLD_W / 2,
      54,
      e.mode === 'farm' ? 'Farmar · repetindo' : 'Avançar',
      '#d9c8ff',
      7,
    )
      .setDepth(2_401)
      .setAlpha(0);
    const all = [plate, title, sub];
    await this.tween({ targets: all, alpha: 1, duration: 220 });
    await this.wait(gen === this.generation ? 650 : 0);
    await this.tween({ targets: all, alpha: 0, duration: 260 });
    all.forEach((o) => o.destroy());
  }

  private async specialIntro(
    special: (typeof SPECIAL)[keyof typeof SPECIAL],
    boss: boolean,
    gen: number,
  ): Promise<void> {
    const banner = this.text(WORLD_W / 2, 52, special.banner, special.color, 9).setAlpha(0);
    const flash = this.add
      .rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, special.aura, 0)
      .setDepth(1_900);
    if (boss) this.cameras.main.shake(400, 0.004);
    await Promise.all([
      this.tween({ targets: banner, alpha: 1, y: 46, duration: 300 }),
      this.tween({ targets: flash, fillAlpha: 0.18, duration: 160, yoyo: true }),
    ]);
    await this.wait(gen === this.generation ? 700 : 0);
    await this.tween({ targets: banner, alpha: 0, duration: 250 });
    banner.destroy();
    flash.destroy();
  }

  private async waveClearEffect(e: EncounterView, gen: number): Promise<void> {
    if (gen !== this.generation) return;
    const x = this.hero.x;
    const y = this.hero.y - HERO_H / 2;
    const ring = this.add.circle(x, y, 6).setStrokeStyle(1, 0xf2c46d).setDepth(1_800);
    this.tweens.add({
      targets: ring,
      scale: 10,
      alpha: 0,
      duration: 900,
      onComplete: () => ring.destroy(),
    });
    this.burst(x, y, 18, 30);
    const plate = this.add
      .rectangle(WORLD_W / 2, 48, 150, e.firstClear ? 30 : 20, 0x0a0c24, 0.88)
      .setStrokeStyle(1, 0xf2c46d)
      .setDepth(2_400)
      .setAlpha(0);
    const title = this.text(
      WORLD_W / 2,
      e.firstClear ? 48 : 52,
      `Wave ${e.wave} concluída!`,
      '#fde68a',
      10,
    )
      .setDepth(2_401)
      .setAlpha(0);
    const subtitle = e.firstClear
      ? this.text(WORLD_W / 2, 58, 'Primeira conclusão: recompensa exclusiva', '#d9c8ff', 6)
          .setDepth(2_401)
          .setAlpha(0)
      : null;
    const texts = [plate, title, ...(subtitle ? [subtitle] : [])];
    await this.tween({ targets: texts, alpha: 1, duration: 260 });
    await this.wait(1_100);
    await this.tween({ targets: texts, alpha: 0, y: '-=6', duration: 400 });
    texts.forEach((t) => t.destroy());
  }

  // ── Barras de vida ─────────────────────────────────────────────────────

  private makeBar(x: number, y: number, width: number, color: number, depth: number): HpBar {
    const bg = this.add
      .rectangle(x, y, width + 2, 5, 0x0a0c24)
      .setStrokeStyle(1, 0x000000, 0.9)
      .setDepth(depth);
    const fill = this.add
      .rectangle(x - width / 2, y, width, 3, color)
      .setOrigin(0, 0.5)
      .setDepth(depth + 1);
    return { bg, fill, width };
  }

  private setBar(bar: HpBar, value: number, max: number): void {
    bar.fill.setSize(Math.max(0, (bar.width * Math.max(0, value)) / Math.max(1, max)), 3);
  }

  private moveBar(bar: HpBar, x: number, y: number): void {
    bar.bg.setPosition(x, y);
    bar.fill.setPosition(x - bar.width / 2, y);
  }

  private setBarVisible(bar: HpBar, visible: boolean): void {
    bar.bg.setVisible(visible);
    bar.fill.setVisible(visible);
  }

  // ── Efeitos ────────────────────────────────────────────────────────────

  private lunge(target: Phaser.GameObjects.Sprite, dx: number): void {
    this.tweens.add({ targets: target, x: target.x + dx, duration: 70, yoyo: true });
  }

  /** Arco de corte do herói; críticos são maiores e tremem a câmera. */
  private slash(x: number, y: number, crit: boolean): void {
    const g = this.add.graphics().setDepth(1_600);
    g.lineStyle(crit ? 3 : 2, crit ? 0xfbbf24 : 0xbfe9ff, 1);
    g.beginPath();
    g.arc(x, y, crit ? 14 : 10, -1.2, 1.2);
    g.strokePath();
    g.lineStyle(1, 0xffffff, 0.9);
    g.beginPath();
    g.arc(x - 2, y, crit ? 11 : 8, -1, 1);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
    if (crit) {
      this.cameras.main.shake(120, 0.003);
      this.burst(x + 4, y, 5, 10);
    }
  }

  /** Garras do monstro: três riscos vermelhos curtos. */
  private claw(x: number, y: number): void {
    const g = this.add.graphics().setDepth(1_600);
    g.lineStyle(1.5, 0xf87171, 1);
    for (let i = -1; i <= 1; i += 1) g.lineBetween(x - 4, y - 7 + i * 4, x + 4, y - 2 + i * 4);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private hit(
    target: Phaser.GameObjects.Sprite,
    topY: number,
    damage: number,
    crit: boolean,
    color: string,
  ): void {
    target.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(90, () => target.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
    this.floatText(
      target.x + (Math.random() * 8 - 4),
      topY - 4,
      crit ? `-${damage}!` : `-${damage}`,
      crit ? '#fbbf24' : color,
      700,
      crit ? 14 : 11,
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
        fontStyle: 'bold',
        color,
        stroke: '#05061a',
        strokeThickness: size >= 11 ? 3 : 2,
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
      y: y - 16,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private levelUpBanner(level: number): void {
    const t = this.text(WORLD_W / 2, 40, `Nível ${level}!`, '#fde68a', 10);
    this.burst(this.hero.x, this.hero.y - HERO_H / 2, 10, 18);
    this.tweens.add({
      targets: t,
      y: 32,
      alpha: 0,
      delay: 900,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  private burst(x: number, y: number, count = 6, radius = 12): void {
    for (let i = 0; i < count; i += 1) {
      const s = this.add.image(x, y, 'spark').setDepth(1_500).setScale(0.6);
      const angle = (Math.PI * 2 * i) / count;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        alpha: 0,
        duration: 420,
        onComplete: () => s.destroy(),
      });
    }
  }

  /**
   * Sem encontros na fila: caçando, o herói patrulha a trilha procurando o próximo
   * monstro (nenhum monstro é inventado); descansando, apenas respira no lugar.
   */
  private startIdle(): void {
    if (this.idleTween || !this.look) return;
    if (this.hunting) {
      this.searchText ??= this.text(HOME.x, HOME.y - HERO_H - 4, 'procurando…', '#cbd5e1', 7);
      this.searchText.setVisible(true).setAlpha(0.9);
      const walk = this.hero.getData('walkAnim') as string | undefined;
      if (walk) this.hero.play(walk);
      this.hero.setFlipX(false);
      this.idleTween = this.tweens.add({
        targets: this.hero,
        x: HOME.x + 34,
        duration: 2_000,
        yoyo: true,
        repeat: -1,
        hold: 400,
        repeatDelay: 400,
        ease: 'Sine.easeInOut',
        onYoyo: () => this.hero.setFlipX(true),
        onRepeat: () => this.hero.setFlipX(false),
        onUpdate: () => this.searchText?.setPosition(this.hero.x, this.hero.y - HERO_H - 4),
      });
      return;
    }
    this.searchText?.setVisible(false);
    this.idleTween = this.tweens.add({
      targets: this.hero,
      scaleY: HERO_SCALE * 0.97,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
  }

  private stopIdle(): void {
    this.idleTween?.stop();
    this.idleTween = null;
    this.searchText?.setVisible(false);
    this.hero.stop();
    if (this.look) this.hero.setTexture(heroTextureKey(this.look, 0));
    this.hero.setScale(HERO_SCALE);
  }

  // ── Texturas e cenário ─────────────────────────────────────────────────

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

  private createFlameTextures(): void {
    const palette = { r: '#ff7a3d', y: '#ffd37a', w: '#fff7d6' };
    this.ensureTexture('flame-0', { palette, rows: ['.y.', 'yyy', 'ywy', 'rwr', '.r.'] });
    this.ensureTexture('flame-1', { palette, rows: ['..y', '.yy', 'yyw', 'rwr', '.r.'] });
    if (!this.anims.exists('flame')) {
      this.anims.create({
        key: 'flame',
        frames: [{ key: 'flame-0' }, { key: 'flame-1' }],
        frameRate: 6,
        repeat: -1,
      });
    }
  }

  private paintScenery(regionId: string): void {
    const key = `backdrop-${regionId}`;
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, WORLD_W, WORLD_H);
      if (!texture) throw new Error('não foi possível criar o cenário');
      paintBackdrop(texture.context, regionId);
      texture.refresh();
    }
    this.scenery.forEach((o) => o.destroy());
    this.scenery = [this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-1_000)];
    // Tochas: chama animada com um halo suave.
    const accent = Phaser.Display.Color.HexStringToColor(regionLook(regionId).accent).color;
    for (const t of torchPositions(regionId)) {
      const glow = this.add.circle(t.x, t.y - 3, 5, accent, 0.14).setDepth(-900);
      const flame = this.add.sprite(t.x, t.y, 'flame-0').setOrigin(0.5, 1).setDepth(-899);
      flame.play('flame');
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.6, to: 1 },
        scale: { from: 0.9, to: 1.1 },
        duration: 420,
        yoyo: true,
        repeat: -1,
      });
      this.scenery.push(glow, flame);
    }
  }

  /** Vaga-lumes e poeira estelar: decoração contínua, nada ligado ao jogo. */
  private addFireflies(): void {
    const rand = decorRng(777);
    for (let i = 0; i < 30; i += 1) {
      const inSky = i < 12;
      const dot = this.add
        .rectangle(
          rand() * WORLD_W,
          inSky ? rand() * 90 : 112 + rand() * 60,
          1,
          1,
          inSky ? 0xfff3c4 : 0xd9f99d,
        )
        .setDepth(inSky ? -950 : 2_500)
        .setAlpha(0);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0, to: inSky ? 0.9 : 0.75 },
        x: dot.x + (inSky ? 0 : (rand() - 0.5) * 12),
        y: dot.y - (inSky ? 0 : 6),
        duration: 1_600 + rand() * 1_800,
        delay: rand() * 3_000,
        yoyo: true,
        repeat: -1,
      });
    }
  }
}
