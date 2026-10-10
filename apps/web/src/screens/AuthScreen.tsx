import type { AccountView } from '@astral/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Tabs } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { AstralEmblem } from '../components/Logo';
import { RegionArt } from '../components/RegionArt';

type Mode = 'login' | 'register';

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (account: AccountView) => void;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [values, setValues] = useState({
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setFields((f) => {
      const { [key]: _removed, ...rest } = f;
      return rest;
    });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const account =
        mode === 'login'
          ? await api.login({ email: values.email, password: values.password })
          : await api.register(values);
      onAuthenticated(account);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (Object.keys(e.fields).length === 0 || e.code !== 'VALIDATION_ERROR')
          setError(e.message);
      } else {
        setError('Algo deu errado. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-4 py-10 lg:grid-cols-2">
      <section className="space-y-5 text-center lg:text-left">
        <p className="text-xs uppercase tracking-[0.35em] text-astral-cyan/80">
          Idle MMORPG de fantasia astral
        </p>
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          <AstralEmblem className="size-16 sm:size-20" />
          <div>
            <h1 className="astral-gold-text font-display text-4xl font-bold sm:text-5xl">
              Astral Legends
            </h1>
            <p className="font-display text-sm tracking-[0.42em] text-astral-gold-soft/85">
              ✦ O DESPERTAR ✦
            </p>
          </div>
        </div>
        <div className="astral-frame overflow-hidden p-1">
          <RegionArt
            regionId="campos-do-alvorecer"
            label="Os Campos do Alvorecer à noite"
            className="aspect-[20/9] w-full rounded-[var(--radius-control)]"
          />
        </div>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-300 lg:mx-0">
          Desperte como um guerreiro ligado às constelações, escolha sua afinidade e cace a
          corrupção do Vazio — mesmo enquanto estiver longe. Seu progresso é calculado e guardado
          pelo servidor.
        </p>
      </section>

      <section className="w-full astral-frame astral-frame-strong p-6 sm:p-8">
        <Tabs
          tabs={[
            { id: 'login', label: 'Entrar' },
            { id: 'register', label: 'Criar conta' },
          ]}
          active={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setFields({});
          }}
        />
        <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
          {mode === 'register' && (
            <Field
              label="Nome de usuário"
              name="username"
              autoComplete="username"
              value={values.username}
              onChange={set('username')}
              error={fields.username}
              hint="3 a 16 caracteres: letras, números ou _"
              required
            />
          )}
          <Field
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={set('email')}
            error={fields.email}
            required
          />
          <Field
            label="Senha"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={values.password}
            onChange={set('password')}
            error={fields.password}
            hint={mode === 'register' ? 'Pelo menos 10 caracteres' : undefined}
            required
          />
          {mode === 'register' && (
            <Field
              label="Confirmar senha"
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={values.passwordConfirm}
              onChange={set('passwordConfirm')}
              error={fields.passwordConfirm}
              required
            />
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            {mode === 'login' ? 'Entrar' : 'Criar conta e entrar'}
          </Button>
        </form>
      </section>
    </div>
  );
}
