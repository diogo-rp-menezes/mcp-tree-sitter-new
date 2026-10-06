// Web Worker for asynchronous background Tree-sitter syntax validation & linting
import { ASTNode } from '../types';

export interface LintMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
}

function extractASTErrorNodes(node: ASTNode | null, markers: LintMarker[]) {
  if (!node) return;

  if (node.type === 'ERROR' || node.type.includes('ERROR')) {
    const textSnippet = node.text ? node.text.trim().slice(0, 30) : '';
    markers.push({
      startLineNumber: node.startPoint.row + 1,
      startColumn: node.startPoint.column + 1,
      endLineNumber: node.endPoint.row + 1,
      endColumn: Math.max(node.endPoint.column + 1, node.startPoint.column + 2),
      message: textSnippet
        ? `[Tree-sitter Lint] Erro de sintaxe próximo a '${textSnippet}'`
        : `[Tree-sitter Lint] Erro de sintaxe ou token não reconhecido`,
      severity: 8, // Error
    });
  } else if (node.type.startsWith('MISSING') || node.type === 'MISSING') {
    markers.push({
      startLineNumber: node.startPoint.row + 1,
      startColumn: node.startPoint.column + 1,
      endLineNumber: node.endPoint.row + 1,
      endColumn: node.endPoint.column + 2,
      message: `[Tree-sitter Lint] Elemento sintático ausente (${node.type})`,
      severity: 8, // Error
    });
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      extractASTErrorNodes(child, markers);
    }
  }
}

self.onmessage = (e: MessageEvent) => {
  const { id, ast, code, language } = e.data;
  const markers: LintMarker[] = [];

  const lang = (language || '').toLowerCase();

  // 1. AST error nodes
  if (ast) {
    extractASTErrorNodes(ast, markers);
  }

  // 2. Static syntax checks based on detected language status for supported types
  if (code) {
    const lines: string[] = code.split('\n');

    // Bracket balancing state variables for general bracket matching
    let openBraces = 0;
    let openParens = 0;
    let openBrackets = 0;

    lines.forEach((lineText: string, idx: number) => {
      const lineNumber = idx + 1;
      const trimmed = lineText.trim();

      // Skip comments or blank lines
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
        return;
      }

      // Count bracket/brace balancing across files for JS, TS, Rust, C++, Java, CSS, JSON
      if (['typescript', 'tsx', 'javascript', 'jsx', 'ts', 'js', 'rust', 'rs', 'cpp', 'java', 'css', 'json'].includes(lang)) {
        for (let i = 0; i < lineText.length; i++) {
          const char = lineText[i];
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '(') openParens++;
          else if (char === ')') openParens--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }

      // Python specific checks
      if (['python', 'py'].includes(lang)) {
        if (
          /^(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(trimmed) &&
          !trimmed.endsWith(':') &&
          !trimmed.endsWith('\\') &&
          !trimmed.includes('#')
        ) {
          if (!markers.some((m) => m.startLineNumber === lineNumber)) {
            markers.push({
              startLineNumber: lineNumber,
              startColumn: Math.max(1, lineText.indexOf(trimmed) + 1),
              endLineNumber: lineNumber,
              endColumn: lineText.length + 1,
              message: `[Linter Python] Dois-pontos ':' ausente no final da instrução '${trimmed.split(' ')[0]}'`,
              severity: 4, // Warning
            });
          }
        }
      }

      // JS / TS specific checks
      if (['typescript', 'tsx', 'javascript', 'jsx', 'ts', 'js'].includes(lang)) {
        // Const declaration without initializer rule
        if (/^const\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*(;|\s*$)/.test(trimmed)) {
          markers.push({
            startLineNumber: lineNumber,
            startColumn: Math.max(1, lineText.indexOf(trimmed) + 1),
            endLineNumber: lineNumber,
            endColumn: lineText.length + 1,
            message: `[Linter JS/TS] Declaração 'const' precisa ser inicializada`,
            severity: 8, // Error
          });
        }
      }

      // Go specific checks
      if (['go', 'golang'].includes(lang)) {
        // Must declare package at start of file
        if (idx === 0 && !trimmed.startsWith('package ')) {
          markers.push({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 1,
            endColumn: lineText.length + 1,
            message: `[Linter Go] Arquivos Go devem começar com declaração 'package <nome>'`,
            severity: 4, // Warning
          });
        }
      }

      // JSON specific checks
      if (['json'].includes(lang)) {
        if (trimmed.endsWith(',') && idx === lines.length - 1) {
          markers.push({
            startLineNumber: lineNumber,
            startColumn: Math.max(1, lineText.lastIndexOf(',') + 1),
            endLineNumber: lineNumber,
            endColumn: lineText.length + 1,
            message: `[Linter JSON] Vírgula sobressalente no final da estrutura JSON`,
            severity: 4, // Warning
          });
        }
      }
    });

    // Check bracket matching results at end of file parsing
    if (['typescript', 'tsx', 'javascript', 'jsx', 'ts', 'js', 'rust', 'rs', 'cpp', 'java', 'css', 'json'].includes(lang)) {
      if (openBraces !== 0) {
        markers.push({
          startLineNumber: lines.length,
          startColumn: 1,
          endLineNumber: lines.length,
          endColumn: lines[lines.length - 1].length + 1,
          message: `[Linter] Chaves '{' e '}' desalinhadas (saldo: ${openBraces > 0 ? '+' : ''}${openBraces})`,
          severity: 4, // Warning
        });
      }
      if (openParens !== 0) {
        markers.push({
          startLineNumber: lines.length,
          startColumn: 1,
          endLineNumber: lines.length,
          endColumn: lines[lines.length - 1].length + 1,
          message: `[Linter] Parênteses '(' e ')' desalinhados (saldo: ${openParens > 0 ? '+' : ''}${openParens})`,
          severity: 4, // Warning
        });
      }
    }
  }

  self.postMessage({ id, markers });
};
