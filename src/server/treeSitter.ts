import Parser from 'web-tree-sitter';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ASTNode, SyntaxDiagnostic } from './types';
import { LanguageNotFoundError, ParsingError, errorMessage } from './errors';
import { logger } from './logger';

/**
 * Mapping between internal language names / extensions and tree-sitter-wasms binaries.
 */
export const LANGUAGE_TO_WASM_MAP: Record<string, string> = {
  python: 'tree-sitter-python.wasm',
  py: 'tree-sitter-python.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  js: 'tree-sitter-javascript.wasm',
  mjs: 'tree-sitter-javascript.wasm',
  cjs: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  ts: 'tree-sitter-typescript.wasm',
  mts: 'tree-sitter-typescript.wasm',
  cts: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  jsx: 'tree-sitter-javascript.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  rs: 'tree-sitter-rust.wasm',
  c: 'tree-sitter-c.wasm',
  h: 'tree-sitter-c.wasm',
  cpp: 'tree-sitter-cpp.wasm',
  cc: 'tree-sitter-cpp.wasm',
  cxx: 'tree-sitter-cpp.wasm',
  hpp: 'tree-sitter-cpp.wasm',
  csharp: 'tree-sitter-c_sharp.wasm',
  cs: 'tree-sitter-c_sharp.wasm',
  java: 'tree-sitter-java.wasm',
  ruby: 'tree-sitter-ruby.wasm',
  rb: 'tree-sitter-ruby.wasm',
  php: 'tree-sitter-php.wasm',
  bash: 'tree-sitter-bash.wasm',
  sh: 'tree-sitter-bash.wasm',
  zsh: 'tree-sitter-bash.wasm',
  json: 'tree-sitter-json.wasm',
  yaml: 'tree-sitter-yaml.wasm',
  yml: 'tree-sitter-yaml.wasm',
  toml: 'tree-sitter-toml.wasm',
  html: 'tree-sitter-html.wasm',
  htm: 'tree-sitter-html.wasm',
  css: 'tree-sitter-css.wasm',
  scss: 'tree-sitter-css.wasm',
  less: 'tree-sitter-css.wasm',
  kotlin: 'tree-sitter-kotlin.wasm',
  kt: 'tree-sitter-kotlin.wasm',
  kts: 'tree-sitter-kotlin.wasm',
  swift: 'tree-sitter-swift.wasm',
  dart: 'tree-sitter-dart.wasm',
  lua: 'tree-sitter-lua.wasm',
  scala: 'tree-sitter-scala.wasm',
  solidity: 'tree-sitter-solidity.wasm',
  vue: 'tree-sitter-vue.wasm',
  zig: 'tree-sitter-zig.wasm',
  ocaml: 'tree-sitter-ocaml.wasm',
  rescript: 'tree-sitter-rescript.wasm',
  elixir: 'tree-sitter-elixir.wasm',
  elisp: 'tree-sitter-elisp.wasm',
  systemrdl: 'tree-sitter-systemrdl.wasm',
  tlaplus: 'tree-sitter-tlaplus.wasm',
  elm: 'tree-sitter-elm.wasm',
  objc: 'tree-sitter-objc.wasm',
};

// Incompatible or broken WASMs in tree-sitter-wasms@0.1.13 with web-tree-sitter@0.22.6
export const KNOWN_BROKEN_LANGUAGES = new Set<string>([
  'yaml',
  'yml',
  'dart',
  'elm',
  'ql',
]);

// Core languages preloaded on server startup for instantaneous response times
const CORE_PRELOAD_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'tsx',
  'go',
  'rust',
  'json',
  'bash',
  'c',
  'cpp',
  'java',
  'html',
  'css',
  'toml',
];

let isInitialized = false;
let initPromise: Promise<void> | null = null;
const loadedLanguages = new Map<string, Parser.Language>();

/**
 * Finds the directory containing tree-sitter-wasms binaries.
 */
function getWasmsDirectory(): string {
  let moduleDir = process.cwd();
  try {
    moduleDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // fallback to process.cwd()
  }

  const candidates = [
    path.resolve(process.cwd(), 'node_modules/tree-sitter-wasms/out'),
    path.resolve(moduleDir, '../../node_modules/tree-sitter-wasms/out'),
    path.resolve(moduleDir, '../node_modules/tree-sitter-wasms/out'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), 'node_modules/tree-sitter-wasms/out');
}

/**
 * Initializes the web-tree-sitter runtime and preloads core languages.
 */
export async function initTreeSitter(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await Parser.init();
    const wasmDir = getWasmsDirectory();

    for (const lang of CORE_PRELOAD_LANGUAGES) {
      const wasmFileName = LANGUAGE_TO_WASM_MAP[lang];
      if (wasmFileName) {
        const wasmFilePath = path.join(wasmDir, wasmFileName);
        if (fs.existsSync(wasmFilePath)) {
          try {
            const language = await Parser.Language.load(wasmFilePath);
            loadedLanguages.set(lang, language);
            // Also alias common extensions
            if (lang === 'python') loadedLanguages.set('py', language);
            if (lang === 'javascript') loadedLanguages.set('js', language);
            if (lang === 'typescript') loadedLanguages.set('ts', language);
            if (lang === 'rust') loadedLanguages.set('rs', language);
          } catch {
            // continue on individual language preload failure
          }
        }
      }
    }

    isInitialized = true;
  })();

  return initPromise;
}

/**
 * Checks if a language is supported by tree-sitter-wasms.
 */
export function isTreeSitterLanguageSupported(language: string): boolean {
  const normalized = language.toLowerCase().trim();
  if (KNOWN_BROKEN_LANGUAGES.has(normalized)) {
    return false;
  }
  return Boolean(LANGUAGE_TO_WASM_MAP[normalized]);
}

/**
 * Retrieves a cached language or loads it dynamically on demand.
 */
export async function getTreeSitterLanguage(language: string): Promise<Parser.Language | null> {
  const normalized = language.toLowerCase().trim();
  if (KNOWN_BROKEN_LANGUAGES.has(normalized)) {
    return null;
  }

  if (loadedLanguages.has(normalized)) {
    return loadedLanguages.get(normalized)!;
  }

  const wasmFileName = LANGUAGE_TO_WASM_MAP[normalized];
  if (!wasmFileName) {
    return null;
  }

  if (!isInitialized) {
    await initTreeSitter();
    if (loadedLanguages.has(normalized)) {
      return loadedLanguages.get(normalized)!;
    }
  }

  const wasmDir = getWasmsDirectory();
  const wasmFilePath = path.join(wasmDir, wasmFileName);

  if (!fs.existsSync(wasmFilePath)) {
    return null;
  }

  try {
    const loaded = await Parser.Language.load(wasmFilePath);
    // Verify compatibility by checking if a Parser can set the language without error
    const testParser = new Parser();
    try {
      testParser.setLanguage(loaded);
    } finally {
      testParser.delete();
    }
    loadedLanguages.set(normalized, loaded);
    return loaded;
  } catch (err) {
    logger.warn('wasm_grammar_load_failed', { file: wasmFileName, message: errorMessage(err) });
    KNOWN_BROKEN_LANGUAGES.add(normalized);
    return null;
  }
}

/**
 * Gets already loaded language synchronously, or null if not yet loaded.
 */
export function getLoadedLanguageSync(language: string): Parser.Language | null {
  const normalized = language.toLowerCase().trim();
  if (KNOWN_BROKEN_LANGUAGES.has(normalized)) {
    return null;
  }
  return loadedLanguages.get(normalized) || null;
}

/**
 * Traverses SyntaxNode tree to collect all ERROR and MISSING syntax diagnostics.
 */
export function collectSyntaxErrors(rootNode: Parser.SyntaxNode): SyntaxDiagnostic[] {
  const diagnostics: SyntaxDiagnostic[] = [];

  function walk(node: Parser.SyntaxNode) {
    if (node.type === 'ERROR' || node.isMissing) {
      diagnostics.push({
        type: node.type,
        message: node.isMissing
          ? `Missing expected syntax token at line ${node.startPosition.row + 1}`
          : `Syntax error near '${(node.text || '').slice(0, 40)}'`,
        isMissing: Boolean(node.isMissing),
        startPosition: {
          row: node.startPosition.row,
          column: node.startPosition.column,
        },
        endPosition: {
          row: node.endPosition.row,
          column: node.endPosition.column,
        },
        startByte: node.startIndex,
        endByte: node.endIndex,
        text: node.text,
      });
    }

    const count = node.childCount;
    for (let i = 0; i < count; i++) {
      const child = node.child(i);
      if (child) {
        walk(child);
      }
    }
  }

  walk(rootNode);
  return diagnostics;
}

/**
 * Recursively converts a web-tree-sitter SyntaxNode into the application's ASTNode format.
 * Supports depth bounding and optional text extraction to prevent JSON memory explosion.
 */
export function syntaxNodeToASTNode(
  node: Parser.SyntaxNode,
  fieldName?: string,
  options?: { maxDepth?: number; includeText?: boolean; currentDepth?: number }
): ASTNode {
  const maxDepth = options?.maxDepth ?? 50;
  const includeText = options?.includeText ?? true;
  const currentDepth = options?.currentDepth ?? 0;

  const children: ASTNode[] = [];

  if (currentDepth < maxDepth) {
    const count = node.childCount;
    for (let i = 0; i < count; i++) {
      const child = node.child(i);
      if (child) {
        const childField = node.fieldNameForChild(i) || undefined;
        children.push(
          syntaxNodeToASTNode(child, childField, {
            maxDepth,
            includeText,
            currentDepth: currentDepth + 1,
          })
        );
      }
    }
  }

  const astNode: ASTNode = {
    id: `ts_${node.id}`,
    type: node.type,
    isNamed: node.isNamed,
    field: fieldName,
    field_name: fieldName,
    startPoint: {
      row: node.startPosition.row,
      column: node.startPosition.column,
    },
    endPoint: {
      row: node.endPosition.row,
      column: node.endPosition.column,
    },
    start_point: {
      row: node.startPosition.row,
      column: node.startPosition.column,
    },
    end_point: {
      row: node.endPosition.row,
      column: node.endPosition.column,
    },
    startByte: node.startIndex,
    endByte: node.endIndex,
    start_byte: node.startIndex,
    end_byte: node.endIndex,
    text: includeText ? node.text : undefined,
    children,
    depth: currentDepth,
    isApproximate: false,
  };

  // Only scan for errors at root level
  if (currentDepth === 0) {
    astNode.hasError = Boolean(node.hasError);
    if (astNode.hasError) {
      astNode.errors = collectSyntaxErrors(node);
    } else {
      astNode.errors = [];
    }
  }

  return astNode;
}

/**
 * Parses source code into native Parser.Tree and Language reference.
 * Supports incremental parsing when oldTree is provided.
 */
export async function parseRawTree(
  source: string,
  language: string,
  oldTree?: Parser.Tree | null
): Promise<{ tree: Parser.Tree; tsLanguage: Parser.Language }> {
  const tsLanguage = await getTreeSitterLanguage(language);
  if (!tsLanguage) {
    throw new LanguageNotFoundError(language);
  }

  const parser = new Parser();
  try {
    parser.setLanguage(tsLanguage);
  } catch (err) {
    parser.delete();
    throw new ParsingError(`Failed to set grammar for '${language}': ${errorMessage(err)}`, { language, cause: err });
  }

  try {
    const tree = oldTree ? parser.parse(source, oldTree) : parser.parse(source);
    return { tree, tsLanguage };
  } catch (err) {
    throw new ParsingError(`Failed to parse ${language} source: ${errorMessage(err)}`, { language, cause: err });
  } finally {
    parser.delete();
  }
}

/**
 * Parses source code into ASTNode using web-tree-sitter WASM asynchronously.
 */
export async function parseWithTreeSitter(
  source: string,
  language: string,
  options?: { maxDepth?: number; includeText?: boolean; oldTree?: Parser.Tree | null }
): Promise<ASTNode> {
  const { tree } = await parseRawTree(source, language, options?.oldTree);
  try {
    const ast = syntaxNodeToASTNode(tree.rootNode, undefined, {
      maxDepth: options?.maxDepth,
      includeText: options?.includeText,
    });
    return ast;
  } finally {
    tree.delete();
  }
}

/**
 * Parses source code synchronously if the language WASM is already loaded in memory.
 */
export function parseWithTreeSitterSync(
  source: string,
  language: string,
  options?: { maxDepth?: number; includeText?: boolean; oldTree?: Parser.Tree | null }
): ASTNode | null {
  const tsLanguage = getLoadedLanguageSync(language);
  if (!tsLanguage) {
    return null;
  }

  const parser = new Parser();
  parser.setLanguage(tsLanguage);

  let tree: Parser.Tree | null = null;
  try {
    tree = options?.oldTree ? parser.parse(source, options.oldTree) : parser.parse(source);
    const ast = syntaxNodeToASTNode(tree.rootNode, undefined, {
      maxDepth: options?.maxDepth,
      includeText: options?.includeText,
    });
    return ast;
  } finally {
    if (tree) {
      tree.delete();
    }
    parser.delete();
  }
}
