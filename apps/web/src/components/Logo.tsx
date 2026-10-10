import { useId } from 'react';

/** Emblema original: estrela-bússola de oito pontas dentro de um anel. */
export function AstralEmblem({ className = 'size-12' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="0.55" stopColor="#f2c46d" />
          <stop offset="1" stopColor="#b8872f" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="#b79bff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#b79bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-glow)`} />
      <circle cx="32" cy="32" r="17" fill="none" stroke={`url(#${id}-g)`} strokeWidth="1.6" />
      <path
        d="M32 6l3 20 8-11-5 13 13-5-11 8 20 3-20 3 11 8-13-5 5 13-8-11-3 20-3-20-8 11 5-13-13 5 11-8-20-3 20-3-11-8 13 5-5-13 8 11z"
        fill={`url(#${id}-g)`}
        stroke="#5a3a0a"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="3.2" fill="#fff7d6" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="Astral Legends: O Despertar" role="img">
      <AstralEmblem className={compact ? 'size-9' : 'size-12'} />
      <div className="leading-none">
        <p
          className={`astral-gold-text font-display font-bold tracking-wide ${compact ? 'text-lg' : 'text-[26px]'}`}
        >
          Astral Legends
        </p>
        {!compact && (
          <p className="mt-1 text-center font-display text-[10px] tracking-[0.42em] text-astral-gold-soft/80">
            ✦ O DESPERTAR ✦
          </p>
        )}
      </div>
    </div>
  );
}
