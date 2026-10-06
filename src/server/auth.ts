/**
 * Authentication middleware for MCP endpoints (audit finding SEC-02).
 *
 * Protects POST /api/mcp (JSON-RPC 2.0) and GET /mcp/sse (SSE stream) with
 * Bearer credentials. Two credential types are accepted:
 *
 *   1. Static API keys listed in MCP_API_KEYS (comma-separated env var).
 *   2. HS256 JWTs signed with MCP_JWT_SECRET (must carry an `exp` claim).
 *
 * Configuration is parsed once at startup and validated fail-fast: enabling
 * auth without any validator aborts the server instead of silently allowing
 * traffic. /api/health is not mounted behind this middleware and stays public.
 *
 * Security notes:
 * - API key and JWT signature comparisons are timing-safe.
 * - Only HS256 is accepted for JWTs (rejects `alg: none` and asymmetric
 *   algorithm confusion).
 * - Client-facing error messages are generic; detailed failure reasons are
 *   logged server-side only. Credential material is never logged.
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';

/** Validated authentication configuration (parsed once at startup). */
export interface McpAuthConfig {
  /** Whether MCP endpoints require credentials. */
  enabled: boolean;
  /** Static API keys accepted as Bearer credentials. */
  apiKeys: string[];
  /** Secret for HS256 JWT validation; null when JWT auth is disabled. */
  jwtSecret: string | null;
}

/** How the request authenticated; stored in `res.locals.auth`. */
export interface McpAuthContext {
  method: 'api-key' | 'jwt';
}

/** JSON-RPC 2.0 server-error codes (reserved range -32000..-32099). */
const JSONRPC_ERROR_CODES = {
  401: -32000,
  403: -32001,
  503: -32002,
} as const;

/** RFC 7518 §3.2: HS256 secrets must be at least 256 bits. */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Parses and validates auth configuration from the environment.
 * Throws (and therefore aborts startup) on inconsistent security settings.
 */
export function parseMcpAuthConfig(env: NodeJS.ProcessEnv): McpAuthConfig {
  const rawEnabled = env.MCP_AUTH_ENABLED?.trim();
  let enabled: boolean;
  if (rawEnabled === undefined || rawEnabled === '') {
    // Default: secure in production, frictionless in development.
    enabled = env.NODE_ENV === 'production';
  } else if (rawEnabled === 'true') {
    enabled = true;
  } else if (rawEnabled === 'false') {
    enabled = false;
  } else {
    throw new Error(
      `Invalid MCP_AUTH_ENABLED value "${rawEnabled}": expected "true" or "false"`
    );
  }

  const apiKeys = (env.MCP_API_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);

  const jwtSecret = env.MCP_JWT_SECRET?.trim() || null;
  if (jwtSecret !== null && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `MCP_JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters for HS256 (RFC 7518 section 3.2)`
    );
  }

  if (enabled && apiKeys.length === 0 && jwtSecret === null) {
    throw new Error(
      'MCP authentication is enabled but no credential validator is configured: ' +
        'set MCP_API_KEYS and/or MCP_JWT_SECRET, or set MCP_AUTH_ENABLED=false explicitly'
    );
  }

  return { enabled, apiKeys, jwtSecret };
}

/** Extracts the Bearer token from the Authorization header (RFC 7235/6750). */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Constant-time string comparison. Both sides are SHA-256 hashed first so the
 * comparison length is fixed regardless of input lengths (timingSafeEqual
 * throws on length mismatch).
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashA, hashB);
}

/** Timing-safe check of a candidate credential against the configured keys. */
function isValidApiKey(candidate: string, apiKeys: string[]): boolean {
  const candidateHash = createHash('sha256').update(candidate, 'utf8').digest();
  return apiKeys.some((key) =>
    timingSafeEqual(candidateHash, createHash('sha256').update(key, 'utf8').digest())
  );
}

interface JwtVerification {
  valid: boolean;
  reason?: string;
}

/**
 * Verifies an HS256 JWT against the configured secret.
 *
 * Constraints (fail-closed):
 * - Only `alg: HS256` is accepted — anything else (including `none` and
 *   asymmetric algorithms) is rejected to prevent algorithm confusion.
 * - `exp` is REQUIRED; open-ended tokens are never accepted.
 * - `nbf` is honored when present. No clock-skew leeway is applied.
 */
export function verifyJwt(token: string, secret: string): JwtVerification {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed token' };
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: unknown };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed header' };
  }
  if (header.alg !== 'HS256') {
    return { valid: false, reason: 'unsupported algorithm' };
  }

  const expectedSignature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  if (!timingSafeEqualStrings(expectedSignature, signatureB64)) {
    return { valid: false, reason: 'invalid signature' };
  }

  let payload: { exp?: unknown; nbf?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed payload' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return { valid: false, reason: 'missing exp claim' };
  }
  if (payload.exp <= now) {
    return { valid: false, reason: 'token expired' };
  }
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf)) {
      return { valid: false, reason: 'invalid nbf claim' };
    }
    if (payload.nbf > now) {
      return { valid: false, reason: 'token not yet valid' };
    }
  }

  return { valid: true };
}

/**
 * Echoes the JSON-RPC request `id` when available (the body is already parsed
 * by express.json() at middleware time), so clients can correlate rejections.
 */
function extractRequestId(req: Request): unknown {
  const body = req.body as unknown;
  if (body && typeof body === 'object' && 'id' in body) {
    return (body as { id?: unknown }).id;
  }
  return null;
}

/**
 * Sends an auth failure in JSON-RPC 2.0 error format with the proper HTTP
 * status. 401 also carries `WWW-Authenticate: Bearer` per RFC 6750.
 */
function sendJsonRpcAuthError(
  res: Response,
  statusCode: 401 | 403 | 503,
  message: string,
  requestId: unknown
): void {
  if (statusCode === 401) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="mcp-server-tree-sitter"');
  }
  res.status(statusCode).json({
    jsonrpc: '2.0',
    id: requestId ?? null,
    error: { code: JSONRPC_ERROR_CODES[statusCode], message },
  });
}

/** Logs auth rejections with request context; never logs credentials. */
function logAuthFailure(req: Request, reason: string): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  logger.warn('auth_rejected', { method: req.method, path: req.path, ip, reason });
}

/**
 * Builds the Express middleware that guards MCP endpoints.
 *
 * Order of checks:
 *  1. Auth disabled -> pass through.
 *  2. No validator configured (defensive; startup validation prevents this)
 *     -> 503 fail-closed.
 *  3. Missing/malformed Authorization header -> 401.
 *  4. Valid API key -> attach auth context, pass.
 *  5. Valid JWT (when a secret is configured) -> attach auth context, pass.
 *  6. Anything else -> 401 with a generic message (details only in logs).
 */
export function createMcpAuthMiddleware(config: McpAuthConfig) {
  return function mcpAuth(req: Request, res: Response, next: NextFunction): void {
    if (!config.enabled) {
      return next();
    }

    if (config.apiKeys.length === 0 && config.jwtSecret === null) {
      logAuthFailure(req, 'no_validator_configured');
      return sendJsonRpcAuthError(
        res,
        503,
        'Authentication is enabled but no credential validator is configured',
        extractRequestId(req)
      );
    }

    const token = extractBearerToken(req);
    if (!token) {
      logAuthFailure(req, 'missing_credentials');
      return sendJsonRpcAuthError(
        res,
        401,
        'Unauthorized: missing Bearer credentials',
        extractRequestId(req)
      );
    }

    if (config.apiKeys.length > 0 && isValidApiKey(token, config.apiKeys)) {
      res.locals.auth = { method: 'api-key' } satisfies McpAuthContext;
      return next();
    }

    if (config.jwtSecret !== null) {
      const verification = verifyJwt(token, config.jwtSecret);
      if (verification.valid) {
        res.locals.auth = { method: 'jwt' } satisfies McpAuthContext;
        return next();
      }
      logAuthFailure(req, `invalid_jwt: ${verification.reason ?? 'unknown'}`);
      return sendJsonRpcAuthError(
        res,
        401,
        'Unauthorized: invalid or expired credentials',
        extractRequestId(req)
      );
    }

    logAuthFailure(req, 'invalid_api_key');
    return sendJsonRpcAuthError(
      res,
      401,
      'Unauthorized: invalid or expired credentials',
      extractRequestId(req)
    );
  };
}
