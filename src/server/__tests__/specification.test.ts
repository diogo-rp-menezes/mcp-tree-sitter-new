import { describe, it, expect, beforeAll } from 'vitest';
import { languageRegistry } from '../languageRegistry';
import { serverConfig, ConfigurationManager } from '../config';
import { validateFileAccess } from '../security';
import { treeCache } from '../treeCache';
import {
  getTemplate,
  buildCompoundQuery,
  adaptQuery,
  describeNodeTypes,
} from '../queryBuilder';
import {
  extractSymbols,
  analyzeProjectStructure,
  findDependencies,
  analyzeCodeComplexity,
  searchText,
  findSimilarCode,
  getFileAST,
  findNodeAtPosition,
  listProjectFiles,
  getFileContent,
  getFileInfo,
} from '../operations';
import {
  MCPTreeSitterError,
  LanguageNotFoundError,
  SecurityError,
  FileAccessError,
  QueryError,
} from '../errors';
import { initTreeSitter } from '../treeSitter';
import { Project, ProjectFile } from '../types';

describe('AST/Tree-sitter Language-Agnostic Specification Compliance', () => {
  beforeAll(async () => {
    await initTreeSitter();
  });

  describe('Section 10 - Error Hierarchy', () => {
    it('instantiates errors with proper status codes and JSON serialization', () => {
      const secErr = new SecurityError('Access denied', { path: '/etc/passwd' });
      expect(secErr.statusCode).toBe(403);
      expect(secErr.toJSON()).toEqual({
        error: 'SecurityError',
        message: 'Access denied',
        details: { path: '/etc/passwd' },
      });

      const langErr = new LanguageNotFoundError('unknown_lang');
      expect(langErr.statusCode).toBe(404);
      expect(langErr.message).toContain('unknown_lang');

      const queryErr = new QueryError('Syntax error');
      expect(queryErr.statusCode).toBe(400);

      const accessErr = new FileAccessError('Not found');
      expect(accessErr.statusCode).toBe(404);
    });
  });

  describe('Section 3 - Language Registry Interface', () => {
    it('maps extensions to canonical language identifiers', () => {
      expect(languageRegistry.languageForFile('main.py')).toBe('python');
      expect(languageRegistry.languageForFile('app.ts')).toBe('typescript');
      expect(languageRegistry.languageForFile('component.tsx')).toBe('tsx');
      expect(languageRegistry.languageForFile('index.js')).toBe('javascript');
      expect(languageRegistry.languageForFile('lib.rs')).toBe('rust');
      expect(languageRegistry.languageForFile('server.go')).toBe('go');
      expect(languageRegistry.languageForFile('Program.cs')).toBe('csharp');
      expect(languageRegistry.languageForFile('script.sh')).toBe('bash');
    });

    it('lists available and installable languages', () => {
      const available = languageRegistry.listAvailableLanguages();
      expect(available).toContain('python');
      expect(available).toContain('javascript');
      expect(available).toContain('rust');
      expect(available).toContain('go');

      const installable = languageRegistry.listInstallableLanguages();
      expect(installable.length).toBeGreaterThan(15);
      const py = installable.find((i) => i.identifier === 'python');
      expect(py?.displayName).toBe('Python');
    });

    it('retrieves parser instances for supported languages', async () => {
      const parser = await languageRegistry.getParser('python');
      expect(parser).toBeDefined();
      expect(parser).not.toBeNull();
    });
  });

  describe('Section 6 - Query Builder Operations', () => {
    it('retrieves templates for known patterns and fallback to raw pattern', () => {
      const fnTpl = getTemplate('python', 'functions');
      expect(fnTpl).toContain('function_definition');

      const custom = getTemplate('python', '(identifier) @id');
      expect(custom).toBe('(identifier) @id');
    });

    it('builds compound queries with OR and AND combinations', () => {
      const orQuery = buildCompoundQuery('python', ['functions', 'classes'], 'or');
      expect(orQuery).toContain('function_definition');
      expect(orQuery).toContain('class_definition');

      const andQuery = buildCompoundQuery('python', ['functions'], 'and');
      expect(andQuery).toContain('predicate constraint');
    });

    it('adapts queries across language grammars', () => {
      const pyQuery = '(function_definition name: (identifier) @name)';
      const adapted = adaptQuery(pyQuery, 'python', 'javascript');
      expect(adapted.original_language).toBe('python');
      expect(adapted.target_language).toBe('javascript');
      expect(adapted.adapted_query).toContain('function_declaration');
    });

    it('provides node type descriptions', () => {
      const descriptions = describeNodeTypes('python');
      expect(descriptions.function_definition).toBeDefined();
      expect(descriptions.function_definition).toContain('Function');
    });
  });

  describe('Section 7 - Tree Cache Strategy', () => {
    it('stores, invalidates and respects cache settings', () => {
      treeCache.setEnabled(true);
      expect(treeCache.isEnabled()).toBe(true);

      const stats = treeCache.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.maxSizeMB).toBeGreaterThan(0);

      treeCache.invalidate();
      expect(treeCache.getStats().entriesCount).toBe(0);
    });
  });

  describe('Section 8 & 9 - Security Model & Configuration', () => {
    it('validates file access boundaries and throws SecurityError on path escape', () => {
      expect(() => {
        validateFileAccess('../../../etc/passwd', '/app/project');
      }).toThrowError(SecurityError);
    });

    it('rejects access to excluded directories', () => {
      expect(() => {
        validateFileAccess('.git/config', '/app/project');
      }).toThrowError(SecurityError);

      expect(() => {
        validateFileAccess('node_modules/pkg/index.js', '/app/project');
      }).toThrowError(SecurityError);
    });

    it('allows valid internal paths', () => {
      expect(() => {
        validateFileAccess('src/main.py', '/app/project');
      }).not.toThrow();
    });

    it('respects configuration precedence', () => {
      const cm = new ConfigurationManager();
      const cfg = cm.getConfig();
      expect(cfg.cache.enabled).toBe(true);
      expect(cfg.security.max_file_size_mb).toBeGreaterThan(0);
    });
  });

  describe('Section 5 - Core Operations API', () => {
    function createMockProject(): Project {
      const files = new Map<string, ProjectFile>();

      files.set('main.py', {
        path: 'main.py',
        language: 'python',
        content: `import os
import sys
from math import sqrt

class Calculator:
    def add(self, a, b):
        return a + b

def compute_total(values):
    total = 0
    for v in values:
        if v > 0:
            total += v
    return total
`,
        sizeBytes: 250,
        lastModified: new Date().toISOString(),
      });

      files.set('utils.js', {
        path: 'utils.js',
        language: 'javascript',
        content: `const fs = require('fs');

function formatMessage(msg) {
    if (!msg) {
        return "Empty";
    }
    return msg.trim();
}
`,
        sizeBytes: 150,
        lastModified: new Date().toISOString(),
      });

      return {
        name: 'test-project',
        path: '/mock/project',
        files,
      };
    }

    it('5.1 extractSymbols extracts functions, classes, and imports with excludeClassMethods support', async () => {
      const proj = createMockProject();

      // With excludeClassMethods = false
      const allSymbols = await extractSymbols(proj, 'main.py', languageRegistry, ['functions', 'classes', 'imports'], false);
      expect(allSymbols.classes?.length).toBe(1);
      expect(allSymbols.classes[0].name).toBe('Calculator');
      expect(allSymbols.functions?.length).toBe(2); // add and compute_total

      // With excludeClassMethods = true
      const filteredSymbols = await extractSymbols(proj, 'main.py', languageRegistry, ['functions', 'classes', 'imports'], true);
      expect(filteredSymbols.functions?.length).toBe(1);
      expect(filteredSymbols.functions[0].name).toBe('compute_total');
    });

    it('5.2 analyzeProjectStructure detects languages and entry points', () => {
      const proj = createMockProject();
      const analysis = analyzeProjectStructure(proj, languageRegistry);

      expect(analysis.name).toBe('test-project');
      expect(analysis.languages.python).toBe(1);
      expect(analysis.languages.javascript).toBe(1);
      expect(analysis.entry_points.some((e) => e.path === 'main.py')).toBe(true);
      expect(analysis.total_files).toBe(2);
    });

    it('5.3 findDependencies extracts imports and from_imports', async () => {
      const proj = createMockProject();
      const deps = await findDependencies(proj, 'main.py', languageRegistry);

      expect(deps.from_imports).toContain('math');
      expect(deps.imports.length).toBeGreaterThan(0);
    });

    it('5.4 analyzeCodeComplexity calculates cyclomatic complexity and lines', async () => {
      const proj = createMockProject();
      const metrics = await analyzeCodeComplexity(proj, 'main.py', languageRegistry);

      expect(metrics.line_count).toBeGreaterThan(10);
      expect(metrics.code_lines).toBeGreaterThan(5);
      expect(metrics.cyclomatic_complexity).toBeGreaterThan(1);
      expect(metrics.function_count).toBeGreaterThan(0);
      expect(metrics.class_count).toBe(1);
    });

    it('5.5 searchText searches code with regex and context lines', () => {
      const proj = createMockProject();
      const matches = searchText(proj, 'total', '**/*', 10, false, false, false, 1);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].context).toBeDefined();
      expect(matches[0].context?.some((c) => c.is_match)).toBe(true);
    });

    it('5.7 findSimilarCode detects structurally similar blocks', async () => {
      const proj = createMockProject();
      const snippet = `def calc(items):
    s = 0
    for x in items:
        if x > 0:
            s += x
    return s
`;
      const matches = await findSimilarCode(proj, snippet, languageRegistry, treeCache, 'python', 0.4);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].similarity).toBeGreaterThan(0.4);
      expect(matches[0].node_type).toBe('function_definition');
    });

    it('5.8 getFileAST returns AST with depth limiting', async () => {
      const proj = createMockProject();
      const result = await getFileAST(proj, 'main.py', languageRegistry, treeCache, 2, true);

      expect(result.file).toBe('main.py');
      expect(result.tree).toBeDefined();
      expect(result.tree.type).toBe('module');
      // Children at depth 2 should have depth set
      expect(result.tree.children[0].depth).toBe(1);
    });

    it('5.9 findNodeAtPosition locates node at coordinates', async () => {
      const proj = createMockProject();
      const { tree } = await getFileAST(proj, 'main.py', languageRegistry, treeCache, 5, true);
      const node = findNodeAtPosition(tree, 5, 4);

      expect(node).toBeDefined();
      expect(node).not.toBeNull();
    });

    it('5.10 File operations list, get content and metadata', () => {
      const proj = createMockProject();
      const fileList = listProjectFiles(proj);
      expect(fileList).toContain('main.py');
      expect(fileList).toContain('utils.js');

      const content = getFileContent(proj, 'main.py', false, 2, 0) as string;
      expect(content.split('\n').length).toBe(2);

      const info = getFileInfo(proj, 'main.py');
      expect(info.path).toBe('main.py');
      expect(info.extension).toBe('py');
      expect(info.is_directory).toBe(false);
    });
  });
});
