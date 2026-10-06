import { ASTNode, CodeComplexity } from './types';
import {
  FUNCTION_NODES,
  CLASS_NODES,
  BRANCH_NODES,
  LOGICAL_OPERATORS,
  COMMENT_NODES,
} from './nodeKinds';

export {
  FUNCTION_NODES,
  CLASS_NODES,
  BRANCH_NODES,
  LOGICAL_OPERATORS,
  COMMENT_NODES,
};

export interface LanguageConfig {
  lineComment: string[];
  blockCommentStart?: string;
  blockCommentEnd?: string;
}

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  python: { lineComment: ['#'] },
  ruby: { lineComment: ['#'] },
  yaml: { lineComment: ['#'] },
  javascript: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  typescript: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  rust: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  go: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  c: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  cpp: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  csharp: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  java: { lineComment: ['//'], blockCommentStart: '/*', blockCommentEnd: '*/' },
  css: { lineComment: [], blockCommentStart: '/*', blockCommentEnd: '*/' },
  html: { lineComment: [], blockCommentStart: '<!--', blockCommentEnd: '-->' },
};

/**
 * Helper to round numbers to a specific number of decimal places.
 */
export const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * Counts code lines and comment lines accurately without counting string literals,
 * protocol URLs, or CSS/Rust hashes as comments.
 */
export function countLines(
  source: string,
  ast?: ASTNode | null,
  language: string = 'python'
): { lineCount: number; codeLines: number; commentLines: number } {
  const lines = source.split(/\r?\n/);
  const lineCount = lines.length;

  // 1. If AST is available, extract precise line ranges from comment nodes
  if (ast) {
    const commentLineSet = new Set<number>();
    const stack: ASTNode[] = [ast];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (COMMENT_NODES.has(node.type)) {
        for (let r = node.startPoint.row; r <= node.endPoint.row; r++) {
          commentLineSet.add(r);
        }
      }
      if (node.children) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i]);
        }
      }
    }

    let codeLines = 0;
    let commentLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue; // blank line

      if (commentLineSet.has(i)) {
        commentLines++;
        // If there's non-whitespace outside comments on this line, count as code too
        const lineWithoutComment = raw
          .replace(/#.*$/, '')
          .replace(/\/\/.*$/, '')
          .replace(/\/\*.*?\*\//g, '')
          .trim();
        if (lineWithoutComment.length > 0) {
          codeLines++;
        }
      } else {
        codeLines++;
      }
    }

    return { lineCount, codeLines, commentLines };
  }

  // 2. Fallback tokenizer/heuristic when AST is absent
  const langConf = LANGUAGE_CONFIGS[language.toLowerCase()] || {
    lineComment: ['//', '#'],
    blockCommentStart: '/*',
    blockCommentEnd: '*/',
  };

  let codeLines = 0;
  let commentLines = 0;
  let inBlockComment = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue; // skip blank line

    if (inBlockComment) {
      commentLines++;
      if (langConf.blockCommentEnd && line.includes(langConf.blockCommentEnd)) {
        inBlockComment = false;
        // Check if there is code after block comment closes
        const afterBlock = line.substring(line.indexOf(langConf.blockCommentEnd) + langConf.blockCommentEnd.length).trim();
        if (afterBlock.length > 0) {
          codeLines++;
        }
      }
      continue;
    }

    if (langConf.blockCommentStart && line.startsWith(langConf.blockCommentStart)) {
      commentLines++;
      if (!langConf.blockCommentEnd || !line.includes(langConf.blockCommentEnd)) {
        inBlockComment = true;
      }
      continue;
    }

    const hasLineCommentStart = langConf.lineComment.some((prefix) => line.startsWith(prefix));
    if (hasLineCommentStart) {
      commentLines++;
      continue;
    }

    // Line starts with code
    codeLines++;

    // Check for trailing inline comments without matching protocol URLs like "http://" or strings
    if (langConf.lineComment.length > 0) {
      let isInsideString = false;
      let quoteChar = '';
      let foundInlineComment = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if ((char === '"' || char === "'" || char === '`') && (j === 0 || line[j - 1] !== '\\')) {
          if (!isInsideString) {
            isInsideString = true;
            quoteChar = char;
          } else if (quoteChar === char) {
            isInsideString = false;
          }
        }

        if (!isInsideString) {
          if (line.slice(j, j + 2) === '//' && (j === 0 || line[j - 1] !== ':')) {
            foundInlineComment = true;
            break;
          }
          if (char === '#' && language !== 'css') {
            foundInlineComment = true;
            break;
          }
        }
      }

      if (foundInlineComment) {
        commentLines++;
      }
    }
  }

  return { lineCount, codeLines, commentLines };
}

/**
 * Traverses AST iteratively with an explicit stack to collect structural complexity metrics,
 * preventing stack overflows and eliminating nested function line double-counting.
 */
export function collectAstMetrics(ast: ASTNode): {
  functionCount: number;
  classCount: number;
  totalFunctionLines: number;
  cyclomaticComplexity: number;
} {
  let functionCount = 0;
  let classCount = 0;
  let cyclomaticComplexity = 1; // Base complexity

  // Track unique function line intervals to avoid double-counting lines in nested functions
  const coveredFunctionLines = new Set<number>();

  const stack: ASTNode[] = [ast];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (FUNCTION_NODES.has(node.type)) {
      functionCount++;
      for (let r = node.startPoint.row; r <= node.endPoint.row; r++) {
        coveredFunctionLines.add(r);
      }
    }

    if (CLASS_NODES.has(node.type)) {
      classCount++;
    }

    // Branch nodes
    if (BRANCH_NODES.has(node.type)) {
      // Exclude 'default' inside case_clause/switch
      const isDefaultCase = node.type === 'case_clause' && node.text?.trim().startsWith('default');
      if (!isDefaultCase) {
        cyclomaticComplexity++;
      }
    } else if (node.type === 'binary_expression') {
      // Check operator directly from children instead of inspecting entire substring
      const operatorNode = node.children?.find(
        (c) => c.field === 'operator' || LOGICAL_OPERATORS.has(c.text?.trim() || '') || LOGICAL_OPERATORS.has(c.type)
      );

      if (operatorNode) {
        const opText = (operatorNode.text || operatorNode.type).trim();
        if (LOGICAL_OPERATORS.has(opText)) {
          cyclomaticComplexity++;
        }
      }
    }

    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }

  const totalFunctionLines = coveredFunctionLines.size;

  return {
    functionCount,
    classCount,
    totalFunctionLines,
    cyclomaticComplexity,
  };
}

/**
 * Calculates code complexity metrics for a given source string and optional AST.
 */
export function calculateComplexity(
  source: string,
  ast?: ASTNode | null,
  language: string = 'python'
): CodeComplexity {
  const { lineCount, codeLines, commentLines } = countLines(source, ast, language);
  const { functionCount, classCount, totalFunctionLines, cyclomaticComplexity } = ast
    ? collectAstMetrics(ast)
    : { functionCount: 0, classCount: 0, totalFunctionLines: 0, cyclomaticComplexity: 1 };

  const avgFunctionLines = functionCount > 0 ? round(totalFunctionLines / functionCount, 1) : 0;
  const commentRatio = lineCount > 0 ? round(commentLines / lineCount, 3) : 0;

  return {
    lineCount,
    codeLines,
    commentLines,
    commentRatio,
    functionCount,
    classCount,
    avgFunctionLines,
    cyclomaticComplexity,
    line_count: lineCount,
    code_lines: codeLines,
    empty_lines: Math.max(0, lineCount - codeLines - commentLines),
    comment_lines: commentLines,
    comment_ratio: commentRatio,
    function_count: functionCount,
    class_count: classCount,
    avg_function_lines: avgFunctionLines,
    cyclomatic_complexity: cyclomaticComplexity,
    language,
  };
}
