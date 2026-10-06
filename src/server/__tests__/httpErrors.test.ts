import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from '../app';
import { parseMcpAuthConfig } from '../auth';
import { parseCorsConfig } from '../corsConfig';
import { parseWorkspaceRootsConfig } from '../workspaceRoots';
import { toHttpError } from '../httpErrors';
import { QueryError, SecurityError, MCPTreeSitterError } from '../errors';
import { ProjectIsolationError } from '../isolation';
import { initTreeSitter } from '../treeSitter';

let server: Server;
let base: string;
const json = { 'Content-Type': 'application/json' };
const originalEnv = process.env.NODE_ENV;

beforeAll(async () => {
  await initTreeSitter();
  const env = { MCP_AUTH_ENABLED: 'false' } as NodeJS.ProcessEnv;
  const app = createApp({
    cors: parseCorsConfig(env),
    auth: parseMcpAuthConfig(env),
    workspaceRoots: parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: '/tmp' } as NodeJS.ProcessEnv),
    dbConsoleWriteEnabled: false,
  });
  await new Promise<void>((r) => {
    server = app.listen(0, '127.0.0.1', () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe('mapeamento de erros', () => {
  it('erros tipados mantêm seu status', () => {
    expect(toHttpError(new QueryError('bad')).status).toBe(400);
    expect(toHttpError(new SecurityError('no')).status).toBe(403);
    expect(toHttpError(new ProjectIsolationError('p', '/r', 'x', 'm')).status).toBe(403);
  });

  it('erro desconhecido vira 500 e em produção não vaza a mensagem', () => {
    process.env.NODE_ENV = 'production';
    const { status, body } = toHttpError(new Error('segredo interno: /etc/passwd'));
    expect(status).toBe(500);
    expect(body.message).not.toContain('passwd');
  });

  it('erro 5xx tipado em produção também não vaza detalhes', () => {
    process.env.NODE_ENV = 'production';
    const { body } = toHttpError(new MCPTreeSitterError('detalhe interno', 500, { path: '/x' }));
    expect(body.message).toBe('Erro interno do servidor');
    expect(JSON.stringify(body)).not.toContain('/x');
  });

  it('fora de produção a mensagem é preservada para depuração', () => {
    process.env.NODE_ENV = 'development';
    expect(toHttpError(new Error('boom')).body.message).toBe('boom');
  });
});

describe('middleware HTTP', () => {
  it('JSON inválido retorna 400 (não 500)', async () => {
    const res = await fetch(`${base}/api/ast`, { method: 'POST', headers: json, body: '{oops' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('BadRequest');
    expect(body.requestId).toBeTruthy();
  });

  it('payload acima do limite retorna 413', async () => {
    const big = JSON.stringify({ code: 'x'.repeat(11 * 1024 * 1024) });
    const res = await fetch(`${base}/api/ast`, { method: 'POST', headers: json, body: big });
    expect(res.status).toBe(413);
  });

  it('rota /api inexistente retorna 404 JSON', async () => {
    const res = await fetch(`${base}/api/nao-existe`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NotFound');
  });

  it('devolve X-Request-Id gerado e reaproveita um válido', async () => {
    const generated = await fetch(`${base}/api/health`);
    expect(generated.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await fetch(`${base}/api/health`, { headers: { 'X-Request-Id': 'trace-abc12345' } });
    expect(echoed.headers.get('x-request-id')).toBe('trace-abc12345');
    const invalid = await fetch(`${base}/api/health`, { headers: { 'X-Request-Id': 'a b\tc' } });
    expect(invalid.headers.get('x-request-id')).not.toBe('a b\tc');
  });

  it('erro de consulta tipado retorna 400 com X-Request-Id', async () => {
    const res = await fetch(`${base}/api/query`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ query: '(((', code: 'x = 1', language: 'python' }),
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect((await res.json()).error).toBe('QueryError');
  });
});
