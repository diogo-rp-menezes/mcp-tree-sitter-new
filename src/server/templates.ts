/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 4 & Appendix A
 * Query Template Catalog & Default Symbol Types
 */

import { SymbolType } from './types';

export interface LanguageTemplates {
  [templateName: string]: string;
}

/**
 * Section 4.3 - Language-Specific Default Symbol Types
 */
export const DEFAULT_SYMBOL_TYPES: Record<string, SymbolType[]> = {
  rust: ['functions', 'structs', 'imports'],
  go: ['functions', 'structs', 'imports'],
  c: ['functions', 'structs', 'imports'],
  cpp: ['functions', 'classes', 'structs', 'imports'],
  typescript: ['functions', 'classes', 'interfaces', 'imports'],
  swift: ['functions', 'classes', 'structs', 'imports'],
  java: ['functions', 'classes', 'interfaces', 'imports'],
  kotlin: ['functions', 'classes', 'interfaces', 'imports'],
  dart: ['functions', 'classes', 'mixins', 'enums', 'imports'],
  julia: ['functions', 'modules', 'structs', 'imports'],
  apl: ['functions', 'namespaces', 'variables', 'imports'],
  default: ['functions', 'classes', 'imports'],
};

export const TEMPLATES: Record<string, LanguageTemplates> = {
  python: {
    functions: `(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.def`,
    classes: `(class_definition
  name: (identifier) @class.name
  superclasses: (argument_list)? @class.supers
  body: (block) @class.body) @class.def`,
    imports: `[
  (import_statement
    name: (dotted_name) @import.module) @import
  (import_from_statement
    module_name: (dotted_name) @import.from
    name: (dotted_name) @import.item) @import
  (import_from_statement
    module_name: (dotted_name) @import.from
    name: (aliased_import
      name: (dotted_name) @import.item
      alias: (identifier) @import.alias)) @import
]`,
    function_calls: `(call
  function: (identifier) @call.function
  arguments: (argument_list) @call.args) @call`,
    calls: `(call
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call`,
    assignments: `(assignment
  left: (_) @assign.target
  right: (_) @assign.value) @assign`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  javascript: {
    functions: `[
  (function_declaration
    name: (identifier) @function.name
    parameters: (formal_parameters) @function.params
    body: (statement_block) @function.body) @function.def
  (arrow_function
    parameters: [
      (formal_parameters)
      (identifier)
    ] @function.params
    body: [
      (statement_block)
      (expression)
    ] @function.body) @function.def
  (method_definition
    name: (property_identifier) @method.name
    parameters: (formal_parameters) @method.params
    body: (statement_block) @method.body) @method.def
]`,
    classes: `(class_declaration
  name: (identifier) @class.name
  body: (class_body) @class.body) @class.def`,
    imports: `[
  (import_statement
    source: (string) @import.module
    import_clause: (import_clause) @import.clause) @import
  (call_expression
    function: (identifier) @require (#eq? @require "require")
    arguments: (arguments (string) @import.module)) @import
]`,
    exports: `(export_statement) @export`,
    function_calls: `(call_expression
  function: (_) @call.function
  arguments: (arguments) @call.args) @call`,
    calls: `(call_expression
  function: [
    (identifier) @call.name
    (member_expression property: (property_identifier) @call.method)
  ]
  arguments: (arguments) @call.args) @call`,
    assignments: `(assignment_expression
  left: (_) @assign.target
  right: (_) @assign.value) @assign`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  typescript: {
    functions: `[
  (function_declaration
    name: (identifier) @function.name
    parameters: (formal_parameters) @function.params
    body: (statement_block) @function.body) @function.def
  (arrow_function
    parameters: (formal_parameters) @function.params
    body: [
      (statement_block)
      (expression)
    ] @function.body) @function.def
  (method_definition
    name: (property_identifier) @method.name
    parameters: (formal_parameters) @method.params
    body: (statement_block) @method.body) @method.def
]`,
    classes: `(class_declaration
  name: (type_identifier) @class.name
  body: (class_body) @class.body) @class.def`,
    interfaces: `(interface_declaration
  name: (type_identifier) @interface.name
  body: (object_type) @interface.body) @interface.def`,
    type_aliases: `(type_alias_declaration
  name: (type_identifier) @type_alias.name
  value: (_) @type_alias.value) @type_alias.def`,
    imports: `(import_statement
  source: (string) @import.module
  import_clause: (import_clause) @import.clause) @import`,
    exports: `(export_statement) @export`,
    function_calls: `(call_expression
  function: (_) @call.function
  arguments: (arguments) @call.args) @call`,
    calls: `(call_expression
  function: [
    (identifier) @call.name
    (member_expression property: (property_identifier) @call.method)
  ]
  arguments: (arguments) @call.args) @call`,
    assignments: `(assignment_expression
  left: (_) @assign.target
  right: (_) @assign.value) @assign`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  rust: {
    functions: `(function_item
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.def`,
    structs: `(struct_item
  name: (type_identifier) @struct.name
  body: (field_declaration_list) @struct.body) @struct.def`,
    traits: `(trait_item
  name: (type_identifier) @trait.name
  body: (trait_body) @trait.body) @trait.def`,
    impls: `(impl_item
  type: (type_identifier) @impl.type
  body: (impl_body) @impl.body) @impl.def`,
    enums: `(enum_item
  name: (type_identifier) @enum.name
  body: (enum_variants) @enum.body) @enum.def`,
    macros: `(macro_definition
  name: (identifier) @macro.name) @macro.def`,
    imports: `(use_declaration
  argument: (use_tree) @import.path) @import`,
    exports: `(use_declaration
  (visibility_modifier) @export.vis
  argument: (use_tree) @export.path) @export`,
    function_calls: `(call_expression
  function: (_) @call.function
  arguments: (arguments) @call.args) @call`,
    calls: `(call_expression
  function: (identifier) @call.name
  arguments: (arguments) @call.args) @call`,
    assignments: `(assignment_expression
  left: (_) @assign.target
  right: (_) @assign.value) @assign`,
    comments: `(line_comment) @comment`,
    errors: `(ERROR) @error`,
  },
  go: {
    functions: `[
  (function_declaration
    name: (identifier) @function.name
    parameters: (parameter_list) @function.params
    body: (block) @function.body) @function.def
  (method_declaration
    receiver: (parameter_list) @method.receiver
    name: (field_identifier) @method.name
    parameters: (parameter_list) @method.params
    body: (block) @method.body) @method.def
]`,
    structs: `(type_spec
  name: (type_identifier) @struct.name
  type: (struct_type) @struct.body) @struct.def`,
    interfaces: `(type_spec
  name: (type_identifier) @interface.name
  type: (interface_type) @interface.body) @interface.def`,
    imports: `[
  (import_spec
    path: (interpreted_string_literal) @import.module) @import
  (import_declaration
    (import_spec_list
      (import_spec path: (interpreted_string_literal) @import.module))) @import
]`,
    function_calls: `(call_expression
  function: (_) @call.function
  arguments: (argument_list) @call.args) @call`,
    calls: `(call_expression
  function: [
    (identifier) @call.name
    (selector_expression field: (field_identifier) @call.method)
  ]
  arguments: (argument_list) @call.args) @call`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  c: {
    functions: `(function_definition
  declarator: (function_declarator
    declarator: (identifier) @function.name
    parameters: (parameter_list) @function.params)
  body: (compound_statement) @function.body) @function.def`,
    structs: `(struct_specifier
  name: (type_identifier) @struct.name) @struct.def`,
    classes: `(struct_specifier
  name: (type_identifier) @struct.name) @struct.def`,
    imports: `(preproc_include
  path: [
    (system_lib_string) @import.system
    (string_literal) @import.local
  ]) @import`,
    function_calls: `(call_expression
  function: (identifier) @call.function
  arguments: (argument_list) @call.args) @call`,
    calls: `(call_expression
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  cpp: {
    functions: `(function_definition
  declarator: (function_declarator
    declarator: [
      (identifier) @function.name
      (field_identifier) @function.name
      (qualified_identifier) @function.name
    ]
    parameters: (parameter_list) @function.params)
  body: (compound_statement) @function.body) @function.def`,
    classes: `(class_specifier
  name: (type_identifier) @class.name
  body: (field_declaration_list) @class.body) @class.def`,
    structs: `(struct_specifier
  name: (type_identifier) @struct.name
  body: (field_declaration_list) @struct.body) @struct.def`,
    namespaces: `(namespace_definition
  name: (namespace_identifier) @namespace.name
  body: (declaration_list) @namespace.body) @namespace.def`,
    imports: `(preproc_include
  path: [
    (system_lib_string) @import.system
    (string_literal) @import.local
  ]) @import`,
    function_calls: `(call_expression
  function: (_) @call.function
  arguments: (argument_list) @call.args) @call`,
    calls: `(call_expression
  function: (identifier) @call.name
  arguments: (argument_list) @call.args) @call`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  java: {
    functions: `(method_declaration
  name: (identifier) @function.name
  parameters: (formal_parameters) @function.params
  body: (block) @function.body) @function.def`,
    classes: `(class_declaration
  name: (identifier) @class.name
  body: (class_body) @class.body) @class.def`,
    interfaces: `(interface_declaration
  name: (identifier) @interface.name
  body: (interface_body) @interface.body) @interface.def`,
    enums: `(enum_declaration
  name: (identifier) @enum.name
  body: (enum_body) @enum.body) @enum.def`,
    imports: `(import_declaration
  (scoped_identifier) @import.name) @import`,
    function_calls: `(method_invocation
  name: (identifier) @call.function
  arguments: (argument_list) @call.args) @call`,
    calls: `(method_invocation
  name: (identifier) @call.name
  arguments: (argument_list) @call.args) @call`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
  csharp: {
    functions: `(method_declaration
  name: (identifier) @function.name
  parameters: (parameter_list) @function.params
  body: (block) @function.body) @function.def`,
    classes: `(class_declaration
  name: (identifier) @class.name
  body: (declaration_list) @class.body) @class.def`,
    interfaces: `(interface_declaration
  name: (identifier) @interface.name
  body: (declaration_list) @interface.body) @interface.def`,
    structs: `(struct_declaration
  name: (identifier) @struct.name
  body: (declaration_list) @struct.body) @struct.def`,
    namespaces: `(namespace_declaration
  name: (identifier) @namespace.name
  body: (declaration_list) @namespace.body) @namespace.def`,
    imports: `(using_directive
  (qualified_name) @import.name) @import`,
    function_calls: `(invocation_expression
  function: (_) @call.function
  arguments: (argument_list) @call.args) @call`,
    calls: `(invocation_expression
  function: (_) @call.name
  arguments: (argument_list) @call.args) @call`,
    comments: `(comment) @comment`,
    errors: `(ERROR) @error`,
  },
};

export const COMMON_NODE_DESCRIPTIONS: Record<string, Record<string, string>> = {
  python: {
    module: 'Root node of a Python file containing statements',
    function_definition: 'Function or method definition starting with def keyword',
    class_definition: 'Class definition starting with class keyword',
    call: 'Function or method call expression',
    identifier: 'Variable, function, or class name token',
    parameters: 'List of function parameter definitions',
    argument_list: 'List of arguments passed to a function call',
    block: 'Indented block of statements',
    import_statement: 'Import statement (e.g. import os)',
    import_from_statement: 'Import from statement (e.g. from typing import Any)',
    comment: 'Comment starting with #',
    if_statement: 'Conditional if/elif/else block',
    for_statement: 'For loop statement',
    while_statement: 'While loop statement',
    return_statement: 'Function return statement',
  },
  javascript: {
    program: 'Root node of a JavaScript file',
    function_declaration: 'Function declaration with function keyword',
    arrow_function: 'Arrow function expression (() => ...)',
    class_declaration: 'Class declaration with class keyword',
    method_definition: 'Method inside a class or object literal',
    call_expression: 'Function or method invocation',
    identifier: 'Identifier token',
    formal_parameters: 'Parameter list enclosed in parentheses',
    statement_block: 'Block of statements enclosed in braces { ... }',
    import_statement: 'ES6 import declaration',
    comment: 'Single-line or multi-line comment',
  },
  typescript: {
    program: 'Root node of a TypeScript file',
    function_declaration: 'Function declaration with optional type annotations',
    interface_declaration: 'TypeScript interface declaration',
    type_alias_declaration: 'Type alias declaration (type X = ...)',
    class_declaration: 'Class declaration',
    method_definition: 'Class or interface method',
    type_annotation: 'Type annotation (: string, : number, etc.)',
    call_expression: 'Function invocation',
    identifier: 'Identifier token',
  },
  go: {
    source_file: 'Root node of a Go source file',
    package_clause: 'Package definition header',
    import_declaration: 'Import block or single import',
    function_declaration: 'Function definition with func keyword',
    method_declaration: 'Method with receiver specification',
    type_spec: 'Type definition (struct, interface, alias)',
    call_expression: 'Function or method call',
  },
  rust: {
    source_file: 'Root node of a Rust source file',
    function_item: 'Function item defined with fn keyword',
    struct_item: 'Struct definition',
    enum_item: 'Enum definition',
    impl_item: 'Implementation block for struct or trait',
    trait_item: 'Trait definition',
    use_declaration: 'Use import statement',
    call_expression: 'Function call',
  },
  c: {
    translation_unit: 'Root node of a C translation unit',
    function_definition: 'C function definition',
    struct_specifier: 'Struct type definition',
    preproc_include: 'Preprocessor #include directive',
    call_expression: 'Function call',
  },
  cpp: {
    translation_unit: 'Root node of a C++ translation unit',
    function_definition: 'C++ function definition',
    class_specifier: 'C++ class definition',
    struct_specifier: 'C++ struct definition',
    namespace_definition: 'C++ namespace declaration',
    preproc_include: 'Preprocessor #include directive',
  },
  java: {
    program: 'Root node of a Java source file',
    method_declaration: 'Java method declaration',
    class_declaration: 'Java class declaration',
    interface_declaration: 'Java interface declaration',
    import_declaration: 'Java package import',
  },
  csharp: {
    compilation_unit: 'Root node of a C# compilation unit',
    method_declaration: 'C# method declaration',
    class_declaration: 'C# class declaration',
    interface_declaration: 'C# interface declaration',
    namespace_declaration: 'C# namespace declaration',
  },
};
