import { describe, it, expect, beforeAll } from 'vitest';
import { initTreeSitter } from '../treeSitter';
import { parseSourceToAST, ensureLanguagesLoaded } from '../parser';

describe('ensureLanguagesLoaded', () => {
  beforeAll(async () => {
    await initTreeSitter();
  });

  it('faz o parse síncrono usar Tree-sitter (ids ts_*) e não o fallback (node_*)', async () => {
    await ensureLanguagesLoaded(['java', 'ruby', 'c']);
    for (const [lang, code] of [
      ['java', 'class A { void f() {} }'],
      ['ruby', 'def f\n  1\nend\n'],
      ['c', 'int main(void) { return 0; }'],
    ] as const) {
      expect(parseSourceToAST(code, lang).id.startsWith('ts_')).toBe(true);
    }
  });

  it('ignora linguagens sem gramática sem lançar erro', async () => {
    await expect(ensureLanguagesLoaded(['plaintext', 'nao-existe'])).resolves.toBeUndefined();
    expect(parseSourceToAST('abc', 'plaintext').id.startsWith('node_')).toBe(true);
  });
});
