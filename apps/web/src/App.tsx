import type { AccountView } from '@astral/shared';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button } from './components/ui';
import { ApiError, api } from './lib/api';
import { AuthScreen } from './screens/AuthScreen';
import { CreateCharacterScreen } from './screens/CreateCharacterScreen';
import { GameScreen } from './screens/GameScreen';

type Session =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'guest' }
  | { status: 'ready'; account: AccountView };

/**
 * Fluxo: carregando → (sem sessão) login/cadastro → criação de personagem → jogo.
 * A sessão vive em cookies HttpOnly; aqui guardamos só os dados públicos da conta.
 */
export function App() {
  const [session, setSession] = useState<Session>({ status: 'loading' });

  const loadSession = useCallback(() => {
    api.me().then(
      (account) => setSession({ status: 'ready', account }),
      (e: unknown) => {
        if (e instanceof ApiError && e.status === 401) setSession({ status: 'guest' });
        else setSession({ status: 'error', message: 'Não foi possível falar com o servidor.' });
      },
    );
  }, []);

  useEffect(loadSession, [loadSession]);

  const retry = () => {
    setSession({ status: 'loading' });
    loadSession();
  };

  const logout = useCallback(() => {
    void api
      .logout()
      .catch(() => undefined)
      .finally(() => setSession({ status: 'guest' }));
  }, []);

  switch (session.status) {
    case 'loading':
      return <p className="grid min-h-dvh place-items-center text-slate-400">Despertando…</p>;
    case 'error':
      return (
        <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
          <div className="space-y-3 text-center">
            <Alert tone="warn">{session.message}</Alert>
            <Button variant="secondary" onClick={retry}>
              Tentar novamente
            </Button>
          </div>
        </div>
      );
    case 'guest':
      return <AuthScreen onAuthenticated={(account) => setSession({ status: 'ready', account })} />;
    case 'ready':
      if (!session.account.hasCharacter) {
        return (
          <CreateCharacterScreen
            username={session.account.username}
            onLogout={logout}
            onCreated={() =>
              setSession({ status: 'ready', account: { ...session.account, hasCharacter: true } })
            }
          />
        );
      }
      return <GameScreen key={session.account.id} onLogout={logout} />;
  }
}
