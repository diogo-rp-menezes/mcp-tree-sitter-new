import { describe, it, expect, beforeAll } from 'vitest';
import { languageRegistry } from '../languageRegistry';
import { initTreeSitter, parseWithTreeSitter } from '../treeSitter';
import {
  getOutline,
  getSymbolSource,
  findReferences,
  safeReplaceNode,
  analyzeFunctionComplexity,
} from '../operations';
import { executeQueryOnSource } from '../queryEngine';
import { Project, ProjectFile } from '../types';
import { QueryError, LanguageNotFoundError } from '../errors';

describe('Tree-sitter WASM Engine Conformity & Diagnostics', () => {
  beforeAll(async () => {
    await initTreeSitter();
  });

  describe('P0.1: TSX Grammar Accuracy', () => {
    it('correctly maps .tsx extension to tsx grammar without syntax errors', async () => {
      const tsxLang = languageRegistry.languageForFile('Component.tsx');
      expect(tsxLang).toBe('tsx');

      const tsxCode = `
import React, { useState } from 'react';

interface Props {
  title: string;
  count?: number;
}

export const Header: React.FC<Props> = ({ title, count = 0 }) => {
  const [active, setActive] = useState(false);
  return (
    <header className="flex items-center justify-between p-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <span className="badge">{count}</span>
      <button onClick={() => setActive(!active)}>Toggle</button>
    </header>
  );
};
`;

      const ast = await parseWithTreeSitter(tsxCode, 'tsx');
      expect(ast).toBeDefined();
      expect(ast?.hasError).toBe(false);
      expect(ast?.errors?.length).toBe(0);
      expect(ast?.type).toBe('program');
    });

    it('parses TypeScript files without syntax errors', async () => {
      const tsCode = `
export interface User<T> {
  id: string;
  data: T;
  created: Date;
}

export function processUser<T>(user: User<T>): T {
  return user.data;
}
`;
      const ast = await parseWithTreeSitter(tsCode, 'typescript');
      expect(ast?.hasError).toBe(false);
      expect(ast?.errors?.length).toBe(0);
    });
  });

  describe('P0.2: Syntax Diagnostics & Error Reporting', () => {
    it('detects syntax errors and reports location ranges', async () => {
      const brokenPython = `
def broken_fn(a, b
    return a +
`;
      const ast = await parseWithTreeSitter(brokenPython, 'python');
      expect(ast).toBeDefined();
      expect(ast?.hasError).toBe(true);
      expect(ast?.errors).toBeDefined();
      expect(ast?.errors?.length).toBeGreaterThan(0);
      const firstErr = ast?.errors?.[0];
      expect(firstErr?.startPosition).toBeDefined();
      expect(firstErr?.endPosition).toBeDefined();
    });

    it('does not announce broken wasm languages and rejects them with LanguageNotFoundError', () => {
      const available = languageRegistry.listAvailableLanguages();
      expect(available).not.toContain('yaml');
      expect(available).not.toContain('dart');
      expect(available).not.toContain('elm');

      expect(() => languageRegistry.resolveLanguageOrThrow('yaml')).toThrow(LanguageNotFoundError);
      expect(() => languageRegistry.resolveLanguageOrThrow('dart')).toThrow(LanguageNotFoundError);
    });
  });

  describe('P0.3: Multi-language Grammar Conformity', () => {
    const fixtures: Record<string, string> = {
      python: `def greet(name: str) -> str:\n    return f"Hello {name}"\n`,
      javascript: `function calculate(a, b) {\n    return a * b;\n}\n`,
      rust: `fn add(a: i32, b: i32) -> i32 {\n    a + b\n}\n`,
      go: `package main\n\nfunc Multiply(x, y int) int {\n    return x * y\n}\n`,
      c: `int sum(int a, int b) {\n    return a + b;\n}\n`,
      cpp: `class Animal {\npublic:\n    void speak() {}\n};\n`,
      csharp: `public class Greeter {\n    public string Greet() => "Hi";\n}\n`,
      java: `public class Test {\n    public static void main(String[] args) {}\n}\n`,
      json: `{"name": "mcp-server", "version": "1.0.0"}`,
      toml: `[package]\nname = "test"\nversion = "0.1.0"\n`,
      css: `.container { display: flex; align-items: center; }`,
      html: `<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hi</h1></body></html>`,
      bash: `#!/bin/bash\necho "Hello World"\n`,
    };

    for (const [lang, code] of Object.entries(fixtures)) {
      it(`parses ${lang} fixture without syntax errors`, async () => {
        const ast = await parseWithTreeSitter(code, lang);
        expect(ast, `Failed to parse ${lang}`).toBeDefined();
        expect(ast?.hasError, `Syntax error detected in ${lang} fixture`).toBe(false);
      });
    }
  });

  describe('P1.2: Native Query Execution with Predicates & Error Handling', () => {
    it('executes native S-expression queries with captures', async () => {
      const code = `
def add(a, b):
    return a + b

def subtract(a, b):
    return a - b
`;
      const matches = await executeQueryOnSource(
        code,
        'python',
        '(function_definition name: (identifier) @fn.name) @fn.def'
      );

      expect(matches.length).toBe(2);
      expect(matches[0].captures?.some((c) => c.text === 'add')).toBe(true);
      expect(matches[1].captures?.some((c) => c.text === 'subtract')).toBe(true);
    });

    it('correctly returns 0 results for queries with negative predicates without falling back to legacy falses', async () => {
      const code = `
def get_a():
    return 1

def m():
    return 2
`;
      // All functions in code match the excluded names "get_a" and "m", so query should return exactly 0 matches
      const matches = await executeQueryOnSource(
        code,
        'python',
        '(function_definition name: (identifier) @n (#not-any-of? @n "get_a" "m"))'
      );

      expect(matches.length).toBe(0);
    });

    it('throws QueryError with descriptive tree-sitter error message for invalid queries', async () => {
      const code = `def test(): pass`;
      await expect(
        executeQueryOnSource(code, 'python', '(function_definition (non_existent_node) @x)')
      ).rejects.toThrow(QueryError);
    });
  });

  describe('P1.3: Strict Language Resolution & Error Boundaries', () => {
    it('throws LanguageNotFoundError when attempting to extract symbols from unsupported or unmapped files', async () => {
      const files = new Map<string, ProjectFile>();
      files.set('config.yaml', {
        path: 'config.yaml',
        language: '',
        content: 'server:\n  port: 8080\n',
        sizeBytes: 25,
        lastModified: new Date().toISOString(),
      });
      const proj: Project = { name: 'unsupported-test', path: '/mock/path', files };

      await expect(getOutline(proj, 'config.yaml', languageRegistry)).rejects.toThrow(
        LanguageNotFoundError
      );
    });
  });

  describe('P2: LLM Optimization Tools', () => {
    function createTestProject(): Project {
      const files = new Map<string, ProjectFile>();
      files.set('src/user.ts', {
        path: 'src/user.ts',
        language: 'typescript',
        content: `
export interface UserProfile {
  id: string;
  name: string;
}

export class UserService {
  getUser(id: string): UserProfile {
    return { id, name: "Alice" };
  }

  deleteUser(id: string): boolean {
    return true;
  }
}

export function createService(): UserService {
  return new UserService();
}
`,
        sizeBytes: 300,
        lastModified: new Date().toISOString(),
      });

      files.set('src/references.js', {
        path: 'src/references.js',
        language: 'javascript',
        content: `
function foo() {}
class MyClass {
  foo() { return 1; }
}
const obj = { foo: 123, bar: foo() };
console.log(obj.foo);
const { foo } = obj;
`,
        sizeBytes: 150,
        lastModified: new Date().toISOString(),
      });

      return {
        name: 'test-llm-proj',
        path: '/mock/llm-project',
        files,
      };
    }

    it('getOutline generates compact signature map with valid offsets', async () => {
      const proj = createTestProject();
      const outline = await getOutline(proj, 'src/user.ts', languageRegistry);

      expect(outline.length).toBeGreaterThan(0);
      const names = outline.map((o) => o.name);
      expect(names).toContain('UserService');
      expect(names).toContain('UserProfile');
      expect(names).toContain('createService');
      expect(outline[0].endByte).toBeGreaterThan(0);
    });

    it('getSymbolSource slices exact byte ranges', async () => {
      const proj = createTestProject();
      const symbol = await getSymbolSource(proj, 'src/user.ts', 'createService', languageRegistry);

      expect(symbol).toBeDefined();
      expect(symbol?.name).toBe('createService');
      expect(symbol?.source).toContain('function createService()');
      expect(symbol?.source).toContain('return new UserService();');
    });

    it('findReferences discovers all identifier usages including properties and methods', async () => {
      const proj = createTestProject();
      const refs = await findReferences(proj, 'foo', 'javascript', languageRegistry);

      // Function definition, method definition, object property, call, member access, shorthand pattern
      expect(refs.length).toBe(6);
      expect(refs.every((r) => r.startByte >= 0 && r.endByte > r.startByte)).toBe(true);
    });

    it('safeReplaceNode handles UTF-8 unicode/emojis and rejects edits with syntax errors', async () => {
      const proj = createTestProject();
      const unicodeFile = `// Comentário com acentuação: Olá mundo! 🚀\nfunction greet() {\n  return "Olá";\n}\n`;
      proj.files.set('src/unicode.js', {
        path: 'src/unicode.js',
        language: 'javascript',
        content: unicodeFile,
        sizeBytes: Buffer.byteLength(unicodeFile, 'utf8'),
        lastModified: new Date().toISOString(),
      });

      // Valid replacement inside greet
      const start = unicodeFile.indexOf('return "Olá";');
      const end = start + 'return "Olá";'.length;
      const validResult = await safeReplaceNode(
        proj,
        'src/unicode.js',
        start,
        end,
        'return "Tudo bem! 🎉";',
        languageRegistry
      );

      expect(validResult.success).toBe(true);
      expect(validResult.newContent).toContain('Tudo bem! 🎉');

      // Invalid replacement introducing syntax error
      const badResult = await safeReplaceNode(
        proj,
        'src/user.ts',
        10,
        25,
        'interface Broken { { { }',
        languageRegistry
      );

      expect(badResult.success).toBe(false);
      expect(badResult.message).toContain('rejected');
    });

    it('analyzeFunctionComplexity calculates complexity per function', async () => {
      const proj = createTestProject();
      const funcs = await analyzeFunctionComplexity(proj, 'src/user.ts', languageRegistry);

      expect(funcs.length).toBeGreaterThan(0);
      expect(funcs.some((f) => f.name === 'getUser')).toBe(true);
      expect(funcs[0].cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    });
  });
});
