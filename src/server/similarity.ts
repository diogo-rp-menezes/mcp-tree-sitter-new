import { ASTNode, SimilarityResult } from './types';
import { parseSourceToAST } from './parser';

/**
 * Extracts normalized AST structure fingerprint tokens.
 * Normalizes identifier names to '$VAR' or '$TYPE' for Type-2 clone detection.
 */
export function getASTFingerprint(node: ASTNode, maxDepth = 6, normalize = true): string[] {
  const tokens: string[] = [];

  function collect(n: ASTNode, depth: number) {
    if (depth > maxDepth) return;

    if (normalize && (n.type === 'identifier' || n.type === 'variable_name')) {
      tokens.push('id:$VAR');
    } else if (normalize && (n.type === 'type_identifier' || n.type === 'type_spec')) {
      tokens.push('type:$TYPE');
    } else {
      tokens.push(n.type);
    }

    for (const c of n.children) {
      collect(c, depth + 1);
    }
  }

  collect(node, 0);
  return tokens;
}

export function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0.0;
}

export function findSimilarCodeBlocks(
  targetSnippet: string,
  targetLanguage: string,
  candidateFiles: Array<{ path: string; content: string; language: string }>,
  threshold = 0.5,
  maxResults = 10
): SimilarityResult[] {
  const targetAST = parseSourceToAST(targetSnippet, targetLanguage);
  const targetTokens = getASTFingerprint(targetAST);
  const targetSet = new Set(targetTokens);

  const results: SimilarityResult[] = [];
  const seenMatches = new Set<string>();

  for (const file of candidateFiles) {
    const fileAST = parseSourceToAST(file.content, file.language);

    // Test blocks (e.g. function, class, or composite statement blocks)
    function inspect(node: ASTNode) {
      const isBlock =
        node.type === 'function_definition' ||
        node.type === 'function_declaration' ||
        node.type === 'method_declaration' ||
        node.type === 'function_item' ||
        node.type === 'class_definition' ||
        node.type === 'class_declaration' ||
        node.type === 'struct_item' ||
        node.type === 'block' ||
        node.type === 'statement_block';

      if (isBlock) {
        const candidateTokens = getASTFingerprint(node);
        const candidateSet = new Set(candidateTokens);
        const score = computeJaccardSimilarity(targetSet, candidateSet);

        const matchKey = `${file.path}:${node.startPoint.row}-${node.endPoint.row}`;

        if (score >= threshold && !seenMatches.has(matchKey)) {
          seenMatches.add(matchKey);
          results.push({
            filePath: file.path,
            score: Math.round(score * 100) / 100,
            matchedSnippet: node.text?.slice(0, 300) || '',
            lineStart: node.startPoint.row,
            lineEnd: node.endPoint.row,
          });
        }
      }

      for (const child of node.children) {
        inspect(child);
      }
    }

    inspect(fileAST);
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}
