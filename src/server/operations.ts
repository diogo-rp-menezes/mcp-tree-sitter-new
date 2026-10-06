/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 5 & LLM Enhancements
 * Core Operations API Implementation with Native Tree-sitter & Diagnostics
 */

import path from 'path';
import Parser from 'web-tree-sitter';
import {
  Project,
  Symbol,
  SymbolType,
  Location,
  ProjectAnalysis,
  EntryPoint,
  BuildFile,
  Dependencies,
  ComplexityMetrics,
  TextSearchResult,
  ContextLine,
  QueryMatch,
  SimilarCodeMatch,
  ASTNode,
  FileInfo,
  OutlineItem,
  SymbolReference,
  FunctionComplexity,
  SyntaxDiagnostic,
} from './types';
import { LanguageRegistry, languageRegistry as defaultLanguageRegistry } from './languageRegistry';
import { TreeCache, treeCache as defaultTreeCache } from './treeCache';
import { validateFileAccess } from './security';
import { syntaxNodeToASTNode, collectSyntaxErrors, parseRawTree } from './treeSitter';
import { DEFAULT_SYMBOL_TYPES, TEMPLATES } from './templates';
import { executeNativeQuery, getIdentifierQueryForLanguage } from './queryEngine';
import { calculateComplexity, collectAstMetrics, countLines } from './complexity';
import { FileAccessError, QueryError, LanguageNotFoundError, errorMessage } from './errors';

/**
 * 5.1 Symbol Extraction using cached native Tree and queries
 */
export async function extractSymbols(
  project: Project,
  filePath: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry,
  symbolTypes?: SymbolType[],
  excludeClassMethods: boolean = false
): Promise<Record<SymbolType, Symbol[]>> {
  validateFileAccess(filePath, project.path);

  const file = project.files.get(filePath);
  if (!file) {
    throw new FileAccessError(`File '${filePath}' not found in project '${project.name}'`);
  }

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const typesToExtract =
    symbolTypes && symbolTypes.length > 0
      ? symbolTypes
      : DEFAULT_SYMBOL_TYPES[canonicalLang] || DEFAULT_SYMBOL_TYPES.default;

  const results: Record<string, Symbol[]> = {};
  for (const t of typesToExtract) {
    results[t] = [];
  }

  const parsed = await defaultTreeCache.getOrParseTree(file.content, canonicalLang);
  if (!parsed) {
    return results as Record<SymbolType, Symbol[]>;
  }

  const { tree } = parsed;
  const ast = syntaxNodeToASTNode(tree.rootNode);

  const classRanges: { start: number; end: number }[] = [];

  function scanNodes(node: ASTNode, parentClass?: string) {
    const isClassNode =
      node.type === 'class_definition' ||
      node.type === 'class_declaration' ||
      node.type === 'class_specifier';

    const isFuncNode =
      node.type === 'function_definition' ||
      node.type === 'function_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'method_declaration' ||
      node.type === 'function_item' ||
      node.type === 'arrow_function';

    const isStructNode =
      node.type === 'struct_item' ||
      node.type === 'struct_specifier' ||
      (node.type === 'type_spec' && node.text?.includes('struct'));

    const isInterfaceNode =
      node.type === 'interface_declaration' ||
      (node.type === 'type_spec' && node.text?.includes('interface'));

    const isImportNode =
      node.type === 'import_statement' ||
      node.type === 'import_from_statement' ||
      node.type === 'use_declaration' ||
      node.type === 'import_declaration' ||
      node.type === 'preproc_include';

    if (isClassNode) {
      classRanges.push({ start: node.startPoint.row, end: node.endPoint.row });
      const nameNode = node.children.find(
        (c) => c.field === 'name' || c.type === 'identifier' || c.type === 'type_identifier'
      );
      const name = nameNode?.text || 'AnonymousClass';

      if (results.classes) {
        results.classes.push({
          name,
          type: 'classes',
          location: { start: node.startPoint, end: node.endPoint },
          startByte: node.startByte,
          endByte: node.endByte,
          start_byte: node.startByte,
          end_byte: node.endByte,
          startLine: node.startPoint.row,
          endLine: node.endPoint.row,
          startColumn: node.startPoint.column,
          endColumn: node.endPoint.column,
        });
      }

      for (const child of node.children) {
        scanNodes(child, name);
      }
      return;
    }

    if (isFuncNode) {
      const isInsideClass =
        Boolean(parentClass) ||
        classRanges.some((r) => node.startPoint.row >= r.start && node.endPoint.row <= r.end);

      if (!excludeClassMethods || !isInsideClass) {
        const nameNode = node.children.find(
          (c) =>
            c.field === 'name' ||
            c.type === 'identifier' ||
            c.type === 'property_identifier' ||
            c.type === 'field_identifier'
        );
        const name = nameNode?.text || 'anonymous';
        const paramsNode = node.children.find(
          (c) =>
            c.field === 'parameters' ||
            c.type === 'parameters' ||
            c.type === 'formal_parameters' ||
            c.type === 'parameter_list'
        );

        if (results.functions) {
          results.functions.push({
            name,
            type: 'functions',
            location: { start: node.startPoint, end: node.endPoint },
            startByte: node.startByte,
            endByte: node.endByte,
            start_byte: node.startByte,
            end_byte: node.endByte,
            startLine: node.startPoint.row,
            endLine: node.endPoint.row,
            startColumn: node.startPoint.column,
            endColumn: node.endPoint.column,
            metadata: {
              signature: paramsNode?.text ? `${name}${paramsNode.text}` : undefined,
              parent: parentClass,
              is_static: node.text?.includes('static'),
              is_async: node.text?.includes('async'),
            },
            signature: paramsNode?.text ? `${name}${paramsNode.text}` : undefined,
            parent: parentClass,
          });
        }
      }
    }

    if (isStructNode && results.structs) {
      const nameNode = node.children.find(
        (c) => c.field === 'name' || c.type === 'type_identifier' || c.type === 'identifier'
      );
      results.structs.push({
        name: nameNode?.text || 'AnonymousStruct',
        type: 'structs',
        location: { start: node.startPoint, end: node.endPoint },
        startByte: node.startByte,
        endByte: node.endByte,
        start_byte: node.startByte,
        end_byte: node.endByte,
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
      });
    }

    if (isInterfaceNode && results.interfaces) {
      const nameNode = node.children.find(
        (c) => c.field === 'name' || c.type === 'type_identifier' || c.type === 'identifier'
      );
      results.interfaces.push({
        name: nameNode?.text || 'AnonymousInterface',
        type: 'interfaces',
        location: { start: node.startPoint, end: node.endPoint },
        startByte: node.startByte,
        endByte: node.endByte,
        start_byte: node.startByte,
        end_byte: node.endByte,
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
      });
    }

    if (isImportNode && results.imports) {
      results.imports.push({
        name: node.text || '',
        type: 'imports',
        location: { start: node.startPoint, end: node.endPoint },
        startByte: node.startByte,
        endByte: node.endByte,
        start_byte: node.startByte,
        end_byte: node.endByte,
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
      });
    }

    for (const child of node.children) {
      scanNodes(child, parentClass);
    }
  }

  scanNodes(ast);
  return results as Record<SymbolType, Symbol[]>;
}

/**
 * 5.2 Project Structure Analysis
 */
export function analyzeProjectStructure(
  project: Project,
  langRegistry: LanguageRegistry = defaultLanguageRegistry,
  scanDepth: number = 3
): ProjectAnalysis {
  const languages: Record<string, number> = {};
  const entryPoints: EntryPoint[] = [];
  const buildFiles: BuildFile[] = [];
  const dirCounts: Record<string, number> = {};
  const fileCounts: Record<string, number> = {};

  const ENTRY_POINT_PATTERNS: Record<string, string[]> = {
    python: ['__main__.py', 'main.py', 'app.py', 'run.py', 'manage.py'],
    javascript: ['index.js', 'app.js', 'main.js', 'server.js'],
    typescript: ['index.ts', 'app.ts', 'main.ts', 'server.ts'],
    tsx: ['App.tsx', 'index.tsx', 'main.tsx'],
    go: ['main.go'],
    rust: ['main.rs'],
    java: ['Main.java', 'App.java'],
  };

  const BUILD_FILE_PATTERNS: Record<string, string[]> = {
    python: ['setup.py', 'pyproject.toml', 'requirements.txt', 'Pipfile', 'environment.yml'],
    javascript: ['package.json', 'yarn.lock', 'npm-shrinkwrap.json'],
    typescript: ['tsconfig.json'],
    go: ['go.mod', 'go.sum'],
    rust: ['Cargo.toml', 'Cargo.lock'],
    java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    generic: ['Makefile', 'CMakeLists.txt', 'Dockerfile', 'docker-compose.yml'],
  };

  for (const [filePath, file] of project.files.entries()) {
    const lang = file.language || langRegistry.languageForFile(filePath) || 'unknown';
    languages[lang] = (languages[lang] || 0) + 1;

    const ext = path.extname(filePath) || 'no_extension';
    fileCounts[ext] = (fileCounts[ext] || 0) + 1;

    const dir = path.dirname(filePath);
    dirCounts[dir] = (dirCounts[dir] || 0) + 1;

    const baseName = path.basename(filePath);

    // Entry points check
    for (const [epLang, patterns] of Object.entries(ENTRY_POINT_PATTERNS)) {
      if (patterns.includes(baseName)) {
        entryPoints.push({ path: filePath, language: epLang });
      }
    }

    // Build files check
    for (const [category, patterns] of Object.entries(BUILD_FILE_PATTERNS)) {
      if (patterns.includes(baseName)) {
        buildFiles.push({ path: filePath, type: category });
      }
    }
  }

  return {
    name: project.name,
    path: project.path,
    languages,
    entry_points: entryPoints,
    build_files: buildFiles,
    dir_counts: dirCounts,
    file_counts: fileCounts,
    total_files: project.files.size,
  };
}

/**
 * 5.3 Dependency Analysis
 */
export async function findDependencies(
  project: Project,
  filePath: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry
): Promise<Dependencies> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) {
    throw new FileAccessError(`File '${filePath}' not found in project '${project.name}'`);
  }

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const deps: Dependencies = {
    imports: [],
    from_imports: [],
    items: [],
    aliases: [],
    includes: [],
    requires: [],
    uses: [],
  };

  const parsed = await defaultTreeCache.getOrParseTree(file.content, canonicalLang);
  if (!parsed) return deps;

  const { tree } = parsed;
  const ast = syntaxNodeToASTNode(tree.rootNode);

  function traverse(node: ASTNode) {
    if (node.type === 'import_statement') {
      const text = node.text?.trim() || '';
      deps.imports.push(text);
    } else if (node.type === 'import_from_statement') {
      const moduleName = node.children.find((c) => c.field === 'module_name')?.text || '';
      if (moduleName) deps.from_imports.push(moduleName);
      deps.imports.push(node.text?.trim() || '');
    } else if (node.type === 'use_declaration') {
      deps.uses.push(node.text?.trim() || '');
    } else if (node.type === 'preproc_include') {
      deps.includes.push(node.text?.trim() || '');
    } else if (node.type === 'call_expression') {
      if (node.text?.includes('require(')) {
        deps.requires.push(node.text.trim());
      }
    }

    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(ast);

  // Deduplicate
  for (const key of Object.keys(deps)) {
    deps[key] = Array.from(new Set(deps[key]));
  }

  return deps;
}

/**
 * 5.4 Complexity Analysis (McCabe Cyclomatic Complexity)
 */
export async function analyzeCodeComplexity(
  project: Project,
  filePath: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry
): Promise<ComplexityMetrics> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) {
    throw new FileAccessError(`File '${filePath}' not found in project '${project.name}'`);
  }

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const parsed = await defaultTreeCache.getOrParseTree(file.content, canonicalLang);
  const ast = parsed ? syntaxNodeToASTNode(parsed.tree.rootNode) : null;

  const metrics = calculateComplexity(file.content, ast, canonicalLang);

  return {
    line_count: metrics.lineCount,
    code_lines: metrics.codeLines,
    empty_lines: Math.max(0, metrics.lineCount - metrics.codeLines - metrics.commentLines),
    comment_lines: metrics.commentLines,
    comment_ratio: metrics.commentRatio,
    function_count: metrics.functionCount,
    class_count: metrics.classCount,
    avg_function_lines: metrics.avgFunctionLines,
    cyclomatic_complexity: metrics.cyclomaticComplexity,
    language: canonicalLang,
    lineCount: metrics.lineCount,
    codeLines: metrics.codeLines,
    commentLines: metrics.commentLines,
    commentRatio: metrics.commentRatio,
    functionCount: metrics.functionCount,
    classCount: metrics.classCount,
    avgFunctionLines: metrics.avgFunctionLines,
    cyclomaticComplexity: metrics.cyclomaticComplexity,
  };
}

/**
 * 5.5 Text Search
 */
export function searchText(
  project: Project,
  pattern: string,
  filePattern: string = '**/*',
  maxResults: number = 100,
  caseSensitive: boolean = false,
  wholeWord: boolean = false,
  useRegex: boolean = false,
  contextLines: number = 0
): TextSearchResult[] {
  const results: TextSearchResult[] = [];

  let regex: RegExp;
  try {
    let expr = pattern;
    if (!useRegex) {
      expr = expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (wholeWord) {
      expr = `\\b${expr}\\b`;
    }
    regex = new RegExp(expr, caseSensitive ? 'g' : 'gi');
  } catch (err) {
    throw new QueryError(`Invalid search regular expression: ${errorMessage(err)}`);
  }

  for (const [filePath, file] of project.files.entries()) {
    if (results.length >= maxResults) break;

    const lines = file.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (results.length >= maxResults) break;

      const lineText = lines[i];
      regex.lastIndex = 0;
      if (regex.test(lineText)) {
        let context: ContextLine[] | undefined;
        if (contextLines > 0) {
          context = [];
          const startIdx = Math.max(0, i - contextLines);
          const endIdx = Math.min(lines.length - 1, i + contextLines);
          for (let c = startIdx; c <= endIdx; c++) {
            context.push({
              line: c + 1,
              text: lines[c],
              is_match: c === i,
            });
          }
        }

        results.push({
          file: filePath,
          line: i + 1,
          text: lineText,
          context,
        });
      }
    }
  }

  return results;
}

/**
 * 5.6 Native Tree-sitter Query Execution
 */
export async function queryCode(
  project: Project,
  queryString: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry,
  cache: TreeCache = defaultTreeCache,
  filePath?: string,
  language?: string,
  maxResults: number = 100,
  includeSnippets: boolean = true,
  captureFilter?: string,
  compact: boolean = false
): Promise<QueryMatch[]> {
  const matches: QueryMatch[] = [];
  const filesToQuery: { path: string; content: string; language: string }[] = [];

  if (filePath) {
    validateFileAccess(filePath, project.path);
    const file = project.files.get(filePath);
    if (!file) throw new FileAccessError(`File '${filePath}' not found`);
    const fLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);
    filesToQuery.push({
      path: filePath,
      content: file.content,
      language: fLang,
    });
  } else {
    if (!language) {
      throw new LanguageNotFoundError('undefined', {
        message: 'A target language or file path must be specified for search.',
      });
    }
    const targetLang = langRegistry.resolveLanguageOrThrow(language);
    for (const [p, f] of project.files.entries()) {
      const fLang = langRegistry.canonicalLanguageName(f.language || langRegistry.languageForFile(p) || '');
      if (fLang === targetLang) {
        filesToQuery.push({ path: p, content: f.content, language: fLang });
      }
    }
  }

  for (const f of filesToQuery) {
    if (matches.length >= maxResults) break;

    const parsed = await cache.getOrParseTree(f.content, f.language);
    if (!parsed) continue;

    const queryResults = executeNativeQuery(parsed.tree, parsed.tsLanguage, queryString, {
      captureFilter,
      maxResults: maxResults - matches.length,
    });

    for (const qr of queryResults) {
      if (matches.length >= maxResults) break;
      matches.push({
        ...qr,
        file: f.path,
        text: includeSnippets ? qr.text : '',
      });
    }
  }

  return matches;
}

/**
 * 5.7 Similar Code Detection
 */
export async function findSimilarCode(
  project: Project,
  snippet: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry,
  cache: TreeCache = defaultTreeCache,
  language: string,
  threshold: number = 0.5,
  maxResults: number = 10
): Promise<SimilarCodeMatch[]> {
  const canonical = langRegistry.canonicalLanguageName(language);
  const parsedSnippet = await cache.getOrParseTree(snippet, canonical);
  if (!parsedSnippet) return [];

  const snippetAST = syntaxNodeToASTNode(parsedSnippet.tree.rootNode);

  const snippetFp = new Set<string>();
  function fingerprint(node: ASTNode, set: Set<string>) {
    if (!node.children || node.children.length === 0) {
      set.add(`${node.type}:${node.text || ''}`);
    } else {
      set.add(node.type);
    }
    for (const c of node.children) {
      fingerprint(c, set);
    }
  }
  fingerprint(snippetAST, snippetFp);
  if (snippetFp.size === 0) return [];

  const candidates: SimilarCodeMatch[] = [];

  for (const [filePath, file] of project.files.entries()) {
    const fLang = langRegistry.canonicalLanguageName(file.language || langRegistry.languageForFile(filePath) || '');
    if (fLang !== canonical) continue;

    const parsedFile = await cache.getOrParseTree(file.content, fLang);
    if (!parsedFile) continue;

    const fileAST = syntaxNodeToASTNode(parsedFile.tree.rootNode);

    function scanBlocks(node: ASTNode) {
      const isBlock =
        node.type === 'function_definition' ||
        node.type === 'function_declaration' ||
        node.type === 'class_definition' ||
        node.type === 'class_declaration' ||
        node.type === 'method_definition' ||
        node.type === 'impl_item';

      if (isBlock) {
        const blockFp = new Set<string>();
        fingerprint(node, blockFp);

        let intersection = 0;
        for (const token of snippetFp) {
          if (blockFp.has(token)) intersection++;
        }
        const sim = intersection / snippetFp.size;

        if (sim >= threshold) {
          candidates.push({
            file: filePath,
            location: { start: node.startPoint, end: node.endPoint },
            similarity: Math.round(sim * 100) / 100,
            node_type: node.type,
            text: (node.text || '').slice(0, 150),
          });
        }
      }

      for (const child of node.children) {
        scanBlocks(child);
      }
    }

    scanBlocks(fileAST);
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, maxResults);
}

/**
 * 5.8 AST Retrieval with Syntax Diagnostics
 */
export async function getFileAST(
  project: Project,
  filePath: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry,
  cache: TreeCache = defaultTreeCache,
  maxDepth: number = 5,
  includeText: boolean = true
): Promise<{ file: string; language: string; tree: ASTNode }> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) {
    throw new FileAccessError(`File '${filePath}' not found in project '${project.name}'`);
  }

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const parsed = await cache.getOrParseTree(file.content, canonicalLang);
  if (!parsed) {
    throw new FileAccessError(`Could not generate AST for '${filePath}'`);
  }

  const rootAst = syntaxNodeToASTNode(parsed.tree.rootNode, undefined, {
    maxDepth,
    includeText,
  });

  return {
    file: filePath,
    language: canonicalLang,
    tree: rootAst,
  };
}

/**
 * 5.9 Find Node At Position
 */
export function findNodeAtPosition(
  rootNode: ASTNode,
  row: number,
  column: number
): ASTNode | null {
  function inside(node: ASTNode): boolean {
    if (row < node.startPoint.row || row > node.endPoint.row) return false;
    if (row === node.startPoint.row && column < node.startPoint.column) return false;
    if (row === node.endPoint.row && column > node.endPoint.column) return false;
    return true;
  }

  if (!inside(rootNode)) return null;

  for (const child of rootNode.children) {
    const matched = findNodeAtPosition(child, row, column);
    if (matched) return matched;
  }

  return rootNode;
}

/**
 * P2.1: Compact outline map for token budget optimization
 */
export async function getOutline(
  project: Project,
  filePath: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry
): Promise<OutlineItem[]> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) throw new FileAccessError(`File '${filePath}' not found`);

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);
  const symbols = await extractSymbols(project, filePath, langRegistry);

  const items: OutlineItem[] = [];

  for (const cls of symbols.classes || []) {
    items.push({
      name: cls.name,
      kind: 'class',
      location: cls.location || { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      startByte: cls.startByte ?? 0,
      endByte: cls.endByte ?? 0,
      children: [],
    });
  }

  for (const fn of symbols.functions || []) {
    items.push({
      name: fn.name,
      kind: fn.metadata?.parent ? 'method' : 'function',
      signature: fn.metadata?.signature || fn.name,
      location: fn.location || { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      startByte: fn.startByte ?? 0,
      endByte: fn.endByte ?? 0,
    });
  }

  for (const iface of symbols.interfaces || []) {
    items.push({
      name: iface.name,
      kind: 'interface',
      location: iface.location || { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      startByte: iface.startByte ?? 0,
      endByte: iface.endByte ?? 0,
    });
  }

  return items;
}

/**
 * P2.2: Extract exact byte slice source for a named symbol
 */
export async function getSymbolSource(
  project: Project,
  filePath: string,
  symbolName: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry
): Promise<{ name: string; language: string; source: string; location: Location } | null> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) throw new FileAccessError(`File '${filePath}' not found`);

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const parsed = await defaultTreeCache.getOrParseTree(file.content, canonicalLang);
  if (!parsed) return null;

  const ast = syntaxNodeToASTNode(parsed.tree.rootNode);

  let matchedNode: ASTNode | null = null;

  function findSymbolNode(node: ASTNode) {
    const isNamedDef =
      node.type === 'function_definition' ||
      node.type === 'function_declaration' ||
      node.type === 'class_definition' ||
      node.type === 'class_declaration' ||
      node.type === 'method_definition';

    if (isNamedDef) {
      const nameNode = node.children.find(
        (c) =>
          c.field === 'name' ||
          c.type === 'identifier' ||
          c.type === 'property_identifier' ||
          c.type === 'type_identifier'
      );
      if (nameNode?.text === symbolName) {
        matchedNode = node;
        return;
      }
    }

    for (const c of node.children) {
      if (matchedNode) return;
      findSymbolNode(c);
    }
  }

  findSymbolNode(ast);

  if (!matchedNode) return null;

  const target: ASTNode = matchedNode;
  const sourceSlice = file.content.slice(target.startByte, target.endByte);

  return {
    name: symbolName,
    language: canonicalLang,
    source: sourceSlice,
    location: { start: target.startPoint, end: target.endPoint },
  };
}

/**
 * Converts a byte offset to a UTF-16 character index in a UTF-8 string.
 */
function byteOffsetToCharIndex(str: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0;
  const buf = Buffer.from(str, 'utf8');
  if (byteOffset >= buf.length) return str.length;
  return buf.subarray(0, byteOffset).toString('utf8').length;
}

/**
 * P2.3: Find identifier references across project files with accurate ranges
 */
export async function findReferences(
  project: Project,
  symbolName: string,
  language?: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry
): Promise<SymbolReference[]> {
  const references: SymbolReference[] = [];

  for (const [filePath, file] of project.files.entries()) {
    const fLang = langRegistry.canonicalLanguageName(file.language || langRegistry.languageForFile(filePath) || '');
    if (language && fLang !== langRegistry.canonicalLanguageName(language)) continue;

    const parsed = await defaultTreeCache.getOrParseTree(file.content, fLang);
    if (!parsed) continue;

    const queryStr = getIdentifierQueryForLanguage(parsed.tsLanguage);
    try {
      const matches = executeNativeQuery(parsed.tree, parsed.tsLanguage, queryStr);
      for (const m of matches) {
        for (const cap of m.captures || []) {
          if (cap.text === symbolName) {
            const lines = file.content.split(/\r?\n/);
            const lineText = lines[cap.startPoint.row] || '';
            references.push({
              file: filePath,
              name: symbolName,
              location: cap.location || { start: cap.startPoint, end: cap.endPoint },
              startByte: cap.startByte ?? 0,
              endByte: cap.endByte ?? 0,
              contextLine: lineText.trim(),
            });
          }
        }
      }
    } catch {
      // Ignore query errors on individual files
    }
  }

  return references;
}

/**
 * P2.4: Safe syntax-validated replacement that rejects new ERROR nodes
 */
export async function safeReplaceNode(
  project: Project,
  filePath: string,
  startByte: number,
  endByte: number,
  replacementText: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry,
  options?: { isByteOffset?: boolean }
): Promise<{ success: boolean; newContent: string; newErrors: SyntaxDiagnostic[]; message: string }> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) throw new FileAccessError(`File '${filePath}' not found`);

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const oldParsed = await defaultTreeCache.getOrParseTree(file.content, canonicalLang);
  const oldErrors = oldParsed ? collectSyntaxErrors(oldParsed.tree.rootNode) : [];

  let startIdx = startByte;
  let endIdx = endByte;

  // Support both UTF-16 character offsets (tree-sitter default) and byte offsets
  if (options?.isByteOffset || startByte > file.content.length || endByte > file.content.length) {
    startIdx = byteOffsetToCharIndex(file.content, startByte);
    endIdx = byteOffsetToCharIndex(file.content, endByte);
  }

  const newContent = file.content.slice(0, startIdx) + replacementText + file.content.slice(endIdx);

  const newParsed = await parseRawTree(newContent, canonicalLang);
  if (!newParsed) {
    return {
      success: false,
      newContent: file.content,
      newErrors: [],
      message: `Failed to parse language '${canonicalLang}'`,
    };
  }

  const newErrors = collectSyntaxErrors(newParsed.tree.rootNode);

  // If new errors were introduced that didn't exist before or root has error
  if (newErrors.length > oldErrors.length || (newParsed.tree.rootNode.hasError && !oldParsed?.tree.rootNode.hasError)) {
    newParsed.tree.delete();
    return {
      success: false,
      newContent: file.content,
      newErrors,
      message: `Replacement rejected: introduced syntax error(s)`,
    };
  }

  newParsed.tree.delete();

  // Update file content in project
  file.content = newContent;
  file.sizeBytes = Buffer.byteLength(newContent, 'utf8');
  file.lastModified = new Date().toISOString();

  return {
    success: true,
    newContent,
    newErrors: [],
    message: 'Node replaced and validated successfully',
  };
}

/**
 * P2.5: Function-level Cyclomatic Complexity
 */
export async function analyzeFunctionComplexity(
  project: Project,
  filePath: string,
  langRegistry: LanguageRegistry = defaultLanguageRegistry
): Promise<FunctionComplexity[]> {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) throw new FileAccessError(`File '${filePath}' not found`);

  const canonicalLang = langRegistry.resolveFileLanguageOrThrow(filePath, file.language);

  const parsed = await defaultTreeCache.getOrParseTree(file.content, canonicalLang);
  if (!parsed) return [];

  const ast = syntaxNodeToASTNode(parsed.tree.rootNode);
  const results: FunctionComplexity[] = [];

  function scan(node: ASTNode) {
    const isFunc =
      node.type === 'function_definition' ||
      node.type === 'function_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'method_declaration';

    if (isFunc) {
      const nameNode = node.children.find(
        (c) =>
          c.field === 'name' ||
          c.type === 'identifier' ||
          c.type === 'property_identifier' ||
          c.type === 'field_identifier'
      );
      const name = nameNode?.text || 'anonymous';
      const lineCount = Math.max(1, node.endPoint.row - node.startPoint.row + 1);
      const metrics = collectAstMetrics(node);

      results.push({
        name,
        location: { start: node.startPoint, end: node.endPoint },
        startLine: node.startPoint.row + 1,
        endLine: node.endPoint.row + 1,
        lineCount,
        cyclomaticComplexity: metrics.cyclomaticComplexity,
      });
    }

    for (const c of node.children) {
      scan(c);
    }
  }

  scan(ast);
  return results;
}

/**
 * File Operations
 */
export function listProjectFiles(
  project: Project,
  pattern?: string,
  maxDepth?: number,
  filterExtensions?: string[]
): string[] {
  const result: string[] = [];
  const normalizedExts = filterExtensions
    ? filterExtensions.map((e) => `.${e.toLowerCase().replace(/^\./, '')}`)
    : null;

  for (const p of project.files.keys()) {
    if (maxDepth !== undefined) {
      const parts = p.split(/[\\/]/);
      if (parts.length > maxDepth) continue;
    }
    if (normalizedExts) {
      const ext = path.extname(p).toLowerCase();
      if (!normalizedExts.includes(ext)) continue;
    }
    result.push(p);
  }

  return result.sort();
}

export function getFileContent(
  project: Project,
  filePath: string,
  asBytes: boolean = false,
  maxLines?: number,
  startLine: number = 0
): string | Uint8Array {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) {
    throw new FileAccessError(`File '${filePath}' not found`);
  }

  let text = file.content;
  if (startLine > 0 || maxLines !== undefined) {
    const lines = text.split(/\r?\n/);
    const sliced = lines.slice(startLine, maxLines ? startLine + maxLines : undefined);
    text = sliced.join('\n');
  }

  if (asBytes) {
    return new TextEncoder().encode(text);
  }
  return text;
}

export function getFileInfo(project: Project, filePath: string): FileInfo {
  validateFileAccess(filePath, project.path);
  const file = project.files.get(filePath);
  if (!file) {
    throw new FileAccessError(`File '${filePath}' not found`);
  }

  const lines = file.content.split(/\r?\n/).length;
  const ext = path.extname(filePath).replace(/^\./, '') || null;

  return {
    path: filePath,
    size: file.sizeBytes || new TextEncoder().encode(file.content).length,
    last_modified: new Date(file.lastModified).getTime(),
    created: new Date(file.lastModified).getTime(),
    is_directory: false,
    extension: ext,
    line_count: lines,
  };
}
