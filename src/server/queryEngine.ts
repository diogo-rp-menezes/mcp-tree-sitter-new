/**
 * AST/Tree-sitter Query Engine
 * Supports official web-tree-sitter native queries as well as predicate/negated field AST evaluation
 */

import Parser from 'web-tree-sitter';
import { ASTNode, QueryCapture, QueryMatch } from './types';
import { treeCache } from './treeCache';
import { QueryError, errorMessage } from './errors';

export type PredicateType = 'eq' | 'not-eq' | 'match' | 'not-match' | 'any-of';

export interface QueryPredicate {
  type: PredicateType;
  capture: string;
  value?: string;
  values?: string[];
  otherCapture?: string;
  regex?: RegExp;
}

export interface QueryPattern {
  targetNodeType: string;
  field?: string;
  negatedFields: string[];
  quantifier: '+' | '*' | '?' | '1';
  captureName?: string;
  childPatterns: QueryPattern[];
  predicates: QueryPredicate[];
  isImmediateChild?: boolean;
}

export interface QueryOptions {
  captureFilter?: string;
  maxResults?: number;
  timeoutMs?: number;
}

/**
 * Parses S-expression query string into structured query patterns.
 */
export function parseSExpressionQuery(queryString: string): QueryPattern[] {
  const patterns: QueryPattern[] = [];

  const cleaned = queryString
    .split('\n')
    .map((line) => line.replace(/;.*$/, ''))
    .join(' ')
    .trim();

  if (!cleaned) return [];

  let working = cleaned;
  if (working.startsWith('[') && working.endsWith(']')) {
    working = working.slice(1, -1).trim();
  }

  const tokens: string[] = [];
  let idx = 0;
  while (idx < working.length) {
    const ch = working[idx];
    if (/\s/.test(ch)) {
      idx++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '[' || ch === ']' || ch === '.') {
      tokens.push(ch);
      idx++;
      continue;
    }
    if (ch === '"') {
      let str = '';
      idx++;
      while (idx < working.length && working[idx] !== '"') {
        if (working[idx] === '\\' && idx + 1 < working.length) {
          str += working[idx + 1];
          idx += 2;
        } else {
          str += working[idx];
          idx++;
        }
      }
      idx++;
      tokens.push(`"${str}"`);
      continue;
    }

    let word = '';
    while (idx < working.length && !/\s|[()[\]"]/.test(working[idx])) {
      word += working[idx];
      idx++;
    }
    if (word) tokens.push(word);
  }

  let tIdx = 0;

  function parsePattern(): QueryPattern | null {
    if (tIdx >= tokens.length || tokens[tIdx] !== '(') return null;
    tIdx++; // consume '('

    let field: string | undefined;
    const negatedFields: string[] = [];
    let isImmediate = false;

    if (tokens[tIdx] === '.') {
      isImmediate = true;
      tIdx++;
    }

    if (tIdx < tokens.length && tokens[tIdx]?.endsWith(':')) {
      field = tokens[tIdx].slice(0, -1);
      tIdx++;
    }

    while (tIdx < tokens.length && tokens[tIdx]?.startsWith('!')) {
      negatedFields.push(tokens[tIdx].slice(1));
      tIdx++;
    }

    if (tIdx >= tokens.length || tokens[tIdx] === ')') {
      if (tokens[tIdx] === ')') tIdx++;
      return null;
    }

    const targetNodeType = tokens[tIdx++];
    let captureName: string | undefined;
    let quantifier: '+' | '*' | '?' | '1' = '1';
    const childPatterns: QueryPattern[] = [];
    const predicates: QueryPredicate[] = [];

    while (tIdx < tokens.length && tokens[tIdx] !== ')') {
      const tok = tokens[tIdx];

      if (tok === '(') {
        if (tokens[tIdx + 1]?.startsWith('#')) {
          tIdx++; // consume '('
          const predTok = tokens[tIdx++];
          const predType = predTok.slice(1).replace('?', '') as PredicateType;
          const capTok = tokens[tIdx++];
          const capture = capTok.startsWith('@') ? capTok.slice(1) : capTok;

          const args: string[] = [];
          while (tIdx < tokens.length && tokens[tIdx] !== ')') {
            const raw = tokens[tIdx++];
            args.push(raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw);
          }
          if (tokens[tIdx] === ')') tIdx++;

          if (predType === 'eq' || predType === 'not-eq') {
            if (args[0]?.startsWith('@')) {
              predicates.push({
                type: predType,
                capture,
                otherCapture: args[0].slice(1),
              });
            } else {
              predicates.push({
                type: predType,
                capture,
                value: args[0],
              });
            }
          } else if (predType === 'match' || predType === 'not-match') {
            try {
              predicates.push({
                type: predType,
                capture,
                regex: new RegExp(args[0] || ''),
              });
            } catch {
              // Ignore invalid regex in query
            }
          } else if (predType === 'any-of') {
            predicates.push({
              type: 'any-of',
              capture,
              values: args,
            });
          }
        } else {
          const child = parsePattern();
          if (child) childPatterns.push(child);
        }
      } else if (tok.startsWith('@')) {
        captureName = tok.slice(1);
        tIdx++;
      } else if (tok === '+' || tok === '*' || tok === '?') {
        quantifier = tok;
        tIdx++;
      } else {
        tIdx++;
      }
    }

    if (tIdx < tokens.length && tokens[tIdx] === ')') {
      tIdx++; // consume ')'
    }

    if (tIdx < tokens.length && tokens[tIdx]?.startsWith('@') && !captureName) {
      captureName = tokens[tIdx++].slice(1);
    }
    if (tIdx < tokens.length && (tokens[tIdx] === '+' || tokens[tIdx] === '*' || tokens[tIdx] === '?')) {
      quantifier = tokens[tIdx++] as any;
    }

    return {
      targetNodeType,
      field,
      negatedFields,
      quantifier,
      captureName,
      childPatterns,
      predicates,
      isImmediateChild: isImmediate,
    };
  }

  while (tIdx < tokens.length) {
    const pat = parsePattern();
    if (pat) patterns.push(pat);
    else tIdx++;
  }

  return patterns;
}

/**
 * Matches an ASTNode against parsed QueryPatterns with full predicate support.
 */
export function executeQuery(
  ast: ASTNode,
  queryString: string,
  options?: QueryOptions
): QueryMatch[] {
  const patterns = parseSExpressionQuery(queryString);
  if (patterns.length === 0) return [];

  const maxResults = options?.maxResults ?? 100;
  const captureFilter = options?.captureFilter;
  const matches: QueryMatch[] = [];

  function matchInSubtree(node: ASTNode, pat: QueryPattern, capturesMap: Map<string, QueryCapture>): boolean {
    if (pat.targetNodeType !== '_' && node.type !== pat.targetNodeType) {
      return false;
    }
    if (pat.field && node.field !== pat.field) {
      return false;
    }
    if (pat.negatedFields.length > 0) {
      for (const neg of pat.negatedFields) {
        if (node.children.some((c) => c.field === neg)) {
          return false;
        }
      }
    }

    if (pat.captureName) {
      capturesMap.set(pat.captureName, {
        capture: pat.captureName,
        text: node.text || '',
        nodeType: node.type,
        node_type: node.type,
        startPoint: node.startPoint,
        endPoint: node.endPoint,
        location: { start: node.startPoint, end: node.endPoint },
      });
    }

    function findMatchInDirectOrContainers(parent: ASTNode, cPat: QueryPattern): boolean {
      for (const childNode of parent.children) {
        if (matchInSubtree(childNode, cPat, capturesMap)) {
          return true;
        }
        if (
          !cPat.isImmediateChild &&
          (childNode.type === 'block' ||
            childNode.type === 'statement_block' ||
            childNode.type === 'class_body' ||
            childNode.type === 'declaration_list' ||
            childNode.type === 'field_declaration_list')
        ) {
          if (findMatchInDirectOrContainers(childNode, cPat)) {
            return true;
          }
        }
      }
      return false;
    }

    for (const childPat of pat.childPatterns) {
      const childMatched = findMatchInDirectOrContainers(node, childPat);
      if (!childMatched && childPat.quantifier !== '?' && childPat.quantifier !== '*') {
        return false;
      }
    }

    // Evaluate predicates
    for (const pred of pat.predicates) {
      const cap = capturesMap.get(pred.capture);
      if (!cap) return false;

      if (pred.type === 'eq') {
        if (pred.otherCapture) {
          const other = capturesMap.get(pred.otherCapture);
          if (!other || cap.text !== other.text) return false;
        } else if (cap.text !== pred.value) {
          return false;
        }
      }
      if (pred.type === 'not-eq') {
        if (pred.otherCapture) {
          const other = capturesMap.get(pred.otherCapture);
          if (other && cap.text === other.text) return false;
        } else if (cap.text === pred.value) {
          return false;
        }
      }
      if (pred.type === 'match' && pred.regex && !pred.regex.test(cap.text)) return false;
      if (pred.type === 'not-match' && pred.regex && pred.regex.test(cap.text)) return false;
      if (pred.type === 'any-of' && pred.values && !pred.values.includes(cap.text)) return false;
    }

    return true;
  }

  function search(node: ASTNode) {
    if (matches.length >= maxResults) return;

    for (let pIdx = 0; pIdx < patterns.length; pIdx++) {
      const pat = patterns[pIdx];
      const capturesMap = new Map<string, QueryCapture>();

      if (matchInSubtree(node, pat, capturesMap)) {
        let capturesList = Array.from(capturesMap.values());
        if (captureFilter) {
          capturesList = capturesList.filter((c) => c.capture === captureFilter);
        }

        if (capturesList.length > 0) {
          matches.push({
            patternIndex: pIdx,
            captures: capturesList,
            matchedText: node.text,
            capture: capturesList[0]?.capture,
            text: capturesList[0]?.text,
            location: capturesList[0]?.location,
            node_type: capturesList[0]?.nodeType,
          });
        }
      }
    }

    for (const child of node.children) {
      search(child);
    }
  }

  search(ast);
  return matches;
}

/**
 * Native S-expression query execution on web-tree-sitter Tree.
 */
export function executeNativeQuery(
  tree: Parser.Tree,
  tsLanguage: Parser.Language,
  queryString: string,
  options?: QueryOptions
): QueryMatch[] {
  const maxResults = options?.maxResults ?? 100;
  const captureFilter = options?.captureFilter;

  let query: Parser.Query;
  try {
    query = tsLanguage.query(queryString);
  } catch (err) {
    throw new QueryError(errorMessage(err) || 'Invalid tree-sitter query pattern', {
      query: queryString,
    });
  }

  const results: QueryMatch[] = [];

  try {
    const rawMatches = query.matches(tree.rootNode);

    for (let i = 0; i < rawMatches.length; i++) {
      if (results.length >= maxResults) break;

      const m = rawMatches[i];
      const captures: QueryCapture[] = [];

      for (const cap of m.captures) {
        if (captureFilter && cap.name !== captureFilter) {
          continue;
        }

        const node = cap.node;
        captures.push({
          capture: cap.name,
          text: node.text,
          nodeType: node.type,
          node_type: node.type,
          startPoint: {
            row: node.startPosition.row,
            column: node.startPosition.column,
          },
          endPoint: {
            row: node.endPosition.row,
            column: node.endPosition.column,
          },
          startByte: node.startIndex,
          endByte: node.endIndex,
          start_byte: node.startIndex,
          end_byte: node.endIndex,
          location: {
            start: { row: node.startPosition.row, column: node.startPosition.column },
            end: { row: node.endPosition.row, column: node.endPosition.column },
          },
        });
      }

      if (captures.length > 0) {
        const matchedText = captures[0]?.text || '';
        results.push({
          patternIndex: m.pattern,
          captures,
          matchedText,
          capture: captures[0]?.capture,
          text: matchedText,
          location: captures[0]?.location,
          node_type: captures[0]?.nodeType,
        });
      }
    }
  } finally {
    query.delete();
  }

  return results;
}

/**
 * Builds a valid tree-sitter S-expression query for identifiers supported by the language.
 */
export function getIdentifierQueryForLanguage(tsLanguage: Parser.Language): string {
  const candidateIdentifierTypes = [
    'identifier',
    'property_identifier',
    'private_property_identifier',
    'shorthand_property_identifier',
    'shorthand_property_identifier_pattern',
    'type_identifier',
    'field_identifier',
    'package_identifier',
    'statement_identifier',
    'variable_name',
  ];

  const languageTypes: string[] = (tsLanguage as any).types || [];
  const presentTypes = candidateIdentifierTypes.filter((type) => {
    return languageTypes.includes(type);
  });

  if (presentTypes.length === 0) {
    return '(identifier) @ref';
  }

  if (presentTypes.length === 1) {
    return `(${presentTypes[0]}) @ref`;
  }

  return `[\n${presentTypes.map((t) => `  (${t})`).join('\n')}\n] @ref`;
}

/**
 * Executes a query directly on source code using cached or fresh WebAssembly Tree.
 */
export async function executeQueryOnSource(
  source: string,
  language: string,
  queryString: string,
  options?: QueryOptions
): Promise<QueryMatch[]> {
  const parsed = await treeCache.getOrParseTree(source, language);
  return executeNativeQuery(parsed.tree, parsed.tsLanguage, queryString, options);
}
