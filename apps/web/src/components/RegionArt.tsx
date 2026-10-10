import { useEffect, useRef } from 'react';
import { BACKDROP_H, BACKDROP_W, paintBackdrop } from '../game/backdrop';

/**
 * Miniatura da região: o mesmo cenário em pixel art que a cena Phaser usa,
 * desenhado num canvas e ampliado sem suavização. Arte provisória (Fase 2B).
 */
export function RegionArt({
  regionId,
  className = '',
  label,
}: {
  regionId: string;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paintBackdrop(ctx, regionId);
  }, [regionId]);
  return (
    <canvas
      ref={ref}
      width={BACKDROP_W}
      height={BACKDROP_H}
      role="img"
      aria-label={label}
      className={`pixelated block object-cover ${className}`}
    />
  );
}
