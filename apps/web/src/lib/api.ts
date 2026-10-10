import {
  apiErrorSchema,
  authResponseSchema,
  contentResponseSchema,
  gameStateSchema,
  healthReadySchema,
  huntHistoryResponseSchema,
  inventoryResponseSchema,
  syncResponseSchema,
  type AccountView,
  type Appearance,
  type ContentResponse,
  type GameState,
  type HealthReady,
  type HuntHistoryResponse,
  type HuntSettingsRequest,
  type InventoryResponse,
  type SyncResponse,
} from '@astral/shared';

/** Prefixo das rotas da API (proxy do Vite em dev; reverse proxy em produção). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

interface Schema<T> {
  parse(data: unknown): T;
}

/** Erro de API com código estável e erros por campo (mensagens já em português). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NO_REFRESH = new Set([
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/refresh',
  '/v1/auth/logout',
]);
let refreshing: Promise<boolean> | null = null;

/**
 * Renova a sessão uma única vez, mesmo que várias requisições recebam 401 juntas.
 * Os tokens vivem em cookies HttpOnly: o JavaScript nunca os vê nem os armazena.
 */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
  })
    // 409 REFRESH_RACE: outra aba renovou primeiro; os cookies novos já chegaram.
    .then((res) => res.ok || res.status === 409)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  schema: Schema<T> | null,
  body?: unknown,
  opts: { acceptStatuses?: number[]; retried?: boolean } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor');
  }

  if (res.status === 401 && !opts.retried && !NO_REFRESH.has(path)) {
    if (await refreshSession())
      return request(method, path, schema, body, { ...opts, retried: true });
  }

  const accepted = opts.acceptStatuses ?? [];
  if (!res.ok && !accepted.includes(res.status)) {
    const payload: unknown = await res.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(res.status, e.code, e.message, e.fields ?? {});
    }
    throw new ApiError(
      res.status,
      'HTTP_ERROR',
      `Erro inesperado do servidor (HTTP ${res.status})`,
    );
  }
  if (res.status === 204 || schema === null) return undefined as T;
  // Toda resposta é validada: o cliente nunca confia cegamente no formato recebido.
  return schema.parse(await res.json());
}

export const api = {
  health: (): Promise<HealthReady> =>
    request('GET', '/health/ready', healthReadySchema, undefined, { acceptStatuses: [503] }),
  content: (): Promise<ContentResponse> => request('GET', '/v1/content', contentResponseSchema),

  me: async (): Promise<AccountView> =>
    (await request('GET', '/v1/auth/me', authResponseSchema)).account,
  register: async (input: {
    username: string;
    email: string;
    password: string;
    passwordConfirm: string;
  }): Promise<AccountView> =>
    (await request('POST', '/v1/auth/register', authResponseSchema, input)).account,
  login: async (input: { email: string; password: string }): Promise<AccountView> =>
    (await request('POST', '/v1/auth/login', authResponseSchema, input)).account,
  logout: (): Promise<void> => request('POST', '/v1/auth/logout', null),
  logoutAll: (): Promise<void> => request('POST', '/v1/auth/logout-all', null),

  state: (): Promise<GameState> => request('GET', '/v1/game/state', gameStateSchema),
  createCharacter: (input: {
    name: string;
    classId: string;
    affinity: string;
    appearance: Appearance;
  }): Promise<GameState> => request('POST', '/v1/characters', gameStateSchema, input),

  sync: (): Promise<SyncResponse> => request('POST', '/v1/hunt/sync', syncResponseSchema),
  startHunt: (regionId: string): Promise<SyncResponse> =>
    request('POST', '/v1/hunt/start', syncResponseSchema, { regionId }),
  /** Troca de modo e/ou wave; o servidor valida e aplica numa fronteira definida. */
  huntSettings: (input: HuntSettingsRequest): Promise<SyncResponse> =>
    request('POST', '/v1/hunt/settings', syncResponseSchema, input),
  stopHunt: (): Promise<SyncResponse> => request('POST', '/v1/hunt/stop', syncResponseSchema),
  history: (): Promise<HuntHistoryResponse> =>
    request('GET', '/v1/hunt/history', huntHistoryResponseSchema),

  inventory: (): Promise<InventoryResponse> =>
    request('GET', '/v1/inventory', inventoryResponseSchema),
  equip: (itemId: string): Promise<SyncResponse> =>
    request('POST', `/v1/inventory/${encodeURIComponent(itemId)}/equip`, syncResponseSchema),
  unequip: (itemId: string): Promise<SyncResponse> =>
    request('POST', `/v1/inventory/${encodeURIComponent(itemId)}/unequip`, syncResponseSchema),
  discard: (itemId: string): Promise<void> =>
    request('DELETE', `/v1/inventory/${encodeURIComponent(itemId)}`, null),
};

/** Mantido para o painel de status. */
export const fetchHealth = api.health;
export const fetchContent = api.content;
