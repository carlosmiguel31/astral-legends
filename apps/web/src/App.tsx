import { AffinityPanel, ClassesPanel, useContent } from './components/ContentPanels';
import { ServerStatus } from './components/ServerStatus';
import { GameCanvas } from './game/GameCanvas';

export function App() {
  const { content, error } = useContent();
  const region = content?.regions[0];

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-astral-cyan/80">
            Idle MMORPG de fantasia astral
          </p>
          <h1 className="font-display text-4xl text-astral-gold drop-shadow-[0_0_18px_rgba(242,196,109,0.35)] sm:text-5xl">
            Astral Legends
          </h1>
          <p className="font-display text-lg italic text-astral-gold-soft/80">O Despertar</p>
        </div>
        <span className="rounded-full border border-astral-violet/40 bg-astral-violet/10 px-3 py-1 text-xs text-astral-violet">
          Fundação técnica · regras v{content?.rulesetVersion ?? '–'}
        </span>
      </header>

      <main className="grid flex-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl border border-white/10 bg-night-800/70 p-4 shadow-xl shadow-black/30">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-astral-gold-soft">
                {region?.name ?? 'Campos do Alvorecer'}
              </h2>
              {region && (
                <span className="text-xs text-slate-400">
                  Níveis {region.minLevel}–{region.maxLevel}
                </span>
              )}
            </div>
            <GameCanvas />
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Prévia de renderização com arte provisória. O movimento é ilustrativo: combate,
              experiência e drops serão calculados exclusivamente pelo servidor e apenas
              reproduzidos aqui.
            </p>
            {region && <p className="mt-2 text-sm text-slate-300">{region.description}</p>}
          </section>
          <AffinityPanel content={content} />
        </div>

        <aside className="space-y-6">
          <ServerStatus />
          {error ? (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
              Não foi possível carregar o conteúdo do servidor.
            </p>
          ) : (
            <ClassesPanel content={content} />
          )}
        </aside>
      </main>

      <footer className="text-center text-xs text-slate-600">
        Universo, personagens e arte originais · protótipo em desenvolvimento
      </footer>
    </div>
  );
}
