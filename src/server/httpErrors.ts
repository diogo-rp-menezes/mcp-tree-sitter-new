import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { MCPTreeSitterError } from './errors';
import { ProjectIsolationError } from './isolation';
import { logger, serializeError } from './logger';
import { observeRequest } from './metrics';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** Atribui um request id (reaproveita X-Request-Id válido), devolve no cabeçalho e registra o acesso. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const routePattern = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    if (req.path !== '/mcp/sse') observeRequest(req.method, String(routePattern), res.statusCode, elapsedSeconds);
    // O stream SSE e o health check não geram ruído de acesso.
    if (req.path === '/mcp/sse' || req.path === '/api/health') return;
    logger.info('http_request', {
      reqId: id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
    });
  });
  next();
}

interface ErrorBody {
  error: string;
  message: string;
  requestId?: string;
  code?: string;
  details?: unknown;
}

/** Traduz qualquer erro em status HTTP + corpo. Detalhes internos só aparecem fora de produção. */
export function toHttpError(err: unknown): { status: number; body: Omit<ErrorBody, 'requestId'> } {
  if (err instanceof ProjectIsolationError) {
    return {
      status: 403,
      body: { error: 'Project Isolation Violation', message: err.message, code: err.code },
    };
  }
  if (err instanceof MCPTreeSitterError) {
    const exposeDetails = err.statusCode < 500;
    return {
      status: err.statusCode,
      body: {
        error: err.name,
        message: err.statusCode >= 500 && process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : err.message,
        ...(exposeDetails && err.details ? { details: err.details } : {}),
      },
    };
  }
  // Erros do body-parser (JSON inválido, payload grande) e similares carregam status 4xx.
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const type = (err as { type?: string }).type;
    const message =
      type === 'entity.parse.failed'
        ? 'Corpo da requisição não é um JSON válido'
        : type === 'entity.too.large'
          ? 'Corpo da requisição excede o limite permitido'
          : (err as Error).message || 'Requisição inválida';
    return { status, body: { error: 'BadRequest', message } };
  }
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : (err as Error)?.message || 'Erro interno do servidor';
  return { status: 500, body: { error: 'InternalError', message } };
}

/** Uso nos handlers: `catch (err) { return sendRouteError(req, res, err); }` */
export function sendRouteError(req: Request, res: Response, err: unknown, fallbackMessage?: string): void {
  if (res.headersSent) return;
  const { status, body } = toHttpError(err);
  const requestId = res.locals.requestId as string | undefined;
  if (status >= 500) {
    logger.error('request_failed', { reqId: requestId, method: req.method, path: req.path, err: serializeError(err) });
    if (fallbackMessage && process.env.NODE_ENV === 'production') body.message = fallbackMessage;
  } else {
    logger.warn('request_rejected', { reqId: requestId, method: req.method, path: req.path, status, message: body.message });
  }
  res.status(status).json({ ...body, requestId });
}

/** Middleware final do Express: captura erros que escapam dos handlers (body-parser, etc.). */
export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  sendRouteError(req, res, err);
}

/** 404 JSON para rotas /api inexistentes. */
export function apiNotFound(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'NotFound',
      message: `Rota não encontrada: ${req.method} ${req.path}`,
      requestId: res.locals.requestId,
    });
    return;
  }
  next();
}
