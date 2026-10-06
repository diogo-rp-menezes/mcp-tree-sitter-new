export interface ASTPosition {
  row: number;
  column: number;
}

export interface SyntaxDiagnostic {
  type: string;
  message?: string;
  isMissing: boolean;
  startPosition: ASTPosition;
  endPosition: ASTPosition;
  startByte: number;
  endByte: number;
  text?: string;
}

export interface ASTNode {
  id?: string;
  type: string;
  isNamed?: boolean;
  field?: string;
  startPoint: ASTPosition;
  endPoint: ASTPosition;
  startByte: number;
  endByte: number;
  text?: string;
  children: ASTNode[];
  hasError?: boolean;
  errors?: SyntaxDiagnostic[];
}

export interface SymbolItem {
  name: string;
  type: string;
  signature?: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  parent?: string;
}

export interface CodeComplexity {
  lineCount: number;
  codeLines: number;
  commentLines: number;
  commentRatio: number;
  functionCount: number;
  classCount: number;
  avgFunctionLines: number;
  cyclomaticComplexity: number;
}

export interface QueryCapture {
  capture: string;
  text: string;
  nodeType: string;
  startPoint: ASTPosition;
  endPoint: ASTPosition;
}

export interface QueryMatch {
  patternIndex: number;
  captures: QueryCapture[];
  matchedText?: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
  description?: string;
  fileCount: number;
}

export interface ProjectOverview {
  name: string;
  path: string;
  description?: string;
  fileCount: number;
  totalLines: number;
  totalBytes: number;
  languages: Array<{ language: string; count: number; percentage: number }>;
  lastModified: string;
  totalFunctions: number;
  totalClasses: number;
  isIsolated: boolean;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  relativeDate: string;
  date: string;
  message: string;
}

export interface GitRepoStatus {
  isGitRepo: boolean;
  branch: string | null;
  uncommittedCount: number;
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  lastCommit: GitCommitInfo | null;
  remoteUrl: string | null;
  statusText: string;
  repoPath: string;
}

export interface PresetSnippet {
  name: string;
  language: string;
  filename: string;
  code: string;
}

export const PRESET_SNIPPETS: PresetSnippet[] = [
  {
    name: 'Python — TreeSitter Analyzer',
    language: 'python',
    filename: 'analyzer.py',
    code: `import os
from typing import List, Dict, Any, Optional

class TreeSitterAnalyzer:
    """Core code analysis module utilizing tree-sitter AST nodes."""

    def __init__(self, language: str, max_depth: int = 5):
        self.language = language
        self.max_depth = max_depth
        self.cache = {}

    def extract_definitions(self, node: Dict[str, Any]) -> List[str]:
        """Extract function and class identifiers from AST."""
        definitions = []
        for child in node.get("children", []):
            if child.get("type") in ("function_definition", "class_definition"):
                definitions.append(child.get("name", "anonymous"))
        return definitions

    def calculate_health_score(self, complexity: int, loc: int) -> float:
        """Estimate code maintainability based on cyclomatic metrics."""
        if loc == 0:
            return 100.0
        ratio = complexity / (loc / 10.0)
        return max(0.0, min(100.0, 100.0 - (ratio * 10.0)))

def summarize_project(project_name: str, symbol_count: int) -> str:
    """Format an overview message for the MCP client."""
    return f"Project '{project_name}' contains {symbol_count} parsed symbols."
`,
  },
  {
    name: 'TypeScript — MCP Client',
    language: 'typescript',
    filename: 'client.ts',
    code: `import { useState, useCallback } from 'react';

export interface ASTNodeSnapshot {
  id: string;
  type: string;
  startByte: number;
  endByte: number;
  text?: string;
}

export class TreeSitterService {
  private endpoint: string;

  constructor(endpoint: string = '/api/mcp') {
    this.endpoint = endpoint;
  }

  async invokeTool<T = any>(toolName: string, args: Record<string, any>): Promise<T> {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(\`MCP invocation failed: \${response.statusText}\`);
    }

    const data = await response.json();
    return data.result;
  }
}

export function useCodeInspector(initialSnippet: string) {
  const [code, setCode] = useState<string>(initialSnippet);
  const [selectedNode, setSelectedNode] = useState<ASTNodeSnapshot | null>(null);

  const resetSelection = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return { code, setCode, selectedNode, setSelectedNode, resetSelection };
}
`,
  },
  {
    name: 'Go — AST Worker',
    language: 'go',
    filename: 'walker.go',
    code: `package main

import (
	"context"
	"fmt"
	"sync"
)

type WalkerConfig struct {
	MaxDepth int
	Verbose  bool
}

type ASTWalker struct {
	mu     sync.RWMutex
	nodes  []string
	config WalkerConfig
}

func NewASTWalker(cfg WalkerConfig) *ASTWalker {
	return &ASTWalker{
		config: cfg,
		nodes:  make([]string, 0),
	}
}

func (w *ASTWalker) Visit(ctx context.Context, nodeType string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		w.nodes = append(w.nodes, nodeType)
		fmt.Printf("Parsed AST node: %s\\n", nodeType)
		return nil
	}
}

func main() {
	cfg := WalkerConfig{MaxDepth: 8, Verbose: true}
	walker := NewASTWalker(cfg)
	ctx := context.Background()
	_ = walker.Visit(ctx, "source_file")
}
`,
  },
  {
    name: 'Rust — S-Expr Query Matcher',
    language: 'rust',
    filename: 'matcher.rs',
    code: `use std::collections::HashMap;

pub struct QueryMatcher {
    pattern: String,
    captures: HashMap<String, usize>,
}

impl QueryMatcher {
    pub fn new(pattern: &str) -> Self {
        QueryMatcher {
            pattern: pattern.to_string(),
            captures: HashMap::new(),
        }
    }

    pub fn matches(&mut self, node_type: &str) -> bool {
        if node_type == self.pattern {
            *self.captures.entry(node_type.to_string()).or_insert(0) += 1;
            true
        } else {
            false
        }
    }

    pub fn total_captures(&self) -> usize {
        self.captures.values().sum()
    }
}

pub fn analyze_syntax_tree(root_type: &str) -> Result<usize, String> {
    let mut matcher = QueryMatcher::new("function_item");
    if matcher.matches(root_type) {
        Ok(matcher.total_captures())
    } else {
        Err("No matching function found".to_string())
    }
}
`,
  },
];
