import {
  APPEARANCE_OPTIONS,
  type Appearance,
  type ContentResponse,
  type GameState,
} from '@astral/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { HeroPortrait } from '../components/HeroPortrait';
import { Alert, Button, Field } from '../components/ui';
import { CLOAK_COLORS, HAIR_COLORS, SKIN_TONES } from '../game/pixelArt';
import { ApiError, api } from '../lib/api';
import { formatBp, formatSeconds } from '../lib/format';

type ClassId = 'guardian' | 'arcanist' | 'blade';
type AffinityId = 'solar' | 'lunar' | 'storm' | 'abyssal';

const AFFINITY_STYLE: Record<AffinityId, string> = {
  solar: 'text-solar',
  lunar: 'text-lunar',
  storm: 'text-storm',
  abyssal: 'text-abyssal',
};

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: readonly string[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-200">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((color, i) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${i + 1}`}
            aria-pressed={value === i}
            onClick={() => onChange(i)}
            className={`size-8 rounded-full ring-2 transition ${value === i ? 'ring-astral-gold ring-offset-2 ring-offset-night-800' : 'ring-white/15 hover:ring-white/40'}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function CreateCharacterScreen({
  username,
  onCreated,
  onLogout,
}: {
  username: string;
  onCreated: (state: GameState) => void;
  onLogout: () => void;
}) {
  const [content, setContent] = useState<ContentResponse | null>(null);
  const [name, setName] = useState('');
  const [classId, setClassId] = useState<ClassId>('guardian');
  const [affinity, setAffinity] = useState<AffinityId>('solar');
  const [appearance, setAppearance] = useState<Appearance>({ hair: 0, skin: 1, cloak: 0 });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .content()
      .then(setContent, () =>
        setError('Não foi possível carregar as classes. Recarregue a página.'),
      );
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      onCreated(await api.createCharacter({ name, classId, affinity, appearance }));
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (Object.keys(e.fields).length === 0) setError(e.message);
      } else {
        setError('Algo deu errado. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  }

  const cls = content?.classes.find((c) => c.id === classId);
  const aff = content?.affinities.find((a) => a.id === affinity);
  const affName = (id: string) => content?.affinities.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-astral-cyan/80">Olá, {username}</p>
          <h1 className="font-display text-3xl text-astral-gold sm:text-4xl">
            Desperte seu guerreiro
          </h1>
        </div>
        <Button variant="ghost" onClick={onLogout}>
          Sair
        </Button>
      </header>

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[320px_1fr]" noValidate>
        <aside className="h-fit rounded-2xl border border-white/10 bg-night-800/80 p-6 text-center lg:sticky lg:top-6">
          <div className="mx-auto grid size-40 place-items-center rounded-2xl bg-[radial-gradient(circle_at_50%_40%,rgba(111,134,255,0.25),transparent_70%)] ring-1 ring-white/10">
            <HeroPortrait look={{ classId, appearance }} scale={8} label="Prévia do personagem" />
          </div>
          <p className="mt-4 font-display text-2xl text-slate-100">{name.trim() || 'Sem nome'}</p>
          <p className="text-sm text-slate-400">
            {cls?.name ?? '…'} ·{' '}
            <span className={AFFINITY_STYLE[affinity]}>{aff?.name ?? '…'}</span>
          </p>
          {cls && (
            <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
              {[
                ['Vida', String(cls.level1Stats.maxHp)],
                ['Ataque', String(cls.level1Stats.attack)],
                ['Defesa', String(cls.level1Stats.defense)],
                ['Crítico', formatBp(cls.level1Stats.critChanceBp)],
                ['Golpe a cada', formatSeconds(cls.level1Stats.attackIntervalMs)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white/5 px-2 py-1.5">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-semibold tabular-nums text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            Atributos iniciais definidos pelo servidor.
          </p>
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-night-800/80 p-6">
            <Field
              label="Nome do personagem"
              name="characterName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFields({});
              }}
              maxLength={16}
              autoComplete="off"
              error={fields.name}
              hint="3 a 16 letras, sem espaços, números ou símbolos"
            />
          </section>

          <section className="rounded-2xl border border-white/10 bg-night-800/80 p-6">
            <h2 className="mb-3 font-display text-lg text-astral-gold-soft">Classe</h2>
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Classe">
              {content?.classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={classId === c.id}
                  onClick={() => setClassId(c.id)}
                  className={`rounded-xl p-4 text-left ring-1 transition ${classId === c.id ? 'bg-astral-gold/10 ring-astral-gold' : 'bg-night-950/50 ring-white/10 hover:ring-white/30'}`}
                >
                  <span className="block font-display text-base text-slate-100">{c.name}</span>
                  <span className="mt-1 block text-xs text-slate-400">{c.role}</span>
                  <span className="mt-2 block text-xs italic leading-relaxed text-slate-500">
                    {c.lore}
                  </span>
                </button>
              ))}
            </div>
            {fields.classId && <p className="mt-2 text-xs text-rose-300">{fields.classId}</p>}
          </section>

          <section className="rounded-2xl border border-white/10 bg-night-800/80 p-6">
            <h2 className="mb-3 font-display text-lg text-astral-gold-soft">Afinidade astral</h2>
            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Afinidade astral"
            >
              {content?.affinities.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={affinity === a.id}
                  onClick={() => setAffinity(a.id)}
                  className={`rounded-xl p-4 text-left ring-1 transition ${affinity === a.id ? 'bg-white/8 ring-astral-gold' : 'bg-night-950/50 ring-white/10 hover:ring-white/30'}`}
                >
                  <span className={`block font-semibold ${AFFINITY_STYLE[a.id]}`}>{a.name}</span>
                  <span className="mt-1 block text-xs text-slate-400">{a.description}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Vantagem contra {affName(a.strongAgainst)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-5 rounded-2xl border border-white/10 bg-night-800/80 p-6 sm:grid-cols-3">
            <h2 className="font-display text-lg text-astral-gold-soft sm:col-span-3">Aparência</h2>
            <Swatches
              label="Cabelo"
              colors={HAIR_COLORS.slice(0, APPEARANCE_OPTIONS.hair)}
              value={appearance.hair}
              onChange={(hair) => setAppearance((a) => ({ ...a, hair }))}
            />
            <Swatches
              label="Pele"
              colors={SKIN_TONES.slice(0, APPEARANCE_OPTIONS.skin)}
              value={appearance.skin}
              onChange={(skin) => setAppearance((a) => ({ ...a, skin }))}
            />
            <Swatches
              label="Manto"
              colors={CLOAK_COLORS.slice(0, APPEARANCE_OPTIONS.cloak).map((c) => c[0])}
              value={appearance.cloak}
              onChange={(cloak) => setAppearance((a) => ({ ...a, cloak }))}
            />
          </section>

          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} disabled={!content} className="w-full sm:w-auto">
            Criar personagem
          </Button>
        </div>
      </form>
    </div>
  );
}
