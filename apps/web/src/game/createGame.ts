import Phaser from 'phaser';
import { HuntPreviewScene, MAP_COLS, MAP_ROWS, TILE } from './HuntPreviewScene';

/** Cria a instância do Phaser dentro do elemento informado. */
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: MAP_COLS * TILE,
    height: MAP_ROWS * TILE,
    pixelArt: true,
    backgroundColor: '#0b0d1f',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    banner: false,
    scene: [HuntPreviewScene],
  });
}
