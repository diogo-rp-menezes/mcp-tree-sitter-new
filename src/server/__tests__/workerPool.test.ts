import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';

// O worker é um arquivo .ts: precisa do loader do tsx, então roda em processo filho.
describe('pool de worker threads para parse', () => {
  it('produz a mesma AST que o parse in-thread e mantém o event loop responsivo', () => {
    const script = path.resolve(__dirname, 'fixtures-workerCheck.ts');
    const out = execFileSync('node', ['--import', 'tsx', script], {
      env: { ...process.env, VITEST: '', MCP_TS_WORKERS: '2', MCP_TS_WORKER_MIN_CHARS: '1000', MCP_TS_LOG_LEVEL: 'silent' },
      encoding: 'utf8',
      timeout: 60000,
    });
    const result = JSON.parse(out.trim().split('\n').pop()!);
    // O job precisa ter rodado de fato em um worker (e não caído no fallback in-thread).
    expect(result.disabled).toBe(false);
    expect(result.workerJobs).toBe(1);
    expect(result.same).toBe(true);
    expect(result.children).toBeGreaterThan(1000);
    expect(result.maxLag).toBeLessThan(500);
  }, 70000);
});
