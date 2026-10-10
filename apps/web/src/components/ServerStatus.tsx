import type { HealthReady } from '@astral/shared';
import { useEffect, useState } from 'react';
import { fetchHealth } from '../lib/api';
import { useRealtime, type RealtimeStatus } from '../lib/useRealtime';
import { Panel } from './Panel';

type Level = 'ok' | 'warn' | 'bad' | 'idle';

function Dot({ level }: { level: Level }) {
  const color = {
    ok: 'bg-emerald-400 shadow-emerald-400/60',
    warn: 'bg-amber-300 shadow-amber-300/60',
    bad: 'bg-rose-400 shadow-rose-400/60',
    idle: 'bg-slate-500 shadow-transparent',
  }[level];
  return (
    <span className={`inline-block size-2 rounded-full shadow-[0_0_8px] ${color}`} aria-hidden />
  );
}

function Row({
  label,
  value,
  level,
  testId,
}: {
  label: string;
  value: string;
  level: Level;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="flex items-center gap-2 font-medium" data-testid={testId}>
        <Dot level={level} />
        {value}
      </span>
    </div>
  );
}

const realtimeLabel: Record<RealtimeStatus, [string, Level]> = {
  connecting: ['conectando…', 'idle'],
  online: ['conectado', 'ok'],
  offline: ['reconectando…', 'warn'],
  incompatible: ['versão desatualizada', 'bad'],
};

export function ServerStatus() {
  const [health, setHealth] = useState<HealthReady | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const realtime = useRealtime();

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchHealth()
        .then((h) => {
          if (!active) return;
          setHealth(h);
          setUnreachable(false);
        })
        .catch(() => active && setUnreachable(true));
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const api: [string, Level] = unreachable
    ? ['inacessível', 'bad']
    : !health
      ? ['verificando…', 'idle']
      : health.status === 'ready'
        ? ['pronta', 'ok']
        : ['degradada', 'warn'];
  const dep = (s: 'up' | 'down' | undefined): [string, Level] =>
    s === undefined ? ['—', 'idle'] : s === 'up' ? ['online', 'ok'] : ['offline', 'bad'];
  const [rtText, rtLevel] = realtimeLabel[realtime.status];

  return (
    <Panel title="Estado do servidor">
      <Row label="API" value={api[0]} level={api[1]} testId="status-api" />
      <Row label="Banco de dados" {...toRow(dep(health?.checks.database))} testId="status-db" />
      <Row
        label="Cache / filas (Redis)"
        {...toRow(dep(health?.checks.redis))}
        testId="status-redis"
      />
      <Row
        label="Tempo real"
        value={realtime.latencyMs !== null ? `${rtText} · ${realtime.latencyMs} ms` : rtText}
        level={rtLevel}
        testId="status-realtime"
      />
    </Panel>
  );
}

function toRow([value, level]: [string, Level]) {
  return { value, level };
}
