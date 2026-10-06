import { ASTNode, ASTPosition, SymbolItem } from './types';
import {
  FUNCTION_NODES,
  CLASS_NODES,
  BRANCH_NODES,
  LOGICAL_OPERATORS,
  COMMENT_NODES,
} from './nodeKinds';
import { parseWorkerPool, ParseTimeoutError } from './parseWorkerPool';
import {
  initTreeSitter,
  parseWithTreeSitter,
  parseWithTreeSitterSync,
  getTreeSitterLanguage,
  isTreeSitterLanguageSupported,
} from './treeSitter';

// Eagerly trigger tree-sitter wasm runtime initialization in background
initTreeSitter().catch(() => {});

export type MakeNode = (
  type: string,
  isNamed: boolean,
  start: ASTPosition,
  end: ASTPosition,
  children?: ASTNode[],
  field?: string
) => ASTNode;

export const EXT_TO_LANGUAGE: Record<string, string> = {
  py: 'python',
  pyi: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  lua: 'lua',
  dart: 'dart',
  jl: 'julia',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  css: 'css',
  scss: 'css',
  less: 'css',
  html: 'html',
  htm: 'html',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
};

/**
 * Detects the programming language based on file extension, safely handling
 * path separators and dot-separated paths. Returns 'plaintext' for unknown files.
 */
export function detectLanguage(filePath: string, fallback: string = 'plaintext'): string {
  const basename = filePath.split(/[/\\]/).pop() || '';
  if (basename.toLowerCase() === 'makefile') return 'makefile';
  if (basename.toLowerCase() === 'dockerfile') return 'dockerfile';

  const dotIdx = basename.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === basename.length - 1) {
    return fallback;
  }

  const ext = basename.slice(dotIdx + 1).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || fallback;
}

/**
 * Helper to compute UTF-8 line byte starts and character offsets.
 */
function calculateOffsets(source: string, lines: string[]): {
  lineByteStarts: number[];
  sourceByteLength: number;
} {
  const encoder = new TextEncoder();
  const lineByteStarts: number[] = [0];
  let currentByte = 0;

  for (let i = 0; i < lines.length; i++) {
    const byteLen = encoder.encode(lines[i]).length + 1; // +1 for newline
    currentByte += byteLen;
    lineByteStarts.push(currentByte);
  }

  return { lineByteStarts, sourceByteLength: currentByte };
}

/**
 * Accurately finds the closing brace of a block, skipping strings, template literals,
 * line comments and block comments.
 */
export function findBlockEnd(lines: string[], startRow: number): ASTPosition | null {
  let depth = 0;
  let started = false;
  let inBlockComment = false;
  let quote: string | null = null;

  for (let r = startRow; r < lines.length; r++) {
    const line = lines[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          c++;
        }
        continue;
      }

      if (quote) {
        if (ch === '\\') {
          c++; // skip escaped char
        } else if (ch === quote) {
          quote = null;
        }
        continue;
      }

      // Check comments
      if (ch === '/' && next === '/') {
        break; // skip rest of line
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        c++;
        continue;
      }

      // Check strings
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }

      // Check braces
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') {
        depth--;
        if (started && depth === 0) {
          return { row: r, column: c + 1 };
        }
      }
    }
    // Only template literals continue across multiple lines in JS/TS
    if (quote && quote !== '`') {
      quote = null;
    }
  }

  return null;
}

const JS_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'try',
  'catch',
  'finally',
  'return',
  'throw',
  'const',
  'let',
  'var',
  'function',
  'class',
  'import',
  'export',
  'typeof',
  'instanceof',
  'void',
  'delete',
  'yield',
  'await',
  'new',
]);

/**
 * Main parser entry point generating structured AST nodes.
 * Uses official web-tree-sitter WASM when available, falling back gracefully
 * if grammar is not yet cached synchronously.
 */
export function parseSourceToAST(source: string, language: string = 'python'): ASTNode {
  const tsAst = parseWithTreeSitterSync(source, language);
  if (tsAst) {
    return tsAst;
  }
  return parseSourceToASTFallback(source, language);
}

/**
 * Garante que as gramáticas WASM das linguagens informadas estejam carregadas,
 * para que as variantes síncronas (parseSourceToAST) usem Tree-sitter real em vez
 * do parser estrutural de fallback. Falhas individuais de carga são ignoradas
 * (o fallback continua valendo para essa linguagem).
 */
export async function ensureLanguagesLoaded(languages: Iterable<string>): Promise<void> {
  await Promise.all(
    Array.from(new Set(languages)).map(async (lang) => {
      try {
        await getTreeSitterLanguage(lang);
      } catch {
        /* linguagem sem gramática: usa fallback */
      }
    })
  );
}

/**
 * Asynchronous parser entry point guaranteeing web-tree-sitter WASM generation
 * with on-demand grammar loading for any supported language.
 */
export async function parseSourceToASTAsync(source: string, language: string = 'python'): Promise<ASTNode> {
  let tsAst: ASTNode | null = null;
  if (isTreeSitterLanguageSupported(language) && parseWorkerPool.shouldUse(source.length)) {
    try {
      tsAst = await parseWorkerPool.parse(source, language);
    } catch (err) {
      // Timeout ou falha do worker: erro de timeout é propagado; demais casos usam o caminho in-thread.
      if (err instanceof ParseTimeoutError) throw err;
      tsAst = null;
    }
  }
  if (!tsAst) tsAst = await parseWithTreeSitter(source, language);
  if (tsAst) {
    return tsAst;
  }
  return parseSourceToASTFallback(source, language);
}

/**
 * Fallback parser using structural analysis when Tree-sitter WASM is not available (e.g. plaintext).
 */
export function parseSourceToASTFallback(source: string, language: string = 'python'): ASTNode {
  let nodeIdCounter = 0;
  function nextNodeId(): string {
    return `node_${++nodeIdCounter}`;
  }

  const lines = source.split(/\r?\n/);
  const { lineByteStarts, sourceByteLength } = calculateOffsets(source, lines);
  const encoder = new TextEncoder();

  function getOffset(pos: ASTPosition): number {
    const row = Math.max(0, Math.min(lines.length - 1, pos.row));
    const lineStr = lines[row] ?? '';
    const col = Math.max(0, Math.min(lineStr.length, pos.column));
    const lineStartByte = lineByteStarts[row] ?? 0;
    const colBytes = encoder.encode(lineStr.slice(0, col)).length;
    return Math.min(sourceByteLength, lineStartByte + colBytes);
  }

  const makeNode: MakeNode = (type, isNamed, start, end, children = [], field) => {
    const startByte = getOffset(start);
    const endByte = Math.max(startByte, getOffset(end));
    const text = source.slice(startByte, endByte);
    return {
      id: nextNodeId(),
      type,
      isNamed,
      field,
      startPoint: start,
      endPoint: end,
      startByte,
      endByte,
      text,
      children,
    };
  };

  const rootType =
    language === 'python'
      ? 'module'
      : language === 'rust' || language === 'go'
      ? 'source_file'
      : language === 'csharp'
      ? 'compilation_unit'
      : 'program';

  const totalRows = lines.length;
  const lastRowLen = lines[totalRows - 1]?.length || 0;
  const rootStart: ASTPosition = { row: 0, column: 0 };
  const rootEnd: ASTPosition = { row: Math.max(0, totalRows - 1), column: lastRowLen };

  let rootNode: ASTNode;

  if (language === 'python') {
    rootNode = parsePython(source, lines, rootStart, rootEnd, makeNode);
  } else if (language === 'javascript' || language === 'typescript') {
    rootNode = parseJsTs(source, lines, language, rootStart, rootEnd, makeNode);
  } else if (language === 'go') {
    rootNode = parseGo(source, lines, rootStart, rootEnd, makeNode);
  } else if (language === 'rust') {
    rootNode = parseRust(source, lines, rootStart, rootEnd, makeNode);
  } else if (language === 'c' || language === 'cpp' || language === 'csharp') {
    rootNode = parseCFamily(source, lines, language, rootStart, rootEnd, makeNode);
  } else if (language === 'java') {
    rootNode = parseJava(source, lines, rootStart, rootEnd, makeNode);
  } else if (language === 'ruby' || language === 'php') {
    rootNode = parseRubyPhp(source, lines, language, rootStart, rootEnd, makeNode);
  } else if (language === 'json' || language === 'yaml') {
    rootNode = parseJsonYaml(source, lines, language, rootStart, rootEnd, makeNode);
  } else if (language === 'markdown' || language === 'html') {
    rootNode = parseMarkdownHtml(source, lines, language, rootStart, rootEnd, makeNode);
  } else {
    rootNode = parseGeneric(source, lines, rootType, rootStart, rootEnd, makeNode);
  }

  // Mark result as structured approximation
  (rootNode as any).isApproximate = true;
  return rootNode;
}

/**
 * Python parser with support for multiline signatures, docstrings, classes, methods,
 * branch blocks, and logical expressions.
 */
function parsePython(
  source: string,
  lines: string[],
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];
  let inDocstring = false;
  let docstringQuote = '';

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const colIndent = line.search(/\S/);

    // Multi-line docstrings
    if (inDocstring) {
      if (trimmed.includes(docstringQuote)) {
        inDocstring = false;
      }
      rootChildren.push(
        makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length })
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      const q = trimmed.slice(0, 3);
      if (trimmed.length === 3 || !trimmed.slice(3).includes(q)) {
        inDocstring = true;
        docstringQuote = q;
      }
      rootChildren.push(
        makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length })
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('#')) {
      rootChildren.push(
        makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length })
      );
      i++;
      continue;
    }

    // Function definition
    const defMatch = /((?:async\s+)?def\s+)([a-zA-Z_]\w*)/.exec(line);
    if (defMatch) {
      const funcStartRow = i;
      const funcName = defMatch[2];
      const nameCol = defMatch.index + defMatch[1].length;
      const nameEndCol = nameCol + funcName.length;

      // Collect multiline def signature until ':'
      let headerEndRow = i;
      while (headerEndRow < lines.length && !lines[headerEndRow].includes(':')) {
        headerEndRow++;
      }

      // Find extent of function body by indentation
      let endRow = headerEndRow;
      let j = headerEndRow + 1;
      let inInnerDoc = false;
      let innerDocQuote = '';

      while (j < lines.length) {
        const nextLine = lines[j];
        const nextTrimmed = nextLine.trim();

        if (nextTrimmed === '') {
          j++;
          continue;
        }

        if (inInnerDoc) {
          if (nextTrimmed.includes(innerDocQuote)) inInnerDoc = false;
          endRow = j;
          j++;
          continue;
        }

        if (nextTrimmed.startsWith('"""') || nextTrimmed.startsWith("'''")) {
          const q = nextTrimmed.slice(0, 3);
          if (nextTrimmed.length === 3 || !nextTrimmed.slice(3).includes(q)) {
            inInnerDoc = true;
            innerDocQuote = q;
          }
          endRow = j;
          j++;
          continue;
        }

        const nextIndent = nextLine.search(/\S/);
        if (nextIndent <= colIndent) break;
        endRow = j;
        j++;
      }
      i = j;

      const nameNode = makeNode(
        'identifier',
        true,
        { row: funcStartRow, column: nameCol },
        { row: funcStartRow, column: nameEndCol },
        [],
        'name'
      );

      // Parameter node
      const paramStartCol = line.indexOf('(');
      const paramEndCol = line.indexOf(')');
      const paramsNode = makeNode(
        'parameters',
        true,
        { row: funcStartRow, column: Math.max(0, paramStartCol) },
        { row: funcStartRow, column: Math.max(paramStartCol + 1, paramEndCol + 1) },
        [],
        'parameters'
      );

      // Block statements
      const blockChildren: ASTNode[] = [];
      for (let r = headerEndRow + 1; r <= endRow; r++) {
        const bl = lines[r];
        const bt = bl.trim();
        if (!bt) continue;
        const bIndent = bl.search(/\S/);

        if (bt.startsWith('#')) {
          blockChildren.push(
            makeNode('comment', false, { row: r, column: bIndent }, { row: r, column: bl.length })
          );
        } else if (/^if[\s(]/.test(bt)) {
          const ifNode = makeNode('if_statement', true, { row: r, column: bIndent }, { row: r, column: bl.length });
          if (bt.includes(' and ') || bt.includes(' or ')) {
            const opText = bt.includes(' and ') ? 'and' : 'or';
            const opCol = bl.indexOf(opText);
            const opNode = makeNode(opText, false, { row: r, column: opCol }, { row: r, column: opCol + opText.length }, [], 'operator');
            ifNode.children.push(makeNode('binary_expression', true, { row: r, column: bIndent }, { row: r, column: bl.length }, [opNode]));
          }
          blockChildren.push(ifNode);
        } else if (/^elif[\s(]/.test(bt)) {
          blockChildren.push(makeNode('elif_clause', true, { row: r, column: bIndent }, { row: r, column: bl.length }));
        } else if (bt.startsWith('else:')) {
          blockChildren.push(makeNode('else_clause', true, { row: r, column: bIndent }, { row: r, column: bl.length }));
        } else if (/^for[\s(]/.test(bt)) {
          blockChildren.push(makeNode('for_statement', true, { row: r, column: bIndent }, { row: r, column: bl.length }));
        } else if (/^while[\s(]/.test(bt)) {
          blockChildren.push(makeNode('while_statement', true, { row: r, column: bIndent }, { row: r, column: bl.length }));
        } else if (bt.startsWith('return')) {
          blockChildren.push(makeNode('return_statement', true, { row: r, column: bIndent }, { row: r, column: bl.length }));
        } else {
          blockChildren.push(makeNode('expression_statement', true, { row: r, column: bIndent }, { row: r, column: bl.length }));
        }
      }

      const blockNode = makeNode(
        'block',
        true,
        { row: headerEndRow + 1, column: 0 },
        { row: endRow, column: lines[endRow]?.length || 0 },
        blockChildren,
        'body'
      );

      const funcNode = makeNode(
        'function_definition',
        true,
        { row: funcStartRow, column: colIndent },
        { row: endRow, column: lines[endRow]?.length || 0 },
        [nameNode, paramsNode, blockNode]
      );
      rootChildren.push(funcNode);
      continue;
    }

    // Class definition
    const classMatch = /(class\s+)([a-zA-Z_]\w*)/.exec(line);
    if (classMatch) {
      const clsStartRow = i;
      const clsName = classMatch[2];
      const nameCol = classMatch.index + classMatch[1].length;
      const nameEndCol = nameCol + clsName.length;
      let endRow = i;
      let j = i + 1;

      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === '') {
          j++;
          continue;
        }
        const nextIndent = nextLine.search(/\S/);
        if (nextIndent <= colIndent) break;
        endRow = j;
        j++;
      }
      i = j;

      const nameNode = makeNode(
        'identifier',
        true,
        { row: clsStartRow, column: nameCol },
        { row: clsStartRow, column: nameEndCol },
        [],
        'name'
      );

      // Class block with methods
      const classBlockChildren: ASTNode[] = [];
      let k = clsStartRow + 1;
      while (k <= endRow) {
        const bl = lines[k];
        const bt = bl.trim();
        if (!bt) {
          k++;
          continue;
        }
        const bIndent = bl.search(/\S/);

        const methodMatch = /((?:async\s+)?def\s+)([a-zA-Z_]\w*)/.exec(bl);
        if (methodMatch) {
          const fnName = methodMatch[2];
          const fnCol = methodMatch.index + methodMatch[1].length;
          const fnEndCol = fnCol + fnName.length;
          const fnNameNode = makeNode('identifier', true, { row: k, column: fnCol }, { row: k, column: fnEndCol }, [], 'name');
          const fnNode = makeNode('function_definition', true, { row: k, column: bIndent }, { row: k, column: bl.length }, [fnNameNode]);
          classBlockChildren.push(fnNode);
        } else {
          classBlockChildren.push(makeNode('statement', true, { row: k, column: bIndent }, { row: k, column: bl.length }));
        }
        k++;
      }

      const blockNode = makeNode(
        'block',
        true,
        { row: clsStartRow + 1, column: 0 },
        { row: endRow, column: lines[endRow]?.length || 0 },
        classBlockChildren,
        'body'
      );

      rootChildren.push(
        makeNode(
          'class_definition',
          true,
          { row: clsStartRow, column: colIndent },
          { row: endRow, column: lines[endRow]?.length || 0 },
          [nameNode, blockNode]
        )
      );
      continue;
    }

    // Import statement
    if (/^(?:import\s+|from\s+)/.test(trimmed)) {
      const isFrom = trimmed.startsWith('from ');
      rootChildren.push(
        makeNode(isFrom ? 'import_from_statement' : 'import_statement', true, { row: i, column: colIndent }, { row: i, column: line.length })
      );
      i++;
      continue;
    }

    rootChildren.push(
      makeNode('expression_statement', true, { row: i, column: colIndent }, { row: i, column: line.length })
    );
    i++;
  }

  return makeNode('module', true, rootStart, rootEnd, rootChildren);
}

/**
 * JavaScript / TypeScript parser with real block extents, arrow function detection,
 * method extraction, and keyword avoidance.
 */
function parseJsTs(
  source: string,
  lines: string[],
  language: string,
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];
  let inBlockComment = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const colIndent = line.search(/\S/);

    // Multiline comment handling
    if (inBlockComment) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      if (trimmed.includes('*/')) inBlockComment = false;
      i++;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      if (!trimmed.includes('*/')) inBlockComment = true;
      i++;
      continue;
    }

    if (trimmed.startsWith('//')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      i++;
      continue;
    }

    // Import statement
    if (/^import\s+/.test(trimmed)) {
      const clauseCol = line.indexOf('import') + 6;
      const clauseNode = makeNode('import_clause', true, { row: i, column: clauseCol }, { row: i, column: line.length }, [], 'clause');
      rootChildren.push(makeNode('import_statement', true, { row: i, column: colIndent }, { row: i, column: line.length }, [clauseNode]));
      i++;
      continue;
    }

    // Function Declaration
    const fnDeclMatch = /((?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s*\*|\s+)?)([a-zA-Z_$][\w$]*)\s*\(/.exec(line);
    if (fnDeclMatch) {
      const fnName = fnDeclMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };

      const nameCol = fnDeclMatch.index + fnDeclMatch[1].length;
      const nameEndCol = nameCol + fnName.length;
      const nameNode = makeNode(
        'identifier',
        true,
        { row: i, column: nameCol },
        { row: i, column: nameEndCol },
        [],
        'name'
      );

      // Inner statements inside block
      const innerChildren = parseInnerBlockStatements(lines, i, blockEnd.row, makeNode);
      const bodyNode = makeNode('statement_block', true, { row: i, column: Math.max(0, line.indexOf('{')) }, blockEnd, innerChildren, 'body');

      const funcNode = makeNode(
        'function_declaration',
        true,
        { row: i, column: colIndent },
        blockEnd,
        [nameNode, bodyNode]
      );
      rootChildren.push(funcNode);
      i = blockEnd.row + 1;
      continue;
    }

    // Arrow Function or Function Expression Assignment: const name = (...) => { ... }
    const arrowMatch = /((?:export\s+)?(?:const|let|var)\s+)([a-zA-Z_$][\w$]*)(?:\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>)/.exec(line);
    if (arrowMatch) {
      const fnName = arrowMatch[2];
      const blockEnd = trimmed.includes('{') ? findBlockEnd(lines, i) || { row: i, column: line.length } : { row: i, column: line.length };

      const nameCol = arrowMatch.index + arrowMatch[1].length;
      const nameEndCol = nameCol + fnName.length;
      const nameNode = makeNode('identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');

      const innerChildren = blockEnd.row > i ? parseInnerBlockStatements(lines, i, blockEnd.row, makeNode) : [];
      const bodyNode = makeNode('statement_block', true, { row: i, column: Math.max(0, line.indexOf('{')) }, blockEnd, innerChildren, 'body');

      const arrowNode = makeNode('arrow_function', true, { row: i, column: colIndent }, blockEnd, [nameNode, bodyNode]);
      rootChildren.push(arrowNode);
      i = blockEnd.row + 1;
      continue;
    }

    // Class Declaration
    const classMatch = /((?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+)([a-zA-Z_$][\w$]*)/.exec(line);
    if (classMatch) {
      const clsName = classMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };

      const nameCol = classMatch.index + classMatch[1].length;
      const nameEndCol = nameCol + clsName.length;
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');

      // Parse methods inside class body
      const methods: ASTNode[] = [];
      for (let r = i + 1; r < blockEnd.row; r++) {
        const ml = lines[r];
        const mt = ml.trim();
        if (!mt || mt.startsWith('//') || mt.startsWith('/*')) continue;

        const methodMatch = /^(\s*(?:public|private|protected|static|async|\s+)*)([a-zA-Z_$][\w$]*)\s*\(/.exec(ml);
        if (methodMatch && !JS_KEYWORDS.has(methodMatch[2])) {
          const mName = methodMatch[2];
          const mCol = methodMatch.index + methodMatch[1].length;
          const mEndCol = mCol + mName.length;
          const mEnd = findBlockEnd(lines, r) || { row: r, column: ml.length };
          const mNameNode = makeNode('identifier', true, { row: r, column: mCol }, { row: r, column: mEndCol }, [], 'name');
          const mBody = makeNode('statement_block', true, { row: r, column: ml.indexOf('{') }, mEnd, [], 'body');
          methods.push(makeNode('method_declaration', true, { row: r, column: ml.search(/\S/) }, mEnd, [mNameNode, mBody]));
          r = mEnd.row;
        }
      }

      const bodyNode = makeNode('class_body', true, { row: i, column: Math.max(0, line.indexOf('{')) }, blockEnd, methods, 'body');
      rootChildren.push(makeNode('class_declaration', true, { row: i, column: colIndent }, blockEnd, [nameNode, bodyNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Interface Declaration
    const ifMatch = /((?:export\s+)?interface\s+)([a-zA-Z_$][\w$]*)/.exec(line);
    if (language === 'typescript' && ifMatch) {
      const ifName = ifMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      const nameCol = ifMatch.index + ifMatch[1].length;
      const nameEndCol = nameCol + ifName.length;
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      const bodyNode = makeNode('interface_body', true, { row: i, column: Math.max(0, line.indexOf('{')) }, blockEnd, [], 'body');
      rootChildren.push(makeNode('interface_declaration', true, { row: i, column: colIndent }, blockEnd, [nameNode, bodyNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Control flow statements
    if (/^if\s*\(/.test(trimmed)) {
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      const ifNode = makeNode('if_statement', true, { row: i, column: colIndent }, blockEnd);
      // Check for logical operators in condition
      if (trimmed.includes('&&') || trimmed.includes('||') || trimmed.includes('??')) {
        const op = trimmed.includes('&&') ? '&&' : trimmed.includes('||') ? '||' : '??';
        const opNode = makeNode(op, false, { row: i, column: line.indexOf(op) }, { row: i, column: line.indexOf(op) + 2 }, [], 'operator');
        ifNode.children.push(makeNode('binary_expression', true, { row: i, column: colIndent }, { row: i, column: line.length }, [opNode]));
      }
      rootChildren.push(ifNode);
      i = blockEnd.row + 1;
      continue;
    }

    if (/^for\s*\(/.test(trimmed)) {
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      rootChildren.push(makeNode('for_statement', true, { row: i, column: colIndent }, blockEnd));
      i = blockEnd.row + 1;
      continue;
    }

    if (/^while\s*\(/.test(trimmed)) {
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      rootChildren.push(makeNode('while_statement', true, { row: i, column: colIndent }, blockEnd));
      i = blockEnd.row + 1;
      continue;
    }

    // Call Expression (NOT on keywords)
    const callMatch = /^([a-zA-Z_$][\w$]*)\s*\(/.exec(trimmed);
    if (callMatch && !JS_KEYWORDS.has(callMatch[1])) {
      const cName = callMatch[1];
      const cCol = line.indexOf(cName);
      const fnNode = makeNode('identifier', true, { row: i, column: cCol }, { row: i, column: cCol + cName.length }, [], 'function');
      rootChildren.push(makeNode('call_expression', true, { row: i, column: colIndent }, { row: i, column: line.length }, [fnNode]));
      i++;
      continue;
    }

    rootChildren.push(makeNode('statement', true, { row: i, column: colIndent }, { row: i, column: line.length }));
    i++;
  }

  return makeNode('program', true, rootStart, rootEnd, rootChildren);
}

/**
 * Parses inner statements within a code block (for complexity and traversal).
 */
function parseInnerBlockStatements(lines: string[], startRow: number, endRow: number, makeNode: MakeNode): ASTNode[] {
  const children: ASTNode[] = [];
  for (let r = startRow + 1; r < endRow; r++) {
    const l = lines[r];
    const t = l.trim();
    if (!t) continue;
    const col = l.search(/\S/);

    if (t.startsWith('//') || t.startsWith('/*')) {
      children.push(makeNode('comment', false, { row: r, column: col }, { row: r, column: l.length }));
    } else if (/^if\s*\(/.test(t)) {
      const ifNode = makeNode('if_statement', true, { row: r, column: col }, { row: r, column: l.length });
      if (t.includes('&&') || t.includes('||') || t.includes('??')) {
        const op = t.includes('&&') ? '&&' : t.includes('||') ? '||' : '??';
        const opCol = l.indexOf(op);
        const opNode = makeNode(op, false, { row: r, column: opCol }, { row: r, column: opCol + 2 }, [], 'operator');
        ifNode.children.push(makeNode('binary_expression', true, { row: r, column: col }, { row: r, column: l.length }, [opNode]));
      }
      children.push(ifNode);
    } else if (/^for\s*\(/.test(t)) {
      children.push(makeNode('for_statement', true, { row: r, column: col }, { row: r, column: l.length }));
    } else if (/^while\s*\(/.test(t)) {
      children.push(makeNode('while_statement', true, { row: r, column: col }, { row: r, column: l.length }));
    } else if (t.startsWith('return')) {
      children.push(makeNode('return_statement', true, { row: r, column: col }, { row: r, column: l.length }));
    } else {
      children.push(makeNode('statement', true, { row: r, column: col }, { row: r, column: l.length }));
    }
  }
  return children;
}

/**
 * Go parser supporting receiver methods `func (r *T) Method()`, functions, structs, and interfaces.
 */
function parseGo(
  source: string,
  lines: string[],
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('//')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      i++;
      continue;
    }
    if (trimmed.startsWith('package ')) {
      rootChildren.push(makeNode('package_clause', true, { row: i, column: colIndent }, { row: i, column: line.length }));
      i++;
      continue;
    }
    if (trimmed.startsWith('import ')) {
      const blockEnd = trimmed.includes('(') ? findBlockEnd(lines, i) || { row: i, column: line.length } : { row: i, column: line.length };
      rootChildren.push(makeNode('import_declaration', true, { row: i, column: colIndent }, blockEnd));
      i = blockEnd.row + 1;
      continue;
    }

    // Method with receiver: func (r *Receiver) MethodName(...)
    const methodMatch = /(func\s*\([^)]+\)\s*)([a-zA-Z_]\w*)/.exec(line);
    if (methodMatch) {
      const methodName = methodMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };

      const nameCol = methodMatch.index + methodMatch[1].length;
      const nameEndCol = nameCol + methodName.length;
      const nameNode = makeNode('identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      const bodyNode = makeNode('block', true, { row: i, column: line.indexOf('{') }, blockEnd, [], 'body');

      rootChildren.push(makeNode('method_declaration', true, { row: i, column: colIndent }, blockEnd, [nameNode, bodyNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Standard Function: func FunctionName(...)
    const funcMatch = /(func\s+)([a-zA-Z_]\w*)/.exec(line);
    if (funcMatch) {
      const fnName = funcMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };

      const nameCol = funcMatch.index + funcMatch[1].length;
      const nameEndCol = nameCol + fnName.length;
      const nameNode = makeNode('identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      const bodyNode = makeNode('block', true, { row: i, column: line.indexOf('{') }, blockEnd, [], 'body');

      rootChildren.push(makeNode('function_declaration', true, { row: i, column: colIndent }, blockEnd, [nameNode, bodyNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Type Spec (Struct / Interface)
    const typeMatch = /(type\s+)([a-zA-Z_]\w*)\s+(struct|interface)/.exec(line);
    if (typeMatch) {
      const typeName = typeMatch[2];
      const kind = typeMatch[3];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };

      const nameCol = typeMatch.index + typeMatch[1].length;
      const nameEndCol = nameCol + typeName.length;
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      const kindNode = makeNode(kind === 'struct' ? 'struct_type' : 'interface_type', true, { row: i, column: line.indexOf(kind) }, blockEnd);

      rootChildren.push(makeNode('type_spec', true, { row: i, column: colIndent }, blockEnd, [nameNode, kindNode]));
      i = blockEnd.row + 1;
      continue;
    }

    rootChildren.push(makeNode('statement', true, { row: i, column: colIndent }, { row: i, column: line.length }));
    i++;
  }

  return makeNode('source_file', true, rootStart, rootEnd, rootChildren);
}

/**
 * Rust parser supporting functions with attributes, traits, impls, structs, and enums.
 */
function parseRust(
  source: string,
  lines: string[],
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('//')) {
      rootChildren.push(makeNode('line_comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      i++;
      continue;
    }

    if (trimmed.startsWith('#[')) {
      rootChildren.push(makeNode('attribute_item', true, { row: i, column: colIndent }, { row: i, column: line.length }));
      i++;
      continue;
    }

    // Function item
    const fnMatch = /((?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?(?:unsafe\s+)?fn\s+)([a-zA-Z_]\w*)/.exec(line);
    if (fnMatch) {
      const fnName = fnMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };

      const nameCol = fnMatch.index + fnMatch[1].length;
      const nameEndCol = nameCol + fnName.length;
      const nameNode = makeNode('identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      const bodyNode = makeNode('block', true, { row: i, column: line.indexOf('{') }, blockEnd, [], 'body');

      rootChildren.push(makeNode('function_item', true, { row: i, column: colIndent }, blockEnd, [nameNode, bodyNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Struct item
    const structMatch = /((?:pub(?:\([^)]*\))?\s+)?struct\s+)([a-zA-Z_]\w*)/.exec(line);
    if (structMatch) {
      const name = structMatch[2];
      const blockEnd = trimmed.includes('{') ? findBlockEnd(lines, i) || { row: i, column: line.length } : { row: i, column: line.length };
      const nameCol = structMatch.index + structMatch[1].length;
      const nameEndCol = nameCol + name.length;
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      rootChildren.push(makeNode('struct_item', true, { row: i, column: colIndent }, blockEnd, [nameNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Enum item
    const enumMatch = /((?:pub(?:\([^)]*\))?\s+)?enum\s+)([a-zA-Z_]\w*)/.exec(line);
    if (enumMatch) {
      const name = enumMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      const nameCol = enumMatch.index + enumMatch[1].length;
      const nameEndCol = nameCol + name.length;
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      rootChildren.push(makeNode('enum_item', true, { row: i, column: colIndent }, blockEnd, [nameNode]));
      i = blockEnd.row + 1;
      continue;
    }

    // Impl item
    const implMatch = /(impl(?:<[^>]+>)?\s+)([a-zA-Z_]\w*)/.exec(line);
    if (implMatch) {
      const name = implMatch[2];
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      const nameCol = implMatch.index + implMatch[1].length;
      const nameEndCol = nameCol + name.length;
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameEndCol }, [], 'name');
      rootChildren.push(makeNode('impl_item', true, { row: i, column: colIndent }, blockEnd, [nameNode]));
      i = blockEnd.row + 1;
      continue;
    }

    rootChildren.push(makeNode('statement', true, { row: i, column: colIndent }, { row: i, column: line.length }));
    i++;
  }

  return makeNode('source_file', true, rootStart, rootEnd, rootChildren);
}

function parseCFamily(
  source: string,
  lines: string[],
  language: string,
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];
  const rootType = language === 'csharp' ? 'compilation_unit' : 'translation_unit';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    if (trimmed.startsWith('#include') || trimmed.startsWith('using ')) {
      rootChildren.push(makeNode(language === 'csharp' ? 'using_directive' : 'preproc_include', true, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    const classMatch = /(?:public|private|protected|internal)?\s*(?:class|struct|interface|enum)\s+([a-zA-Z_]\w*)/.exec(trimmed);
    if (classMatch) {
      const name = classMatch[1];
      const nameCol = line.indexOf(name);
      const nameNode = makeNode('type_identifier', true, { row: i, column: nameCol }, { row: i, column: nameCol + name.length }, [], 'name');
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      rootChildren.push(makeNode(trimmed.includes('struct') ? 'struct_specifier' : 'class_declaration', true, { row: i, column: colIndent }, blockEnd, [nameNode]));
      i = blockEnd.row;
      continue;
    }

    rootChildren.push(makeNode('statement', true, { row: i, column: colIndent }, { row: i, column: line.length }));
  }

  return makeNode(rootType, true, rootStart, rootEnd, rootChildren);
}

function parseJava(
  source: string,
  lines: string[],
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    if (trimmed.startsWith('package ') || trimmed.startsWith('import ')) {
      rootChildren.push(makeNode(trimmed.startsWith('package') ? 'package_declaration' : 'import_declaration', true, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    const classMatch = /(?:public|private|protected|abstract|static|final|\s+)*\s*(?:class|interface|enum|record)\s+([a-zA-Z_]\w*)/.exec(trimmed);
    if (classMatch) {
      const name = classMatch[1];
      const nameCol = line.indexOf(name);
      const nameNode = makeNode('identifier', true, { row: i, column: nameCol }, { row: i, column: nameCol + name.length }, [], 'name');
      const blockEnd = findBlockEnd(lines, i) || { row: i, column: line.length };
      rootChildren.push(makeNode(trimmed.includes('interface') ? 'interface_declaration' : 'class_declaration', true, { row: i, column: colIndent }, blockEnd, [nameNode]));
      i = blockEnd.row;
      continue;
    }

    rootChildren.push(makeNode('statement', true, { row: i, column: colIndent }, { row: i, column: line.length }));
  }

  return makeNode('program', true, rootStart, rootEnd, rootChildren);
}

function parseRubyPhp(
  source: string,
  lines: string[],
  language: string,
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    if (/^(?:class|module|namespace)\s+([a-zA-Z_]\w*)/.test(trimmed)) {
      const match = /(?:class|module|namespace)\s+([a-zA-Z_]\w*)/.exec(trimmed);
      const name = match ? match[1] : 'Class';
      const nameCol = line.indexOf(name);
      const nameNode = makeNode('identifier', true, { row: i, column: nameCol }, { row: i, column: nameCol + name.length }, [], 'name');
      rootChildren.push(makeNode('class_declaration', true, { row: i, column: colIndent }, { row: i, column: line.length }, [nameNode]));
      continue;
    }

    rootChildren.push(makeNode('statement', true, { row: i, column: colIndent }, { row: i, column: line.length }));
  }

  return makeNode('program', true, rootStart, rootEnd, rootChildren);
}

function parseJsonYaml(
  source: string,
  lines: string[],
  language: string,
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('#')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    const pairRegex = /"([a-zA-Z0-9_.-]+)"\s*:\s*([^,{}]+)|([a-zA-Z0-9_.-]+)\s*:\s*(.*)/g;
    let match;
    let found = false;

    while ((match = pairRegex.exec(line)) !== null) {
      const key = match[1] || match[3];
      const val = match[2] || match[4];
      const keyIndex = line.indexOf(key, match.index);
      const keyNode = makeNode('string_scalar', true, { row: i, column: keyIndex }, { row: i, column: keyIndex + key.length }, [], 'key');
      const valNode = makeNode('value', true, { row: i, column: match.index + match[0].length - (val?.length || 0) }, { row: i, column: match.index + match[0].length }, [], 'value');
      rootChildren.push(makeNode('pair', true, { row: i, column: match.index }, { row: i, column: match.index + match[0].length }, [keyNode, valNode]));
      found = true;
    }

    if (!found) {
      rootChildren.push(makeNode('value', true, { row: i, column: colIndent }, { row: i, column: line.length }));
    }
  }

  return makeNode(language === 'json' ? 'document' : 'stream', true, rootStart, rootEnd, rootChildren);
}

function parseMarkdownHtml(
  source: string,
  lines: string[],
  language: string,
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colIndent = line.search(/\S/);

    if (language === 'markdown' && trimmed.startsWith('#')) {
      rootChildren.push(makeNode('heading', true, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      rootChildren.push(makeNode('element', true, { row: i, column: colIndent }, { row: i, column: line.length }));
      continue;
    }

    rootChildren.push(makeNode('paragraph', true, { row: i, column: colIndent }, { row: i, column: line.length }));
  }

  return makeNode('document', true, rootStart, rootEnd, rootChildren);
}

function parseGeneric(
  source: string,
  lines: string[],
  rootType: string,
  rootStart: ASTPosition,
  rootEnd: ASTPosition,
  makeNode: MakeNode
): ASTNode {
  const rootChildren: ASTNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colIndent = line.search(/\S/);

    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      rootChildren.push(makeNode('comment', false, { row: i, column: colIndent }, { row: i, column: line.length }));
    } else {
      rootChildren.push(makeNode('line_item', true, { row: i, column: colIndent }, { row: i, column: line.length }));
    }
  }
  return makeNode(rootType, true, rootStart, rootEnd, rootChildren);
}

/**
 * Searches the AST hierarchically for the deepest node encompassing the given coordinate.
 * Uses 0-based row and column coordinate convention.
 */
export function findNodeAtPosition(root: ASTNode, row: number, column: number): ASTNode | null {
  function contains(node: ASTNode): boolean {
    if (row < node.startPoint.row || row > node.endPoint.row) return false;
    if (row === node.startPoint.row && column < node.startPoint.column) return false;
    if (row === node.endPoint.row && column >= node.endPoint.column) return false;
    return true;
  }

  if (!contains(root)) return null;

  let current: ASTNode = root;
  let matched = true;

  while (matched) {
    matched = false;
    for (const child of current.children) {
      if (contains(child)) {
        current = child;
        matched = true;
        break;
      }
    }
  }

  return current;
}

/**
 * Structured symbol table extracted from an AST.
 */
export interface SymbolTable {
  functions: SymbolItem[];
  classes: SymbolItem[];
  interfaces: SymbolItem[];
  imports: SymbolItem[];
  variables: SymbolItem[];
  [key: string]: SymbolItem[];
}

/**
 * Extracts symbols (functions, methods, classes, interfaces, imports) from the AST,
 * maintaining parent-child class hierarchy.
 */
export function extractSymbolsFromAST(root: ASTNode, language: string = 'python'): SymbolTable {
  const symbols: SymbolTable = {
    functions: [],
    classes: [],
    interfaces: [],
    imports: [],
    variables: [],
  };

  function traverse(node: ASTNode, parentClass?: string) {
    // Functions and methods (must be a named node)
    if (
      node.isNamed &&
      (FUNCTION_NODES.has(node.type) || node.type === 'method_definition')
    ) {
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
          c.type.includes('param') ||
          c.type === 'formal_parameters' ||
          c.type === 'parameter_list'
      );
      const signature = paramsNode?.text || '()';
      const isMethod =
        node.type === 'method_declaration' ||
        node.type === 'method_definition' ||
        Boolean(parentClass);

      symbols.functions.push({
        name,
        type: isMethod ? 'method' : 'function',
        signature: `${name}${signature}`,
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
        parent: parentClass,
      });

      for (const child of node.children) {
        traverse(child, parentClass);
      }
      return;
    }

    // Classes, structs, impls (must be a named node)
    if (
      node.isNamed &&
      (CLASS_NODES.has(node.type) ||
        node.type === 'class_specifier' ||
        node.type === 'struct_specifier' ||
        (node.type === 'type_spec' && !node.children.some((c) => c.type === 'interface_type')))
    ) {
      const nameNode = node.children.find(
        (c) =>
          c.field === 'name' ||
          c.type === 'identifier' ||
          c.type === 'type_identifier' ||
          c.type === 'type_name'
      );
      const name = nameNode?.text || 'Class';

      symbols.classes.push({
        name,
        type: 'class',
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
        parent: parentClass,
      });

      for (const child of node.children) {
        traverse(child, name);
      }
      return;
    }

    // Interfaces and Go interface specs (must be a named node)
    if (
      node.isNamed &&
      (node.type === 'interface_declaration' ||
        node.type === 'trait_item' ||
        (node.type === 'type_spec' && node.children.some((c) => c.type === 'interface_type')))
    ) {
      const nameNode = node.children.find(
        (c) =>
          c.field === 'name' ||
          c.type === 'identifier' ||
          c.type === 'type_identifier' ||
          c.type.includes('identifier')
      );
      const name = nameNode?.text || 'Interface';
      symbols.interfaces.push({
        name,
        type: 'interface',
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
      });
      return;
    }

    // Imports
    if (
      node.type === 'import_statement' ||
      node.type === 'import_from_statement' ||
      node.type === 'import_declaration' ||
      node.type === 'use_declaration' ||
      node.type === 'using_directive' ||
      node.type === 'preproc_include'
    ) {
      symbols.imports.push({
        name: node.text?.trim() || 'import',
        type: 'import',
        startLine: node.startPoint.row,
        endLine: node.endPoint.row,
        startColumn: node.startPoint.column,
        endColumn: node.endPoint.column,
      });
      return;
    }

    for (const child of node.children) {
      traverse(child, parentClass);
    }
  }

  traverse(root);
  return symbols;
}
