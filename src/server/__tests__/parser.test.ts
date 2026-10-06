import { describe, it, expect, beforeAll } from 'vitest';
import {
  detectLanguage,
  parseSourceToAST,
  parseSourceToASTAsync,
  extractSymbolsFromAST,
  findNodeAtPosition,
  findBlockEnd,
} from '../parser';
import { initTreeSitter, parseWithTreeSitter, isTreeSitterLanguageSupported } from '../treeSitter';

describe('Tree-sitter WASM Parser Engine', () => {
  beforeAll(async () => {
    await initTreeSitter();
  });

  it('detects programming languages accurately from file extensions', () => {
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('index.ts')).toBe('typescript');
    expect(detectLanguage('App.tsx')).toBe('typescript');
    expect(detectLanguage('server.js')).toBe('javascript');
    expect(detectLanguage('lib.rs')).toBe('rust');
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('unknown.xyz')).toBe('plaintext');
    expect(detectLanguage('src/v1.2/Makefile')).toBe('makefile');
  });

  it('verifies language support in tree-sitter-wasms registry', () => {
    expect(isTreeSitterLanguageSupported('python')).toBe(true);
    expect(isTreeSitterLanguageSupported('javascript')).toBe(true);
    expect(isTreeSitterLanguageSupported('typescript')).toBe(true);
    expect(isTreeSitterLanguageSupported('tsx')).toBe(true);
    expect(isTreeSitterLanguageSupported('rust')).toBe(true);
    expect(isTreeSitterLanguageSupported('go')).toBe(true);
    expect(isTreeSitterLanguageSupported('c')).toBe(true);
    expect(isTreeSitterLanguageSupported('cpp')).toBe(true);
    expect(isTreeSitterLanguageSupported('csharp')).toBe(true);
    expect(isTreeSitterLanguageSupported('ruby')).toBe(true);
    expect(isTreeSitterLanguageSupported('unknown')).toBe(false);
  });

  it('parses Python source code into authentic Tree-sitter AST nodes', async () => {
    const code = `def calculate(a, b):\n    return a + b\n\nclass Calculator:\n    pass\n`;
    const ast = await parseSourceToASTAsync(code, 'python');

    expect(ast.type).toBe('module');
    expect((ast as any).isApproximate).toBe(false);
    expect(ast.children.length).toBeGreaterThan(0);

    const funcNode = ast.children.find((c) => c.type === 'function_definition');
    expect(funcNode).toBeDefined();
    expect(funcNode?.text).toContain('def calculate');

    const nameChild = funcNode?.children.find((c) => c.field === 'name');
    expect(nameChild?.text).toBe('calculate');

    const classNode = ast.children.find((c) => c.type === 'class_definition');
    expect(classNode).toBeDefined();
    expect(classNode?.text).toContain('class Calculator');
  });

  it('correctly calculates identifier position for single letter names without capturing keyword letters', async () => {
    const code = `def e():\n    return 1\n`;
    const ast = await parseSourceToASTAsync(code, 'python');

    const funcNode = ast.children.find((c) => c.type === 'function_definition');
    const nameNode = funcNode?.children.find((c) => c.field === 'name');
    expect(nameNode).toBeDefined();
    expect(nameNode?.text).toBe('e');
    expect(nameNode?.startPoint.column).toBe(4);
    expect(nameNode?.endPoint.column).toBe(5);
  });

  it('gives real block extents to JS/TS functions and classes and extracts inner methods', async () => {
    const code = `class UserService {\n    getUser(id) {\n        if (id > 0) {\n            return { id };\n        }\n        return null;\n    }\n}`;
    const ast = await parseSourceToASTAsync(code, 'javascript');

    const classNode = ast.children.find((c) => c.type === 'class_declaration');
    expect(classNode).toBeDefined();
    expect(classNode?.startPoint.row).toBe(0);
    expect(classNode?.endPoint.row).toBe(7);

    const bodyNode = classNode?.children.find((c) => c.type === 'class_body');
    expect(bodyNode).toBeDefined();
    expect(bodyNode?.children.some((c) => c.type === 'method_definition' || c.type === 'method_declaration')).toBe(true);

    const symbols = extractSymbolsFromAST(ast, 'javascript');
    expect(symbols.classes.length).toBe(1);
    expect(symbols.classes[0].name).toBe('UserService');

    const method = symbols.functions.find((f) => f.name === 'getUser');
    expect(method).toBeDefined();
    expect(method?.type).toBe('method');
    expect(method?.parent).toBe('UserService');
  });

  it('does not treat control flow keywords as call expressions in JS/TS', async () => {
    const code = `function check(x) {\n    if (x > 10) {\n        return true;\n    }\n    while (x > 0) {\n        x--;\n    }\n    return false;\n}`;
    const ast = await parseSourceToASTAsync(code, 'javascript');

    const funcNode = ast.children.find((c) => c.type === 'function_declaration');
    const body = funcNode?.children.find((c) => c.type === 'statement_block');
    expect(body).toBeDefined();

    // Verify 'if' and 'while' are authentic control flow nodes
    expect(body?.children.some((c) => c.type === 'if_statement')).toBe(true);
    expect(body?.children.some((c) => c.type === 'while_statement')).toBe(true);
  });

  it('parses Go receiver methods and structs', async () => {
    const code = `package store\n\ntype UserStore struct {\n    db string\n}\n\nfunc (s *UserStore) GetUser(id int) string {\n    return "user"\n}\n`;
    const ast = await parseSourceToASTAsync(code, 'go');

    const structNode = ast.children.find((c) => c.type === 'type_declaration' || c.type === 'type_spec');
    expect(structNode).toBeDefined();

    const methodNode = ast.children.find((c) => c.type === 'method_declaration');
    expect(methodNode).toBeDefined();

    const symbols = extractSymbolsFromAST(ast, 'go');
    expect(symbols.classes.some((c) => c.name === 'UserStore')).toBe(true);
    expect(symbols.functions.some((f) => f.name === 'GetUser')).toBe(true);
  });

  it('parses Rust structs and functions with accurate AST nodes', async () => {
    const code = `pub struct Point {\n    x: f64,\n    y: f64,\n}\n\nfn add_points(p1: Point, p2: Point) -> Point {\n    Point { x: p1.x + p2.x, y: p1.y + p2.y }\n}\n`;
    const ast = await parseSourceToASTAsync(code, 'rust');

    expect(ast.type).toBe('source_file');
    const structNode = ast.children.find((c) => c.type === 'struct_item');
    expect(structNode).toBeDefined();

    const funcNode = ast.children.find((c) => c.type === 'function_item');
    expect(funcNode).toBeDefined();

    const symbols = extractSymbolsFromAST(ast, 'rust');
    expect(symbols.classes.some((c) => c.name === 'Point')).toBe(true);
    expect(symbols.functions.some((f) => f.name === 'add_points')).toBe(true);
  });

  it('locates specific AST node at coordinates', async () => {
    const code = `x = 10\ndef run():\n    return x\n`;
    const ast = await parseSourceToASTAsync(code, 'python');

    const node = findNodeAtPosition(ast, 1, 4); // coordinate inside identifier "run"
    expect(node).not.toBeNull();
    expect(node?.type).toBe('identifier');
    expect(node?.text).toBe('run');
  });

  it('tests block end finder with comments and strings', () => {
    const lines = [
      'function test() {',
      '    const str = "hello { brace in string }";',
      '    // comment with } brace',
      '    /* block comment with } brace */',
      '    return 42;',
      '}',
    ];

    const end = findBlockEnd(lines, 0);
    expect(end).not.toBeNull();
    expect(end?.row).toBe(5);
    expect(end?.column).toBe(1);
  });
});
