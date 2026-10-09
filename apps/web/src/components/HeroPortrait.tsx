import { useEffect, useRef } from 'react';
import { heroSprite, paintSprite, type HeroLook } from '../game/pixelArt';

/** Desenha o herói em pixel art com a aparência informada (escala inteira, sem borrão). */
export function HeroPortrait({
  look,
  scale = 4,
  className = '',
  label,
}: {
  look: HeroLook;
  scale?: number;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { classId } = look;
  const { hair, skin, cloak } = look.appearance;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintSprite(ctx, heroSprite({ classId, appearance: { hair, skin, cloak } }, 0), scale);
  }, [classId, hair, skin, cloak, scale]);

  return (
    <canvas
      ref={ref}
      width={16 * scale}
      height={16 * scale}
      role="img"
      aria-label={label}
      className={`[image-rendering:pixelated] ${className}`}
    />
  );
}
