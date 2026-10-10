import Phaser from 'phaser';
import { HERO_FRAMES, SPROUT_FRAMES, paintSprite, spriteSize, type PixelSprite } from './pixelArt';

export const TILE = 16;
export const MAP_COLS = 30;
export const MAP_ROWS = 17;

const WALK_SPEED = 28; // pixels por segundo (mundo)
const ENGAGE_MS = 1_400;

/** PRNG local apenas para decoração visual. Regras de jogo usam o RNG do servidor. */
function visualRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

interface Waypoint {
  x: number;
  y: number;
  monster?: Phaser.GameObjects.Sprite;
}

/**
 * Prévia visual da caça automática nos Campos do Alvorecer.
 * Não calcula dano, XP nem drops: na próxima fase esta cena passa a apenas
 * reproduzir os eventos de combate enviados pelo servidor.
 */
export class HuntPreviewScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Sprite;
  private route: Waypoint[] = [];
  private target = 0;
  private engagedUntil = 0;

  constructor() {
    super('hunt-preview');
  }

  create(): void {
    this.createSpriteTexture('hero-0', HERO_FRAMES[0]!);
    this.createSpriteTexture('hero-1', HERO_FRAMES[1]!);
    this.createSpriteTexture('sprout-0', SPROUT_FRAMES[0]!);
    this.createSpriteTexture('sprout-1', SPROUT_FRAMES[1]!);
    this.createSparkTexture();
    this.paintGround();

    this.anims.create({
      key: 'hero-walk',
      frames: [{ key: 'hero-0' }, { key: 'hero-1' }],
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: 'sprout-idle',
      frames: [{ key: 'sprout-0' }, { key: 'sprout-1' }],
      frameRate: 2,
      repeat: -1,
    });

    const points: Array<[number, number, boolean]> = [
      [5, 4, false],
      [11, 4, true],
      [17, 6, false],
      [24, 5, true],
      [25, 11, false],
      [19, 13, true],
      [10, 12, false],
      [5, 10, true],
    ];
    this.route = points.map(([col, row, hasMonster]) => {
      const wp: Waypoint = { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
      if (hasMonster) {
        wp.monster = this.add.sprite(wp.x + 10, wp.y - 2, 'sprout-0').play('sprout-idle');
        wp.monster.setDepth(wp.y);
      }
      return wp;
    });

    const start = this.route[0]!;
    this.hero = this.add.sprite(start.x, start.y, 'hero-0').play('hero-walk');
    this.target = 1;

    this.addStardust();
    this.cameras.main.setBackgroundColor('#0b0d1f');
  }

  override update(time: number, delta: number): void {
    if (time < this.engagedUntil) return;
    const wp = this.route[this.target];
    if (!wp) return;

    const dx = wp.x - this.hero.x;
    const dy = wp.y - this.hero.y;
    const dist = Math.hypot(dx, dy);
    const step = (WALK_SPEED * delta) / 1000;

    if (!this.hero.anims.isPlaying) this.hero.play('hero-walk');
    if (Math.abs(dx) > 0.5) this.hero.setFlipX(dx < 0);

    if (dist <= step) {
      this.hero.setPosition(wp.x, wp.y);
      if (wp.monster?.visible) this.engage(wp.monster, time);
      this.target = (this.target + 1) % this.route.length;
    } else {
      this.hero.x += (dx / dist) * step;
      this.hero.y += (dy / dist) * step;
    }
    this.hero.setDepth(this.hero.y);
  }

  private engage(monster: Phaser.GameObjects.Sprite, time: number): void {
    this.engagedUntil = time + ENGAGE_MS;
    this.hero.anims.stop();
    this.hero.setFlipX(monster.x < this.hero.x);

    for (let i = 0; i < 3; i += 1) {
      this.time.delayedCall(200 + i * 380, () => {
        const spark = this.add
          .image(monster.x, monster.y - 2, 'spark')
          .setDepth(1_000)
          .setScale(0.6);
        this.tweens.add({
          targets: spark,
          scale: 1.6,
          alpha: 0,
          duration: 260,
          onComplete: () => spark.destroy(),
        });
        this.tweens.add({ targets: monster, x: monster.x + 2, duration: 50, yoyo: true });
      });
    }
    this.time.delayedCall(ENGAGE_MS - 100, () => {
      this.tweens.add({
        targets: monster,
        alpha: 0,
        scale: 0.4,
        duration: 220,
        onComplete: () => {
          monster.setVisible(false);
          // Reaparece depois de um tempo, como um spawn comum.
          this.time.delayedCall(6_000, () => monster.setVisible(true).setAlpha(1).setScale(1));
        },
      });
    });
  }

  private createSpriteTexture(key: string, sprite: PixelSprite): void {
    const { width, height } = spriteSize(sprite);
    const texture = this.textures.createCanvas(key, width, height);
    if (!texture) throw new Error(`não foi possível criar a textura ${key}`);
    paintSprite(texture.context, sprite);
    texture.refresh();
  }

  private createSparkTexture(): void {
    const texture = this.textures.createCanvas('spark', 7, 7);
    if (!texture) throw new Error('não foi possível criar a textura spark');
    paintSprite(texture.context, {
      palette: { w: '#ffffff', g: '#f2c46d' },
      rows: ['...g...', '...w...', '..gwg..', 'gwwwwwg', '..gwg..', '...w...', '...g...'],
    });
    texture.refresh();
  }

  private paintGround(): void {
    const width = MAP_COLS * TILE;
    const height = MAP_ROWS * TILE;
    const texture = this.textures.createCanvas('ground', width, height);
    if (!texture) throw new Error('não foi possível criar o terreno');
    const ctx = texture.context;
    const rand = visualRng(20_261_009);
    const grass = ['#2f5a3c', '#33613f', '#2b5338'];

    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let col = 0; col < MAP_COLS; col += 1) {
        ctx.fillStyle = grass[Math.floor(rand() * grass.length)]!;
        ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
        for (let i = 0; i < 6; i += 1) {
          ctx.fillStyle = rand() < 0.5 ? '#3f7a4c' : '#24472f';
          ctx.fillRect(
            col * TILE + Math.floor(rand() * TILE),
            row * TILE + Math.floor(rand() * TILE),
            1,
            2,
          );
        }
        const roll = rand();
        if (roll < 0.05) {
          ctx.fillStyle = '#f2c46d';
          ctx.fillRect(col * TILE + 6, row * TILE + 7, 2, 2);
        } else if (roll < 0.08) {
          ctx.fillStyle = '#c9a7ff';
          ctx.fillRect(col * TILE + 9, row * TILE + 4, 2, 2);
        }
      }
    }

    // Trilha de terra ligando os pontos de patrulha (aproximação visual).
    const pathY = 8 * TILE + 3;
    ctx.fillStyle = '#5e5038';
    ctx.fillRect(3 * TILE, pathY - 1, 24 * TILE, 12);
    ctx.fillStyle = '#7d6a4b';
    ctx.fillRect(3 * TILE, pathY, 24 * TILE, 10);
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? '#9a8460' : '#6b5a40';
      ctx.fillRect(
        3 * TILE + Math.floor(rand() * 24 * TILE),
        pathY + 1 + Math.floor(rand() * 8),
        2,
        1,
      );
    }

    texture.refresh();
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-1_000);
  }

  private addStardust(): void {
    const rand = visualRng(777);
    for (let i = 0; i < 40; i += 1) {
      const dot = this.add
        .rectangle(
          rand() * MAP_COLS * TILE,
          rand() * MAP_ROWS * TILE,
          1,
          1,
          rand() < 0.7 ? 0xfff3c4 : 0xbfd4ff,
        )
        .setDepth(2_000)
        .setAlpha(0);
      this.tweens.add({
        targets: dot,
        alpha: { from: 0, to: 0.9 },
        y: dot.y - 6,
        duration: 1_600 + rand() * 1_800,
        delay: rand() * 3_000,
        yoyo: true,
        repeat: -1,
      });
    }
  }
}
