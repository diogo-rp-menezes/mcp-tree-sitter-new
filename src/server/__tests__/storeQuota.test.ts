import { describe, it, expect, afterEach } from 'vitest';
import { projectStore } from '../store';
import { QuotaExceededError } from '../errors';

const NAME = 'quota-test';

afterEach(() => {
  delete process.env.MCP_MAX_PROJECT_MB;
  delete process.env.MCP_MAX_TOTAL_MB;
  projectStore.removeProject(NAME);
  projectStore.removeProject(`${NAME}-clone`);
});

describe('quota de memória do store', () => {
  it('rejeita gravação que estoura o limite do projeto e mantém o que já coube', () => {
    process.env.MCP_MAX_PROJECT_MB = '1';
    projectStore.createProject(NAME, '/projects/quota-test');
    projectStore.saveFile(NAME, 'a.txt', 'x'.repeat(600 * 1024));
    expect(() => projectStore.saveFile(NAME, 'b.txt', 'y'.repeat(600 * 1024))).toThrow(QuotaExceededError);
    expect(projectStore.getProject(NAME)?.files.has('b.txt')).toBe(false);
    expect(projectStore.getProject(NAME)?.files.has('a.txt')).toBe(true);
  });

  it('sobrescrever um arquivo só conta a diferença de tamanho', () => {
    process.env.MCP_MAX_PROJECT_MB = '1';
    projectStore.createProject(NAME, '/projects/quota-test');
    projectStore.saveFile(NAME, 'a.txt', 'x'.repeat(900 * 1024));
    expect(() => projectStore.saveFile(NAME, 'a.txt', 'z'.repeat(950 * 1024))).not.toThrow();
  });

  it('lote persiste o que coube e propaga o erro de quota', () => {
    process.env.MCP_MAX_PROJECT_MB = '1';
    projectStore.createProject(NAME, '/projects/quota-test');
    const files = [
      { path: 'one.txt', content: 'a'.repeat(400 * 1024) },
      { path: 'two.txt', content: 'b'.repeat(400 * 1024) },
      { path: 'three.txt', content: 'c'.repeat(400 * 1024) },
    ];
    expect(() => projectStore.saveFilesBatch(NAME, files)).toThrow(QuotaExceededError);
    expect(projectStore.getProject(NAME)?.files.size).toBe(2);
  });

  it('limite total bloqueia clonagem', () => {
    projectStore.createProject(NAME, '/projects/quota-test');
    projectStore.saveFile(NAME, 'a.txt', 'x'.repeat(600 * 1024));
    process.env.MCP_MAX_TOTAL_MB = '1';
    expect(() => projectStore.cloneProject(NAME, `${NAME}-clone`)).toThrow(QuotaExceededError);
    expect(projectStore.getProject(`${NAME}-clone`)).toBeUndefined();
  });
});
