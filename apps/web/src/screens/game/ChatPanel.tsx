import { Icon } from '../../components/icons';
import { EmptyState, Panel, SoonBadge, Tabs } from '../../components/ui';

/**
 * Espaço reservado para o chat (Mundo, Comércio, Guilda). Nesta fase não há backend
 * de chat: canais e campo de mensagem ficam desabilitados e nenhuma mensagem é
 * exibida — nada aparenta estar funcionando quando não está.
 */
export function ChatPanel() {
  return (
    <Panel
      title="Chat"
      icon="chat"
      className="flex min-h-0 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3"
      testId="chat-panel"
      actions={<SoonBadge />}
    >
      <Tabs
        variant="chips"
        ariaLabel="Canais de chat"
        active="world"
        onChange={() => undefined}
        tabs={[
          { id: 'world', label: 'Mundo', disabled: true },
          { id: 'trade', label: 'Comércio', disabled: true },
          { id: 'guild', label: 'Guilda', disabled: true },
        ]}
      />
      <div className="flex flex-1 items-center justify-center">
        <EmptyState icon="chat" title="Chat em breve" compact>
          Os canais Mundo, Comércio e Guilda chegam numa próxima fase, com moderação.
        </EmptyState>
      </div>
      <form className="flex gap-2" onSubmit={(e) => e.preventDefault()} aria-disabled>
        <label className="sr-only" htmlFor="chat-input">
          Mensagem
        </label>
        <input
          id="chat-input"
          disabled
          placeholder="Chat indisponível nesta versão"
          className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-control)] bg-night-950/70 px-3 text-sm ring-1 ring-white/10 placeholder:text-slate-500 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled
          aria-label="Enviar (indisponível)"
          className="grid size-10 place-items-center rounded-[var(--radius-control)] bg-astral-violet-deep/40 text-slate-400 ring-1 ring-white/10 disabled:cursor-not-allowed"
        >
          <Icon name="chevronRight" className="size-5" />
        </button>
      </form>
    </Panel>
  );
}
