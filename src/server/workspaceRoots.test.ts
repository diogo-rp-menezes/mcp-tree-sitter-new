import { describe, test, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isPathWithinRoots,
  parseWorkspaceRootsConfig,
  validateScanDirectoryPath,
  type WorkspaceRootsConfig,
} from './workspaceRoots';

const IS_WIN = process.platform === 'win32';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} (actual=${a}, expected=${e})`);
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

describe('Workspace Roots - parseWorkspaceRootsConfig', () => {
  test('default "/workspace" quando a variavel esta ausente', () => {
    const config = parseWorkspaceRootsConfig({});
    assertEqual(config.roots, [path.resolve('/workspace')], 'default roots');
  });

  test('default "/workspace" quando a variavel esta vazia', () => {
    const config = parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: '' });
    assertEqual(config.roots, [path.resolve('/workspace')], 'default roots');
  });

  test('lista separada por virgula com espacos e trim', () => {
    const config = parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: ' /a , /b ' });
    assertEqual(config.roots, [path.resolve('/a'), path.resolve('/b')], 'roots parseados');
  });

  test('root relativa (./src) resolve contra o cwd', () => {
    const config = parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: './src' });
    assertEqual(config.roots, [path.resolve('./src')], 'root relativa');
  });

  test('duplicatas sao deduplicadas', () => {
    const config = parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: '/a,/a' });
    assertEqual(config.roots, [path.resolve('/a')], 'sem duplicatas');
  });

  test('lista vazia apos filtro aborta (fail-fast)', () => {
    assertThrows(
      () => parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: ' , ' }),
      'deveria lancar para lista vazia'
    );
  });

  test('null byte em root aborta (fail-fast)', () => {
    assertThrows(
      () => parseWorkspaceRootsConfig({ MCP_ALLOWED_WORKSPACE_ROOTS: '/a\0b' }),
      'deveria lancar para null byte'
    );
  });
});

describe('Workspace Roots - isPathWithinRoots (lexico)', () => {
  const lexicalRoot = path.resolve('/workspace');

  test('candidato igual a propria root e permitido', () => {
    assert(isPathWithinRoots(lexicalRoot, [lexicalRoot]), 'igualdade deve permitir');
  });

  test('caminho dentro da root e permitido', () => {
    assert(isPathWithinRoots(path.join(lexicalRoot, 'proj'), [lexicalRoot]), 'dentro deve permitir');
  });

  test('irmao com mesmo prefixo e rejeitado', () => {
    assert(!isPathWithinRoots(`${lexicalRoot}-evil`, [lexicalRoot]), 'prefixo nao e boundary');
  });

  test('caminho fora das roots e rejeitado', () => {
    assert(!isPathWithinRoots(path.resolve('/etc'), [lexicalRoot]), 'fora deve rejeitar');
  });

  test('traversal com .. escapa e e rejeitado', () => {
    assert(!isPathWithinRoots(path.join(lexicalRoot, '..', 'x'), [lexicalRoot]), '.. deve escapar');
  });

  test('separadores mistos sao normalizados', () => {
    const candidate = path.join(lexicalRoot, 'proj').replace(/\\/g, '/');
    assert(isPathWithinRoots(candidate, [lexicalRoot]), 'normalizacao de separadores');
  });

  if (IS_WIN) {
    test('win32: comparacao case-insensitive', () => {
      assert(
        isPathWithinRoots(lexicalRoot.toUpperCase(), [lexicalRoot.toLowerCase()]),
        'case-insensitive no win32'
      );
    });
  }
});

describe('Workspace Roots - validateScanDirectoryPath (com filesystem real)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpts-roots-'));
  const config: WorkspaceRootsConfig = { roots: [root] };

  fs.mkdirSync(path.join(root, 'proj'));
  fs.writeFileSync(path.join(root, 'notes.txt'), 'not a directory');

  test('caminho absoluto valido dentro da root', () => {
    const result = validateScanDirectoryPath(path.join(root, 'proj'), config);
    assert(result.ok, 'deveria ser ok');
    if (result.ok) {
      assertEqual(result.resolvedPath, path.resolve(path.join(root, 'proj')), 'resolvedPath');
    }
  });

  test('a propria root e valida', () => {
    const result = validateScanDirectoryPath(root, config);
    assert(result.ok, 'root em si deveria ser valida');
  });

  test('absoluto fora das roots retorna 403 sem vazar a root', () => {
    const result = validateScanDirectoryPath(os.tmpdir(), config);
    assert(!result.ok, 'esperado ok: false');
    assert((result as any).status === 403, 'esperado 403');
    assert(!(result as any).error.includes(root), 'mensagem 403 nao deve vazar a root');
  });

  test('.. escapando da root retorna 403', () => {
    const result = validateScanDirectoryPath(path.join(root, '..', 'elsewhere'), config);
    assert(!result.ok, 'esperado ok: false');
    assert((result as any).status === 403, 'esperado 403');
  });

  test('inexistente dentro da root retorna 404 (ecoando apenas o path do cliente)', () => {
    const result = validateScanDirectoryPath(path.join(root, 'missing'), config);
    assert(!result.ok, 'esperado ok: false');
    assert((result as any).status === 404, 'esperado 404');
  });

  test('arquivo (nao diretorio) retorna 400', () => {
    const result = validateScanDirectoryPath(path.join(root, 'notes.txt'), config);
    assert(!result.ok, 'esperado ok: false');
    assert((result as any).status === 400, 'esperado 400');
  });

  test('null byte retorna 400', () => {
    const result = validateScanDirectoryPath('dir\0name', config);
    assert(!result.ok, 'esperado ok: false');
    assert((result as any).status === 400, 'esperado 400');
  });

  test('ausente / vazio / tipo errado retornam 400', () => {
    for (const bad of [undefined, '', 123, {}, null]) {
      const result = validateScanDirectoryPath(bad, config);
      assert(!result.ok, 'esperado ok: false');
      assert((result as any).status === 400, `esperado 400 para ${JSON.stringify(bad)}`);
    }
  });

  test('relativo valido contra cwd + relativo .. retorna 403', () => {
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const okResult = validateScanDirectoryPath('proj', config);
      assert(okResult.ok, 'relativo dentro da root deveria passar');
      const escape = validateScanDirectoryPath('..', config);
      assert(!escape.ok, 'relativo .. deveria dar erro');
      assert((escape as any).status === 403, 'relativo .. deveria dar 403');
    } finally {
      process.chdir(previousCwd);
    }
  });

  if (IS_WIN) {
    test('win32: casing diferente do disco ainda e valido', () => {
      const result = validateScanDirectoryPath(path.join(root, 'PROJ'), config);
      assert(result.ok, 'case-insensitive deveria permitir');
    });
  }

  // Symlink escape — pulado se o ambiente nao permitir criacao de symlink
  // (ex.: Windows sem modo desenvolvedor / privilegio de administrador).
  let symlinkAvailable = true;
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpts-outside-'));
  try {
    fs.symlinkSync(outside, path.join(root, 'escape-link'), 'dir');
  } catch {
    symlinkAvailable = false;
  }

  if (symlinkAvailable) {
    test('symlink dentro da root apontando para fora retorna 403', () => {
      const result = validateScanDirectoryPath(path.join(root, 'escape-link'), config);
      assert(!result.ok, 'esperado ok: false');
      assert((result as any).status === 403, 'esperado 403 para symlink escape');
    });
    test('mensagem 403 de symlink nao vaza caminhos internos', () => {
      const result = validateScanDirectoryPath(path.join(root, 'escape-link'), config);
      assert(!result.ok, 'esperado ok: false');
      assert(
        !(result as any).error.includes(outside) && !(result as any).error.includes(root),
        'sem vazamento de caminhos'
      );
    });
  }

  // Cleanup after all tests
  test('cleanup temporary test files', () => {
    fs.rmSync(outside, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  });
});
