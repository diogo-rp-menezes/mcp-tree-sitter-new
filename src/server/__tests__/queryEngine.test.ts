import { describe, it, expect } from 'vitest';
import { parseSourceToAST } from '../parser';
import { executeQuery, parseSExpressionQuery } from '../queryEngine';
import { handleMCPToolCall, MCP_TOOLS_METADATA } from '../mcp';
import { projectStore } from '../store';

describe('Advanced S-Expression Query Engine', () => {
  it('matches nodes with regex #match? and set membership #any-of? predicates', () => {
    const code = `
def get_user_data():
    pass

def post_order():
    pass

def delete_record():
    pass
`;
    const ast = parseSourceToAST(code, 'python');

    // #match? query for handlers starting with get_ or post_
    const matchQuery = `(function_definition name: (identifier) @fn (#match? @fn "^(get_|post_)"))`;
    const matchResults = executeQuery(ast, matchQuery);
    expect(matchResults.length).toBe(2);
    expect(matchResults.some((m) => m.captures.some((c) => c.text === 'get_user_data'))).toBe(true);
    expect(matchResults.some((m) => m.captures.some((c) => c.text === 'post_order'))).toBe(true);

    // #any-of? query
    const anyOfQuery = `(function_definition name: (identifier) @fn (#any-of? @fn "get_user_data" "delete_record"))`;
    const anyOfResults = executeQuery(ast, anyOfQuery);
    expect(anyOfResults.length).toBe(2);
    expect(anyOfResults.some((m) => m.captures.some((c) => c.text === 'delete_record'))).toBe(true);

    // #not-match? query
    const notMatchQuery = `(function_definition name: (identifier) @fn (#not-match? @fn "^(get_|post_)"))`;
    const notMatchResults = executeQuery(ast, notMatchQuery);
    expect(notMatchResults.length).toBe(1);
    expect(notMatchResults[0].captures[0].text).toBe('delete_record');
  });

  it('supports negated fields (!field)', () => {
    const code = `def empty_func():\n    pass\n`;
    const ast = parseSourceToAST(code, 'python');

    // Negated field !non_existent
    const query = `(function_definition !non_existent_field name: (identifier) @name)`;
    const results = executeQuery(ast, query);
    expect(results.length).toBe(1);
    expect(results[0].captures[0].text).toBe('empty_func');
  });

  it('evaluates quantifiers and capture comparisons', () => {
    const code = `
class Handler:
    def execute():
        pass
`;
    const ast = parseSourceToAST(code, 'python');

    // Sub-pattern with quantifier '+'
    const quantQuery = `(class_definition (function_definition)+ @method)`;
    const quantResults = executeQuery(ast, quantQuery);
    expect(quantResults.length).toBe(1);

    // Comparison between captures: #not-eq? @c1 @c2
    const cmpQuery = `(class_definition name: (identifier) @c1 (function_definition name: (identifier) @c2) (#not-eq? @c1 @c2))`;
    const cmpResults = executeQuery(ast, cmpQuery);
    expect(cmpResults.length).toBe(1);
  });
});

describe('MCP Protocol Extensions', () => {
  it('declares register_project_tool and cache tools in MCP_TOOLS_METADATA', () => {
    const names = MCP_TOOLS_METADATA.map((t) => t.name);
    expect(names).toContain('register_project_tool');
    expect(names).toContain('get_node_types');
    expect(names).toContain('clear_cache');
    expect(names).toContain('configure');
  });

  it('clears AST cache and updates runtime configuration', async () => {
    const clearRes = await handleMCPToolCall('clear_cache', {});
    expect(clearRes.status).toBe('success');

    const configRes = await handleMCPToolCall('configure', {
      cache_enabled: true,
      max_file_size_mb: 25,
      log_level: 'DEBUG',
    });
    expect(configRes.security.max_file_size_mb).toBe(25);
    expect(configRes.log_level).toBe('DEBUG');
  });
});
