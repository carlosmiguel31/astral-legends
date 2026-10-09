import {
  contentResponseSchema,
  healthReadySchema,
  type ContentResponse,
  type HealthReady,
} from '@astral/shared';

/** Prefixo das rotas da API (proxy do Vite em dev; reverse proxy em produção). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

interface Schema<T> {
  parse(data: unknown): T;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function getJson<T>(
  path: string,
  schema: Schema<T>,
  acceptStatuses: number[] = [200],
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!acceptStatuses.includes(res.status)) {
    throw new ApiRequestError(res.status, `Falha em ${path}: HTTP ${res.status}`);
  }
  // Toda resposta é validada: o cliente nunca confia cegamente no formato recebido.
  return schema.parse(await res.json());
}

export function fetchHealth(): Promise<HealthReady> {
  return getJson('/health/ready', healthReadySchema, [200, 503]);
}

export function fetchContent(): Promise<ContentResponse> {
  return getJson('/v1/content', contentResponseSchema);
}
