import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import {
  Code2,
  Copy,
  Check,
  Save,
  Map,
  Layers,
  Search,
  FileCode,
  BarChart3,
  GitCompare,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { ASTNode, SymbolItem } from '../types';
import { NavTab } from './Sidebar';

export interface LintMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
}

interface CodeEditorProps {
  code: string;
  language: string;
  filename: string;
  ast?: ASTNode | null;
  selectedNode: ASTNode | null;
  symbols?: Record<string, SymbolItem[]>;
  isDirty?: boolean;
  activeInspector?: NavTab;
  symbolsCount?: number;
  onChangeCode: (code: string) => void;
  onCopyCode: () => void;
  onSaveCode?: () => void;
  onSelectInspector?: (tab: NavTab) => void;
  onDiagnosticsChange?: (count: number) => void;
}

// Fallback synchronous AST error node extraction
function extractASTErrorNodes(node: ASTNode | null, markers: LintMarker[], monacoSeverity: number) {
  if (!node) return;

  if (node.type === 'ERROR' || node.type.includes('ERROR')) {
    const textSnippet = node.text ? node.text.trim().slice(0, 30) : '';
    markers.push({
      startLineNumber: node.startPoint.row + 1,
      startColumn: node.startPoint.column + 1,
      endLineNumber: node.endPoint.row + 1,
      endColumn: Math.max(node.endPoint.column + 1, node.startPoint.column + 2),
      message: textSnippet
        ? `[Tree-sitter Lint] Erro de sintaxe próximo a '${textSnippet}'`
        : `[Tree-sitter Lint] Erro de sintaxe ou token não reconhecido`,
      severity: monacoSeverity,
    });
  } else if (node.type.startsWith('MISSING') || node.type === 'MISSING') {
    markers.push({
      startLineNumber: node.startPoint.row + 1,
      startColumn: node.startPoint.column + 1,
      endLineNumber: node.endPoint.row + 1,
      endColumn: node.endPoint.column + 2,
      message: `[Tree-sitter Lint] Elemento sintático ausente (${node.type})`,
      severity: monacoSeverity,
    });
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      extractASTErrorNodes(child, markers, monacoSeverity);
    }
  }
}

// Fallback synchronous generator
function generateLintMarkers(
  ast: ASTNode | null | undefined,
  code: string,
  language: string,
  monacoObj: any
): LintMarker[] {
  const markers: LintMarker[] = [];
  const errorSeverity = monacoObj?.MarkerSeverity?.Error ?? 8;
  const warningSeverity = monacoObj?.MarkerSeverity?.Warning ?? 4;

  if (ast) {
    extractASTErrorNodes(ast, markers, errorSeverity);
  }

  const lines = code.split('\n');
  lines.forEach((lineText, idx) => {
    const lineNumber = idx + 1;
    const trimmed = lineText.trim();

    if (['python', 'py'].includes(language.toLowerCase())) {
      if (
        /^(def|class|if|elif|else|for|while|try|except|finally|with)\b/.test(trimmed) &&
        !trimmed.endsWith(':') &&
        !trimmed.endsWith('\\') &&
        !trimmed.includes('#')
      ) {
        if (!markers.some((m) => m.startLineNumber === lineNumber)) {
          markers.push({
            startLineNumber: lineNumber,
            startColumn: Math.max(1, lineText.indexOf(trimmed) + 1),
            endLineNumber: lineNumber,
            endColumn: lineText.length + 1,
            message: `[Linter Python] Dois-pontos ':' ausente no final da instrução '${trimmed.split(' ')[0]}'`,
            severity: warningSeverity,
          });
        }
      }
    }

    if (['json'].includes(language.toLowerCase())) {
      if (trimmed.endsWith(',') && idx === lines.length - 1) {
        markers.push({
          startLineNumber: lineNumber,
          startColumn: Math.max(1, lineText.lastIndexOf(',') + 1),
          endLineNumber: lineNumber,
          endColumn: lineText.length + 1,
          message: `[Linter JSON] Vírgula sobressalente no final da estrutura JSON`,
          severity: warningSeverity,
        });
      }
    }
  });

  return markers;
}

// Map Tree-sitter language identifier to Monaco language ID
function getMonacoLanguage(lang: string): string {
  const normalized = (lang || '').toLowerCase();
  switch (normalized) {
    case 'py':
    case 'python':
      return 'python';
    case 'ts':
    case 'typescript':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'javascript':
    case 'jsx':
      return 'javascript';
    case 'go':
    case 'golang':
      return 'go';
    case 'rs':
    case 'rust':
      return 'rust';
    case 'java':
      return 'java';
    case 'c':
    case 'cpp':
    case 'c++':
      return 'cpp';
    case 'cs':
    case 'csharp':
    case 'c_sharp':
      return 'csharp';
    case 'json':
      return 'json';
    case 'sql':
      return 'sql';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    default:
      return 'python';
  }
}

export function CodeEditor({
  code,
  language,
  filename,
  ast,
  selectedNode,
  symbols,
  isDirty = false,
  activeInspector = 'ast',
  symbolsCount = 0,
  onChangeCode,
  onCopyCode,
  onSaveCode,
  onSelectInspector,
  onDiagnosticsChange,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<LintMarker[]>([]);
  const [isWorkerActive, setIsWorkerActive] = useState(false);

  useEffect(() => {
    if (onDiagnosticsChange) {
      onDiagnosticsChange(diagnostics.length);
    }
  }, [diagnostics, onDiagnosticsChange]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<number>(0);

  const monacoLanguage = useMemo(() => getMonacoLanguage(language), [language]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Web Worker Initialization: Offloads syntax validation & linting to background thread
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/linter.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (e: MessageEvent) => {
        const { id, markers } = e.data;
        if (id === requestIdRef.current) {
          setDiagnostics(markers);
          if (editorRef.current && monacoRef.current) {
            const model = editorRef.current.getModel();
            if (model) {
              monacoRef.current.editor.setModelMarkers(model, 'tree-sitter-linter', markers);
            }
          }
        }
      };

      workerRef.current = worker;
      setIsWorkerActive(true);
    } catch (err) {
      console.warn('[CodeEditor] Web Worker unavailable, using main thread fallback:', err);
      setIsWorkerActive(false);
    }

    return () => {
      if (worker) {
        worker.terminate();
      }
      workerRef.current = null;
    };
  }, []);

  // Dispatch syntax validation tasks to Web Worker background thread
  useEffect(() => {
    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;

    if (workerRef.current) {
      workerRef.current.postMessage({
        id: nextRequestId,
        ast,
        code,
        language,
      });
    } else if (editorRef.current && monacoRef.current) {
      // Fallback synchronous execution if Web Worker is disabled/unavailable
      const model = editorRef.current.getModel();
      if (model) {
        const markers = generateLintMarkers(ast, code, language, monacoRef.current);
        monacoRef.current.editor.setModelMarkers(model, 'tree-sitter-linter', markers);
        setDiagnostics(markers);
      }
    }
  }, [ast, code, language]);

  // Handle Monaco Mount
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom VS Code dark modern theme
    monaco.editor.defineTheme('vscode-dark-custom', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'function', foreground: 'DCDCAA' },
        { token: 'variable', foreground: '9CDCFE' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#D4D4D4',
        'editor.lineHighlightBackground': '#2F333D30',
        'editorCursor.foreground': '#007ACC',
        'editor.selectionBackground': '#264F78',
        'editor.inactiveSelectionBackground': '#3A3D41',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#C6C6C6',
      },
    });

    monaco.editor.setTheme('vscode-dark-custom');
  };

  // Synchronize selection highlight when selectedNode changes from AST/Symbols
  useEffect(() => {
    if (editorRef.current && selectedNode) {
      const startLine = selectedNode.startPoint.row + 1;
      const endLine = selectedNode.endPoint.row + 1;
      const startCol = selectedNode.startPoint.column + 1;
      const endCol = selectedNode.endPoint.column + 1;

      try {
        editorRef.current.revealLineInCenter(startLine);
        editorRef.current.setSelection({
          startLineNumber: startLine,
          startColumn: startCol,
          endLineNumber: endLine,
          endColumn: endCol,
        });
      } catch (err) {
        // Safe fallback
      }
    }
  }, [selectedNode]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopyCode();
    setTimeout(() => setCopied(false), 2000);
  }, [code, onCopyCode]);

  // Tree-sitter inspection tools list for dropdown
  const inspectorTools = [
    {
      id: 'ast' as NavTab,
      label: 'Árvore AST',
      desc: 'Nós sintáticos, posições e árvore hierárquica',
      icon: Layers,
    },
    {
      id: 'query' as NavTab,
      label: 'Query Studio',
      desc: 'Filtros S-Expr e buscas sintáticas em tempo real',
      icon: Search,
    },
    {
      id: 'symbols' as NavTab,
      label: 'Símbolos & Estrutura',
      desc: `Funções, classes e variáveis (${symbolsCount})`,
      icon: FileCode,
    },
    {
      id: 'complexity' as NavTab,
      label: 'Complexidade & Métricas',
      desc: 'Complexidade ciclomática e linhas de código',
      icon: BarChart3,
    },
    {
      id: 'similarity' as NavTab,
      label: 'Similaridade AST',
      desc: 'Análise de duplicidade e fingerprinting',
      icon: GitCompare,
    },
  ];

  const currentInspectorTool = inspectorTools.find((t) => t.id === activeInspector) || inspectorTools[0];
  const CurrentIcon = currentInspectorTool.icon;

  if (!filename) {
    return (
      <div className="flex flex-col h-full bg-[#1e1e1e] items-center justify-center text-slate-500 font-sans select-none p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
          <Code2 className="w-8 h-8 opacity-60" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-300">Nenhum arquivo aberto</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            Selecione um arquivo na árvore do <strong className="text-slate-400">Explorer</strong> à esquerda para abri-lo na aba e visualizar/editar seu código.
          </p>
        </div>
        <div className="pt-2 flex flex-col gap-1.5 text-[11px] font-mono text-slate-500">
          <div><kbd className="bg-[#2d2d2d] border border-[#3c3c3c] px-1.5 py-0.5 rounded text-slate-300">Ctrl + P</kbd> Buscar arquivos no projeto</div>
          <div><kbd className="bg-[#2d2d2d] border border-[#3c3c3c] px-1.5 py-0.5 rounded text-slate-300">Ctrl + S</kbd> Salvar alterações no banco SQLite</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] overflow-hidden text-slate-100 font-sans select-none">
      {/* Editor Header Toolbar - Integrates Monaco info & Tree-sitter Dropdown Menu */}
      <div className="h-9 px-3 bg-[#252526] border-b border-[#2b2b2b] flex items-center justify-between shrink-0 text-xs text-slate-300 gap-2 z-20">
        {/* Left Section: File Name, Language Badge & Tree-sitter Dropdown */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 font-mono pr-2.5 border-r border-[#383838]">
            <Code2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold text-slate-200 text-xs truncate max-w-36">
              {filename || 'codigo.py'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1e1e1e] border border-[#3c3c3c] text-cyan-300 uppercase font-mono">
              {monacoLanguage}
            </span>
            {isDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Alterações não salvas" />
            )}
          </div>

          {/* Tree-sitter Dropdown Menu in Monaco Title Bar */}
          {onSelectInspector && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="px-2.5 py-1 rounded text-[11px] font-medium bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-500/50 flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                title="Selecionar Ferramenta de Análise Tree-sitter"
              >
                <span className="text-cyan-400/80 font-mono text-[10px] uppercase tracking-wider hidden sm:inline">
                  Tree-sitter:
                </span>
                <CurrentIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-semibold text-slate-100">{currentInspectorTool.label}</span>
                <ChevronDown className={`w-3 h-3 text-cyan-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu Items Overlay */}
              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl z-50 py-1 text-slate-200">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#333] flex items-center justify-between">
                    <span>Inspetor Tree-sitter</span>
                    <span className="text-cyan-400 font-mono">0.24</span>
                  </div>

                  <div className="py-1">
                    {inspectorTools.map((tool) => {
                      const Icon = tool.icon;
                      const isSelected = activeInspector === tool.id;
                      return (
                        <button
                          key={tool.id}
                          onClick={() => {
                            onSelectInspector(tool.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-start gap-2.5 transition ${
                            isSelected
                              ? 'bg-[#04395e] text-white font-medium border-l-2 border-l-cyan-400'
                              : 'text-slate-300 hover:bg-[#2a2d2e] hover:text-slate-100'
                          }`}
                        >
                          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                          <div className="space-y-0.5 overflow-hidden">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs">{tool.label}</span>
                              {tool.id === 'symbols' && symbolsCount > 0 && (
                                <span className="text-[9px] bg-cyan-900/80 text-cyan-200 px-1.5 rounded font-mono">
                                  {symbolsCount}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate font-sans">{tool.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Minimap, Save, Copy Controls */}
        <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-[#383838]">
          {/* Toggle Minimap */}
          <button
            onClick={() => setShowMiniMap(!showMiniMap)}
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition ${
              showMiniMap
                ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/40'
                : 'bg-[#1e1e1e] text-slate-400 border border-[#3c3c3c] hover:text-slate-200'
            }`}
            title={showMiniMap ? 'Ocultar Minimapa' : 'Exibir Minimapa'}
          >
            <Map className="w-3 h-3" />
            <span className="hidden sm:inline">Minimapa</span>
          </button>

          {/* Save Code */}
          {onSaveCode && (
            <button
              onClick={onSaveCode}
              disabled={!isDirty}
              className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                isDirty
                  ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-xs'
                  : 'bg-[#1e1e1e] text-slate-500 border border-[#333] cursor-not-allowed'
              }`}
              title="Salvar alterações no SQLite (Ctrl+S)"
            >
              <Save className="w-3 h-3" />
              <span className="hidden sm:inline">Salvar</span>
            </button>
          )}

          {/* Copy Code */}
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-[#333] hover:text-white text-slate-400 rounded transition"
            title="Copiar código"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Monaco Editor Workspace */}
      <div className="flex-1 relative overflow-hidden bg-[#1e1e1e]">
        <Editor
          height="100%"
          language={monacoLanguage}
          value={code}
          onChange={(value) => onChangeCode(value || '')}
          onMount={handleEditorDidMount}
          theme="vscode-dark-custom"
          options={{
            minimap: { enabled: showMiniMap },
            fontSize: 13,
            fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, 'Courier New', monospace",
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            tabSize: 4,
            insertSpaces: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            formatOnType: true,
            formatOnPaste: true,
          }}
        />
      </div>

      {/* Monaco Editor Footer Bar with Live Tree-sitter Lint Status & Web Worker Indicator */}
      <div className="h-6 px-3 bg-[#1e1e1e] border-t border-[#2b2b2b] flex items-center justify-between text-[10px] font-mono text-slate-400 shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* Lint Diagnostics Badge */}
          {diagnostics.length === 0 ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Sintaxe Válida (0 Erros)</span>
            </span>
          ) : (
            <button
              onClick={() => {
                if (diagnostics.length > 0 && editorRef.current) {
                  editorRef.current.revealLineInCenter(diagnostics[0].startLineNumber);
                }
              }}
              className="text-amber-400 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
              title={diagnostics.map((d) => `Linha ${d.startLineNumber}: ${d.message}`).join('\n')}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400 animate-pulse" />
              <span>{diagnostics.length} {diagnostics.length === 1 ? 'Erro de Sintaxe' : 'Erros de Sintaxe'}</span>
            </button>
          )}

          <span className="text-slate-600">|</span>
          <span>Linhas: <strong className="text-slate-300">{code.split('\n').length}</strong></span>
          <span>Caracteres: <strong className="text-slate-300">{code.length}</strong></span>
        </div>

        <div className="flex items-center gap-2">
          {isWorkerActive ? (
            <span className="text-cyan-400 font-semibold flex items-center gap-1" title="Web Worker Linter ativo fora da thread UI">
              <Cpu className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span>Web Worker Linter Active</span>
            </span>
          ) : (
            <span className="text-slate-400 font-semibold">Tree-sitter Linter Active</span>
          )}
          <span>·</span>
          <span>Monaco Editor v0.52</span>
        </div>
      </div>
    </div>
  );
}
