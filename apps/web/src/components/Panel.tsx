import type { ReactNode } from 'react';

export function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-night-800/70 p-5 shadow-xl shadow-black/30 backdrop-blur">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg tracking-wide text-astral-gold-soft">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
