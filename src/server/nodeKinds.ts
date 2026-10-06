// Shared Tree-sitter node categories and classifications

export const FUNCTION_NODES = new Set([
  'function_definition',
  'function_declaration',
  'method_declaration',
  'method_definition',
  'function_item',
  'arrow_function',
  'function_expression',
]);

export const CLASS_NODES = new Set([
  'class_definition',
  'class_declaration',
  'struct_item',
  'type_spec',
  'interface_declaration',
  'trait_item',
  'impl_item',
  'enum_item',
]);

export const BRANCH_NODES = new Set([
  'if_statement',
  'elif_clause',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'except_clause',
  'catch_clause',
  'case_clause',
  'conditional_expression',
  'ternary_expression',
  'boolean_operator',
  'match_arm',
]);

export const LOGICAL_OPERATORS = new Set(['&&', '||', '??', 'and', 'or']);

export const COMMENT_NODES = new Set([
  'comment',
  'line_comment',
  'block_comment',
  'comment_statement',
]);
