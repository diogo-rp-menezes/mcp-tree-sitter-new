import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from '../app';
import { parseMcpAuthConfig } from '../auth';
import { parseCorsConfig } from '../corsConfig';
import { parseWorkspaceRootsConfig } from '../workspaceRoots';
import { initTreeSitter } from '../treeSitter';

const KEY = 'integration-test-key';
let server: Server;
let base: string;
let root: string;

const auth = { Authorization: `Bearer ${KEY}` };
const json = { 'Content-Type': 'application/json' };

beforeAll(async () => {
  await initTreeSitter();
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'http-it-')));
  fs.writeFileSync(path.join(root, 'a.py'), 'def f(x):\n    return x\n');
  const env = {
    MCP_AUTH_ENABLED: 'true',
    MCP_API_KEYS: KEY,
    MCP_CORS_ORIGINS: 'http://allowed.test',
    MCP_ALLOWED_WORKSPACE_ROOTS: root,
  } as NodeJS.ProcessEnv;
  const app = createApp({
    cors: parseCorsConfig(env),
    auth: parseMcpAuthConfig(env),
    workspaceRoots: parseWorkspaceRootsConfig(env),
    dbConsoleWriteEnabled: false,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

describe('autenticação', () => {
  it('/api/health é público', async () => {
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  it.each(['/api/projects', '/api/languages', '/api/database/schema', '/mcp/sse'])(
    '%s exige credenciais',
    async (p) => {
      expect((await fetch(`${base}${p}`)).status).toBe(401);
    }
  );

  it('rejeita chave errada e aceita a correta', async () => {
    const bad = await fetch(`${base}/api/projects`, { headers: { Authorization: 'Bearer nope' } });
    expect(bad.status).toBe(401);
    const ok = await fetch(`${base}/api/projects`, { headers: auth });
    expect(ok.status).toBe(200);
  });

  it('POST /api/mcp sem credencial devolve erro JSON-RPC', async () => {
    const res = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.id).toBe(7);
    expect(body.error.code).toBe(-32000);
  });
});

describe('CORS', () => {
  it('reflete apenas origens permitidas', async () => {
    const ok = await fetch(`${base}/api/health`, { headers: { Origin: 'http://allowed.test' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://allowed.test');
    const bad = await fetch(`${base}/api/health`, { headers: { Origin: 'http://evil.test' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('scan-directory', () => {
  const scan = (p: string) =>
    fetch(`${base}/api/scan-directory`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ path: p }),
    });

  it('bloqueia caminhos fora das raízes', async () => {
    expect((await scan('/etc')).status).toBe(403);
    expect((await scan(path.join(root, '..'))).status).toBe(403);
  });

  it('bloqueia symlink que escapa da raiz', async () => {
    const link = path.join(root, 'escape');
    fs.symlinkSync('/etc', link);
    expect((await scan(link)).status).toBe(403);
  });

  it('aceita diretório dentro da raiz', async () => {
    const res = await scan(root);
    expect(res.status).toBeLessThan(300);
  });
});

describe('console SQL somente leitura', () => {
  const sql = (q: string) =>
    fetch(`${base}/api/database/query`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ sql: q }),
    });

  it('permite SELECT', async () => {
    expect((await sql('SELECT 1 AS x')).status).toBe(200);
  });

  it('bloqueia escrita', async () => {
    expect((await sql('DELETE FROM projects')).status).toBe(400);
    expect((await sql('DROP TABLE projects')).status).toBe(400);
  });
});

describe('análise e MCP', () => {
  it('POST /api/ast devolve uma árvore', async () => {
    const res = await fetch(`${base}/api/ast`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ code: 'def f():\n    pass\n', language: 'python' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('function_definition');
  });

  it('POST /api/mcp tools/list responde com ferramentas', async () => {
    const res = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.length).toBeGreaterThan(10);
  });

  it('rejeita jsonrpc inválido com 400', async () => {
    const res = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { ...auth, ...json },
      body: JSON.stringify({ id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('ordem das rotas de projetos', () => {
  it('/api/projects/overview não é capturada por /:name', async () => {
    const res = await fetch(`${base}/api/projects/overview`, { headers: auth });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
