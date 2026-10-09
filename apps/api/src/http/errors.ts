import type { ApiError } from '@astral/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Erro de domínio com código estável para o cliente. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function body(code: string, message: string, requestId: string): ApiError {
  return { error: { code, message, requestId } };
}

/** Padroniza erros: nunca expõe stack traces nem mensagens internas em respostas 5xx. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send(body('NOT_FOUND', 'Rota não encontrada', request.id));
  });

  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message, request.id));
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(body('VALIDATION_ERROR', 'Dados inválidos', request.id));
    }
    const status = error.statusCode ?? 500;
    if (status === 429) {
      return reply
        .status(429)
        .send(body('RATE_LIMITED', 'Muitas requisições, tente novamente em instantes', request.id));
    }
    if (status >= 400 && status < 500) {
      const code = error.validation ? 'VALIDATION_ERROR' : 'BAD_REQUEST';
      return reply.status(status).send(body(code, error.message, request.id));
    }
    request.log.error({ err: error }, 'erro não tratado');
    return reply.status(500).send(body('INTERNAL_ERROR', 'Erro interno', request.id));
  });
}
