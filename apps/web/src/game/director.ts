import type { EncounterView } from '@astral/shared';
import type { HeroLook } from './pixelArt';

/** Comandos que a interface React envia à cena. */
export interface HuntSceneApi {
  setHero(look: HeroLook, maxHp: number): void;
  setRegion(regionId: string): void;
  enqueue(encounters: EncounterView[]): void;
  /** Caçada ativa: sem encontros na fila, o herói patrulha em vez de ficar parado. */
  setHunting(active: boolean): void;
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
  /** Último estado conhecido: reaplicado se o canvas for recriado (ex.: troca de layout). */
  private last: { hero?: [HeroLook, number]; region?: string; hunting?: boolean } = {};

  get hooks(): HuntSceneHooks {
    return this.currentHooks;
  }

  setHooks(hooks: HuntSceneHooks): void {
    this.currentHooks = hooks;
  }

  attach(scene: HuntSceneApi): void {
    this.scene = scene;
    if (this.last.region) scene.setRegion(this.last.region);
    if (this.last.hunting !== undefined) scene.setHunting(this.last.hunting);
    if (this.last.hero) scene.setHero(...this.last.hero);
    // Encontros recebidos antes de a cena existir (repetir setHero/setRegion é inofensivo).
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
    this.last.hero = [look, maxHp];
    this.run((s) => s.setHero(look, maxHp));
  }

  setRegion(regionId: string): void {
    this.last.region = regionId;
    this.run((s) => s.setRegion(regionId));
  }

  enqueue(encounters: EncounterView[]): void {
    if (encounters.length > 0) this.run((s) => s.enqueue(encounters));
  }

  setHunting(active: boolean): void {
    this.last.hunting = active;
    this.run((s) => s.setHunting(active));
  }
}
