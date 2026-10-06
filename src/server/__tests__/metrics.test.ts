import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from '../app';
import { parseMcpAuthConfig } from '../auth';
import { parseCorsConfig } from '../corsConfig';
import { parseWorkspaceRootsConfig } from '../workspaceRoots';

let server: Server;
let base: string;
const KEY = 'metrics-test-key';

beforeAll(async () => {
  const env = { MCP_AUTH_ENABLED: 'true', MCP_API_KEYS: KEY } as NodeJS.ProcessEnv;
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

describe('/api/metrics', () => {
  it('exige autenticação', async () => {
    expect((await fetch(`${base}/api/metrics`)).status).toBe(401);
  });

  it('expõe contadores por padrão de rota (sem alta cardinalidade) e gauges', async () => {
    const auth = { Authorization: `Bearer ${KEY}` };
    await fetch(`${base}/api/projects/um-nome-qualquer`, { headers: auth });
    await fetch(`${base}/api/projects/outro-nome`, { headers: auth });
    await fetch(`${base}/api/nao-existe-${Date.now()}`, { headers: auth });

    const res = await fetch(`${base}/api/metrics`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();

    expect(text).toContain('mcp_http_requests_total{method="GET",route="/api/projects/:name",status="4xx"} 2');
    expect(text).not.toContain('um-nome-qualquer');
    expect(text).toContain('route="unmatched"');
    expect(text).toMatch(/mcp_http_request_duration_seconds_bucket\{method="GET",route="\/api\/projects\/:name",le="\+Inf"\} 2/);
    expect(text).toMatch(/^mcp_store_projects \d+$/m);
    expect(text).toMatch(/^mcp_process_heap_used_bytes \d+$/m);
  });
});
