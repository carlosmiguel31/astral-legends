import type { EncounterView } from '@astral/shared';
import type { HeroLook } from './pixelArt';

/** Comandos que a interface React envia à cena. */
export interface HuntSceneApi {
  setHero(look: HeroLook, maxHp: number): void;
  setRegion(regionId: string): void;
  enqueue(encounters: EncounterView[]): void;
}

/** Eventos que a cena devolve à interface (sempre derivados de dados do servidor). */
export interface HuntSceneHooks {
  /** Vida exibida do herói durante a reprodução do combate. */
  onHeroHp?(hp: number, maxHp: number): void;
  /** Encontro terminou de ser reproduzido. */
  onEncounterShown?(encounter: EncounterView): void;
}

/**
 * Ponte entre React e Phaser. A cena pode ainda não existir (carregamento sob
 * demanda); os comandos ficam pendentes até ela se registrar.
 */
export class HuntDirector {
  private currentHooks: HuntSceneHooks = {};
  private scene: HuntSceneApi | null = null;
  private pending: Array<(scene: HuntSceneApi) => void> = [];

  get hooks(): HuntSceneHooks {
    return this.currentHooks;
  }

  setHooks(hooks: HuntSceneHooks): void {
    this.currentHooks = hooks;
  }

  attach(scene: HuntSceneApi): void {
    this.scene = scene;
    const pending = this.pending;
    this.pending = [];
    for (const command of pending) command(scene);
  }

  detach(scene: HuntSceneApi): void {
    if (this.scene === scene) this.scene = null;
  }

  private run(command: (scene: HuntSceneApi) => void): void {
    if (this.scene) command(this.scene);
    else this.pending.push(command);
  }

  setHero(look: HeroLook, maxHp: number): void {
    this.run((s) => s.setHero(look, maxHp));
  }

  setRegion(regionId: string): void {
    this.run((s) => s.setRegion(regionId));
  }

  enqueue(encounters: EncounterView[]): void {
    if (encounters.length > 0) this.run((s) => s.enqueue(encounters));
  }
}
