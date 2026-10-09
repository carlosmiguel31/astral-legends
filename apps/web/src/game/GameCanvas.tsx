import { useEffect, useRef, useState } from 'react';

type GameHandle = { destroy(removeCanvas: boolean): void };

/**
 * Monta o Phaser sob demanda (import dinâmico mantém o bundle inicial pequeno)
 * e o destrói ao desmontar — seguro com o StrictMode do React.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let game: GameHandle | null = null;
    let cancelled = false;

    import('./createGame')
      .then(({ createGame }) => {
        if (!cancelled) game = createGame(host);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, []);

  return (
    <div className="relative aspect-[30/17] w-full overflow-hidden rounded-xl bg-night-950 ring-1 ring-white/10">
      <div ref={hostRef} data-testid="game-canvas" className="absolute inset-0 [&>canvas]:block" />
      {failed && (
        <p className="absolute inset-0 grid place-items-center text-sm text-rose-300">
          Não foi possível iniciar a renderização.
        </p>
      )}
    </div>
  );
}
