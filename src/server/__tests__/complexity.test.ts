import { describe, it, expect } from 'vitest';
import {
  calculateComplexity,
  countLines,
  collectAstMetrics,
  round,
} from '../complexity';
import { parseSourceToAST } from '../parser';
import { ASTNode } from '../types';

describe('Code Complexity Calculator', () => {
  it('calculates lines, comments, and cyclomatic complexity', () => {
    const code = `# Header comment
def process(x):
    # Check threshold
    if x > 10:
        return True
    elif x < 0:
        return False
    return None
`;
    const ast = parseSourceToAST(code, 'python');
    const metrics = calculateComplexity(code, ast, 'python');

    expect(metrics.lineCount).toBe(9);
    expect(metrics.commentLines).toBe(2);
    expect(metrics.codeLines).toBe(6);
    expect(metrics.cyclomaticComplexity).toBeGreaterThanOrEqual(3);
  });

  it('measures complexity for simple functions with base score 1', () => {
    const code = `def simple():\n    return 42\n`;
    const ast = parseSourceToAST(code, 'python');
    const metrics = calculateComplexity(code, ast, 'python');

    expect(metrics.cyclomaticComplexity).toBe(1);
    expect(metrics.functionCount).toBe(1);
  });

  it('excludes string literals and protocol URLs from comment counts', () => {
    const code = `url = "https://google.com"\nmsg = "This is a # hashtag inside a string"\n`;
    const ast = parseSourceToAST(code, 'python');
    const metrics = calculateComplexity(code, ast, 'python');

    expect(metrics.commentLines).toBe(0);
    expect(metrics.codeLines).toBe(2);
  });

  it('correctly counts multiline block comments without asterisks in text fallback mode', () => {
    const code = `/*\nprimeira linha sem asterisco\nsegunda linha sem asterisco\n*/\nconst x = 10;\n`;
    const metrics = countLines(code, null, 'javascript');

    expect(metrics.commentLines).toBe(4);
    expect(metrics.codeLines).toBe(1);
    expect(metrics.lineCount).toBe(6);
  });

  it('handles CRLF line breaks correctly', () => {
    const code = `const a = 1;\r\nconst b = 2;\r\n// comment\r\n`;
    const metrics = countLines(code, null, 'javascript');

    expect(metrics.codeLines).toBe(2);
    expect(metrics.commentLines).toBe(1);
  });

  it('handles logical operators in binary expressions accurately', () => {
    const mockAst: ASTNode = {
      id: 'root',
      type: 'program',
      isNamed: true,
      startPoint: { row: 0, column: 0 },
      endPoint: { row: 2, column: 0 },
      startByte: 0,
      endByte: 30,
      children: [
        {
          id: 'n1',
          type: 'if_statement',
          isNamed: true,
          startPoint: { row: 0, column: 0 },
          endPoint: { row: 1, column: 15 },
          startByte: 0,
          endByte: 15,
          children: [
            {
              id: 'n2',
              type: 'binary_expression',
              isNamed: true,
              startPoint: { row: 0, column: 4 },
              endPoint: { row: 0, column: 14 },
              startByte: 4,
              endByte: 14,
              children: [
                {
                  id: 'op1',
                  type: '&&',
                  text: '&&',
                  isNamed: false,
                  field: 'operator',
                  startPoint: { row: 0, column: 7 },
                  endPoint: { row: 0, column: 9 },
                  startByte: 7,
                  endByte: 9,
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const metrics = collectAstMetrics(mockAst);
    // Base 1 + if_statement (1) + && (1) = 3
    expect(metrics.cyclomaticComplexity).toBe(3);
  });

  it('excludes default clause from cyclomatic complexity score', () => {
    const mockAst: ASTNode = {
      id: 'root',
      type: 'program',
      isNamed: true,
      startPoint: { row: 0, column: 0 },
      endPoint: { row: 5, column: 0 },
      startByte: 0,
      endByte: 50,
      children: [
        {
          id: 'case1',
          type: 'case_clause',
          text: 'case 1: break;',
          isNamed: true,
          startPoint: { row: 1, column: 2 },
          endPoint: { row: 1, column: 16 },
          startByte: 10,
          endByte: 24,
          children: [],
        },
        {
          id: 'caseDefault',
          type: 'case_clause',
          text: 'default: break;',
          isNamed: true,
          startPoint: { row: 2, column: 2 },
          endPoint: { row: 2, column: 17 },
          startByte: 25,
          endByte: 40,
          children: [],
        },
      ],
    };

    const metrics = collectAstMetrics(mockAst);
    // Base 1 + case 1 (1) = 2 (default is ignored)
    expect(metrics.cyclomaticComplexity).toBe(2);
  });

  it('avoids double-counting lines in nested functions', () => {
    const outerAndInner: ASTNode = {
      id: 'fn_outer',
      type: 'function_definition',
      isNamed: true,
      startPoint: { row: 0, column: 0 },
      endPoint: { row: 6, column: 0 },
      startByte: 0,
      endByte: 80,
      children: [
        {
          id: 'fn_inner',
          type: 'function_definition',
          isNamed: true,
          startPoint: { row: 2, column: 4 },
          endPoint: { row: 4, column: 15 },
          startByte: 20,
          endByte: 50,
          children: [],
        },
      ],
    };

    const metrics = collectAstMetrics(outerAndInner);
    expect(metrics.functionCount).toBe(2);
    // Rows 0, 1, 2, 3, 4, 5, 6 = 7 unique lines, not 7 + 3 = 10
    expect(metrics.totalFunctionLines).toBe(7);
  });

  it('tests the round helper', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(0.12345, 3)).toBe(0.123);
    expect(round(5.555, 1)).toBe(5.6);
  });
});
