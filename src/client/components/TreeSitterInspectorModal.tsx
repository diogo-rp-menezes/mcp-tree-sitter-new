import React, { useEffect } from 'react';
import {
  X,
  Layers,
  Search,
  FileCode,
  BarChart3,
  GitCompare,
  Code2,
  AlertTriangle,
} from 'lucide-react';
import { NavTab } from './Sidebar';
import { ASTNode, QueryMatch, SymbolItem, CodeComplexity } from '../types';

import { ASTExplorerView } from './ASTExplorerView';
import { QueryStudioView } from './QueryStudioView';
import { SymbolsView } from './SymbolsView';
import { ComplexityView } from './ComplexityView';
import { SimilarityView } from './SimilarityView';
import { DiagnosticsPanel } from './DiagnosticsPanel';

interface TreeSitterInspectorModalProps {
  isOpen: boolean;
  activeTool: NavTab | null;
  filename: string;
  language: string;
  activeProject: string;
  code: string;
  ast: ASTNode | null;
  selectedNode: ASTNode | null;
  maxAstDepth: number;
  queryInput: string;
  queryMatches: QueryMatch[];
  templates: Record<string, Record<string, string>>;
  selectedTemplate: string;
  symbols: Record<string, SymbolItem[]>;
  complexity: CodeComplexity | null;
  similaritySnippet: string;
  similarityResults: any[];
  similarityThreshold: number;
  loading: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSelectTool: (tool: NavTab) => void;
  onChangeMaxDepth: (depth: number) => void;
  onSelectNode: (node: ASTNode | null) => void;
  onChangeQuery: (query: string) => void;
  onSelectTemplate: (template: string) => void;
  onRunQuery: () => void;
  onJumpToLine: (line: number) => void;
  onChangeSimilaritySnippet: (snippet: string) => void;
  onChangeSimilarityThreshold: (threshold: number) => void;
  onRunSimilarity: () => void;
  onToast: (msg: string) => void;
}

export function TreeSitterInspectorModal({
  isOpen,
  activeTool,
  filename,
  language,
  activeProject,
  code,
  ast,
  selectedNode,
  maxAstDepth,
  queryInput,
  queryMatches,
  templates,
  selectedTemplate,
  symbols,
  complexity,
  similaritySnippet,
  similarityResults,
  similarityThreshold,
  loading,
  errorMsg,
  onClose,
  onSelectTool,
  onChangeMaxDepth,
  onSelectNode,
  onChangeQuery,
  onSelectTemplate,
  onRunQuery,
  onJumpToLine,
  onChangeSimilaritySnippet,
  onChangeSimilarityThreshold,
  onRunSimilarity,
  onToast,
}: TreeSitterInspectorModalProps) {
  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !activeTool) return null;

  const toolTabs = [
    { id: 'ast' as NavTab, label: 'Árvore AST', icon: Layers },
    { id: 'diagnostics' as NavTab, label: 'Diagnósticos', icon: AlertTriangle },
    { id: 'query' as NavTab, label: 'Query Studio', icon: Search },
    { id: 'symbols' as NavTab, label: 'Símbolos', icon: FileCode },
    { id: 'complexity' as NavTab, label: 'Complexidade', icon: BarChart3 },
    { id: 'similarity' as NavTab, label: 'Similaridade', icon: GitCompare },
  ];

  const totalSymbolsCount = Object.values(symbols || {}).reduce((acc, list) => acc + (list?.length || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Dialog Card */}
      <div className="relative bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden text-slate-100 z-10 font-sans">
        {/* Modal Top Header */}
        <div className="h-12 px-4 bg-[#252526] border-b border-[#2b2b2b] flex items-center justify-between shrink-0">
          {/* Header Title & File Context */}
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-cyan-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100">Inspetor Tree-sitter</span>
                {filename && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[#1b1b1b] border border-[#333] text-cyan-300 font-mono">
                    {filename}
                  </span>
                )}
                {language && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1e1e1e] border border-[#3c3c3c] text-slate-400 uppercase font-mono">
                    {language}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Modal Internal Tool Selection Tabs */}
          <div className="hidden md:flex items-center gap-1 bg-[#181818] p-1 rounded-lg border border-[#2d2d2d]">
            {toolTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTool === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTool(tab.id)}
                  className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                    isActive
                      ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#252526]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                  <span>{tab.label}</span>
                  {tab.id === 'symbols' && totalSymbolsCount > 0 && (
                    <span className="text-[9px] bg-cyan-900/80 text-cyan-200 px-1.5 rounded font-mono">
                      {totalSymbolsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Close Modal Button */}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-[#333] rounded-lg transition"
            title="Fechar Inspetor (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Tool Selector */}
        <div className="md:hidden flex items-center gap-1 p-2 bg-[#181818] border-b border-[#2b2b2b] overflow-x-auto">
          {toolTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTool === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTool(tab.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 shrink-0 ${
                  isActive ? 'bg-cyan-600 text-white' : 'bg-[#252526] text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Main Content View Container */}
        <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
          {activeTool === 'ast' && (
            <ASTExplorerView
              ast={ast}
              selectedNode={selectedNode}
              maxDepth={maxAstDepth}
              filename={filename}
              activeProject={activeProject}
              language={language}
              onChangeMaxDepth={onChangeMaxDepth}
              onSelectNode={onSelectNode}
              onToast={onToast}
            />
          )}

          {activeTool === 'diagnostics' && (
            <DiagnosticsPanel
              ast={ast}
              filename={filename}
              language={language}
              onJumpToLine={(line) => {
                onJumpToLine(line);
                onClose();
              }}
              onSelectNode={(node) => {
                onSelectNode(node as any);
                onClose();
              }}
            />
          )}

          {activeTool === 'query' && (
            <QueryStudioView
              language={language}
              queryInput={queryInput}
              queryMatches={queryMatches}
              templates={templates}
              selectedTemplate={selectedTemplate}
              loading={loading}
              errorMsg={errorMsg}
              onChangeQuery={onChangeQuery}
              onSelectTemplate={onSelectTemplate}
              onRunQuery={onRunQuery}
            />
          )}

          {activeTool === 'symbols' && (
            <SymbolsView symbols={symbols} onJumpToLine={onJumpToLine} />
          )}

          {activeTool === 'complexity' && <ComplexityView complexity={complexity} />}

          {activeTool === 'similarity' && (
            <SimilarityView
              similaritySnippet={similaritySnippet}
              similarityResults={similarityResults}
              similarityThreshold={similarityThreshold}
              loading={loading}
              onChangeSnippet={onChangeSimilaritySnippet}
              onChangeThreshold={onChangeSimilarityThreshold}
              onRunSimilarity={onRunSimilarity}
            />
          )}
        </div>
      </div>
    </div>
  );
}
