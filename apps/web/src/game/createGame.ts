import Phaser from 'phaser';
import type { HuntDirector } from './director';
import { HuntScene, RENDER_SCALE, WORLD_H, WORLD_W } from './HuntScene';

/** Cria a instância do Phaser dentro do elemento informado. */
export function createGame(parent: HTMLElement, director: HuntDirector): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WORLD_W * RENDER_SCALE,
    height: WORLD_H * RENDER_SCALE,
    pixelArt: true,
    backgroundColor: '#0b0d1f',
    scale: {
      // ENVELOP preenche o contêiner; em telas largas o palco fica mais panorâmico
      // e o excedente (céu e primeiro plano) é recortado, nunca a trilha do combate.
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    banner: false,
    callbacks: {
      preBoot: (g) => {
        g.registry.set('director', director);
      },
    },
    scene: [HuntScene],
  });
  return game;
}
