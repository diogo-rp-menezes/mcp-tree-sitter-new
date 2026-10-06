/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 2
 * Core Data Structures with Dual-Compatibility
 */

export interface Position {
  row: number;    // 0-based line number
  column: number; // 0-based column number
}

// Alias for existing codebase compatibility
export type ASTPosition = Position;

export interface Location {
  start: Position;
  end: Position;
}

export interface SyntaxDiagnostic {
  type: string;
  message?: string;
  isMissing: boolean;
  startPosition: Position;
  endPosition: Position;
  startByte: number;
  endByte: number;
  text?: string;
}

export interface ASTNode {
  id?: string;
  type: string;
  isNamed?: boolean;
  field?: string;
  field_name?: string;
  startPoint: ASTPosition;
  endPoint: ASTPosition;
  start_point?: Position;
  end_point?: Position;
  startByte: number;
  endByte: number;
  start_byte?: number;
  end_byte?: number;
  text?: string;
  children: ASTNode[];
  depth?: number;
  isApproximate?: boolean;
  hasError?: boolean;
  errors?: SyntaxDiagnostic[];
}

export interface OutlineItem {
  name: string;
  kind: string;
  signature?: string;
  location: Location;
  startByte: number;
  endByte: number;
  children?: OutlineItem[];
}

export interface SymbolReference {
  file: string;
  name: string;
  location: Location;
  startByte: number;
  endByte: number;
  contextLine?: string;
}

export interface FunctionComplexity {
  name: string;
  signature?: string;
  location: Location;
  startLine: number;
  endLine: number;
  lineCount: number;
  cyclomaticComplexity: number;
}

export type SymbolType =
  | 'functions'
  | 'classes'
  | 'structs'
  | 'interfaces'
  | 'traits'
  | 'impls'
  | 'enums'
  | 'mixins'
  | 'namespaces'
  | 'modules'
  | 'imports'
  | 'exports'
  | 'macros'
  | 'variables'
  | 'constants'
  | 'type_aliases'
  // Legacy aliases
  | 'function'
  | 'class'
  | 'method'
  | 'import'
  | 'interface'
  | 'variable'
  | 'type';

export interface SymbolMetadata {
  signature?: string;
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  is_async?: boolean;
  is_static?: boolean;
  decorators?: string[];
  generic_params?: string[];
  parent?: string;
  docstring?: string;
}

export interface Symbol {
  name: string;
  type: SymbolType;
  location?: Location;
  startByte?: number;
  endByte?: number;
  start_byte?: number;
  end_byte?: number;
  metadata?: SymbolMetadata;
  // Legacy compatibility fields
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
  signature?: string;
  parent?: string;
  docstring?: string;
}

// Legacy symbol alias
export type SymbolItem = Symbol;

export interface QueryCapture {
  capture: string;
  text: string;
  nodeType: string;
  startPoint: ASTPosition;
  endPoint: ASTPosition;
  startByte?: number;
  endByte?: number;
  start_byte?: number;
  end_byte?: number;
  location?: Location;
  node_type?: string;
}

export interface QueryMatch {
  capture?: string;
  text?: string;
  location?: Location;
  node_type?: string;
  file?: string;
  // Legacy match fields
  patternIndex?: number;
  captures?: QueryCapture[];
  matchedText?: string;
}

export interface EntryPoint {
  path: string;
  language: string;
}

export interface BuildFile {
  path: string;
  type: string;
}

export interface FileAnalysis {
  file: string;
  symbols: Record<string, number>;
}

export interface ProjectAnalysis {
  name: string;
  path: string;
  languages: Record<string, number>;
  entry_points: EntryPoint[];
  build_files: BuildFile[];
  dir_counts: Record<string, number>;
  file_counts: Record<string, number>;
  total_files: number;
  key_files_analysis?: Record<string, FileAnalysis[]>;
}

export interface Dependencies {
  imports: string[];
  from_imports: string[];
  items: string[];
  aliases: string[];
  includes: string[];
  requires: string[];
  uses: string[];
  [category: string]: string[];
}

export interface ComplexityMetrics {
  line_count: number;
  code_lines: number;
  empty_lines: number;
  comment_lines: number;
  comment_ratio: number;
  function_count: number;
  class_count: number;
  avg_function_lines: number;
  cyclomatic_complexity: number;
  language: string;
  // Legacy compatibility aliases
  lineCount?: number;
  codeLines?: number;
  commentLines?: number;
  commentRatio?: number;
  functionCount?: number;
  classCount?: number;
  avgFunctionLines?: number;
  cyclomaticComplexity?: number;
}

// Legacy CodeComplexity alias
export type CodeComplexity = ComplexityMetrics;

export interface SimilarCodeMatch {
  file: string;
  location: Location;
  similarity: number;
  node_type: string;
  text: string;
}

// Legacy SimilarityResult compatibility
export interface SimilarityResult {
  filePath: string;
  score: number;
  matchedSnippet: string;
  lineStart: number;
  lineEnd: number;
}

export interface ContextLine {
  line: number;
  text: string;
  is_match: boolean;
}

export interface TextSearchResult {
  file: string;
  line: number;
  text: string;
  context?: ContextLine[];
}

export interface FileInfo {
  path: string;
  size: number;
  last_modified: number;
  created: number;
  is_directory: boolean;
  extension: string | null;
  line_count: number | null;
}

export interface ProjectFile {
  path: string;
  language: string;
  content: string;
  sizeBytes: number;
  lastModified: string;
}

export interface Project {
  name: string;
  path: string;
  description?: string;
  files: Map<string, ProjectFile>;
}
