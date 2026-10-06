import React, { useState, useMemo } from 'react';
import {
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  Search,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Download,
  FileJson,
  Sparkles,
  ExternalLink,
  BarChart2,
  GitBranch,
  Grid,
  ListTree,
} from 'lucide-react';
import { ASTNode } from '../types';
import { ASTD3Chart } from './ASTD3Chart';
import { ASTD3Visualizer, VisualizerMode } from './ASTD3Visualizer';

interface ASTExplorerViewProps {
  ast: ASTNode | null;
  selectedNode: ASTNode | null;
  maxDepth: number;
  filename?: string;
  activeProject?: string;
  language?: string;
  onChangeMaxDepth: (depth: number) => void;
  onSelectNode: (node: ASTNode) => void;
  onToast?: (msg: string) => void;
}

// Helper to count all nodes recursively in the AST
function countNodes(node: ASTNode | null): number {
  if (!node) return 0;
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

export function ASTExplorerView({
  ast,
  selectedNode,
  maxDepth,
  filename = 'source.py',
  activeProject = 'active-project',
  language = 'python',
  onChangeMaxDepth,
  onSelectNode,
  onToast,
}: ASTExplorerViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedNode, setCopiedNode] = useState(false);
  const [forceExpand, setForceExpand] = useState<boolean | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showD3Chart, setShowD3Chart] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<VisualizerMode | 'list'>('tree');

  const totalASTNodes = useMemo(() => countNodes(ast), [ast]);

  const handleSelectNodeTypeFromChart = (type: string) => {
    if (selectedTypeFilter === type) {
      setSelectedTypeFilter(null);
      setSearchTerm('');
    } else {
      setSelectedTypeFilter(type);
      setSearchTerm(type);
    }
  };

  // Export Full AST as JSON file
  const handleExportFullAST = () => {
    if (!ast) return;
    setExporting(true);

    try {
      const cleanName = filename.split('/').pop() || 'source.py';
      const sanitizedFilename = cleanName.replace(/[^a-zA-Z0-9._-]/g, '_');

      const exportData = {
        $schema: 'https://tree-sitter.github.io/schema/ast.json',
        generator: 'Tree-sitter MCP Server v0.7.0',
        exportedAt: new Date().toISOString(),
        metadata: {
          project: activeProject,
          file: filename,
          language: language,
          totalNodes: totalASTNodes,
          maxDepthRendered: maxDepth,
        },
        ast,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFilename}.ast.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (onToast) {
        onToast(`AST exportada com sucesso: ${sanitizedFilename}.ast.json`);
      }
    } catch (err) {
      console.error('Failed to export AST', err);
    } finally {
      setTimeout(() => setExporting(false), 500);
    }
  };

  // Export Selected Node as JSON file
  const handleExportNodeJSON = () => {
    if (!selectedNode) return;

    try {
      const cleanName = filename.split('/').pop() || 'source.py';
      const sanitizedFilename = cleanName.replace(/[^a-zA-Z0-9._-]/g, '_');

      const exportData = {
        $schema: 'https://tree-sitter.github.io/schema/ast-node.json',
        generator: 'Tree-sitter MCP Server v0.7.0',
        exportedAt: new Date().toISOString(),
        metadata: {
          project: activeProject,
          file: filename,
          nodeType: selectedNode.type,
          nodeField: selectedNode.field,
          totalChildren: selectedNode.children?.length || 0,
        },
        node: selectedNode,
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizedFilename}.${selectedNode.type}.ast.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (onToast) {
        onToast(`Nó [${selectedNode.type}] exportado com sucesso!`);
      }
    } catch (err) {
      console.error('Failed to export node', err);
    }
  };

  const handleCopyNodeJSON = () => {
    if (!selectedNode) return;
    navigator.clipboard.writeText(JSON.stringify(selectedNode, null, 2));
    setCopiedNode(true);
    setTimeout(() => setCopiedNode(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden">
      {/* View Header with Controls */}
      <div className="h-10 px-3 border-b border-slate-800 bg-[#11192e] flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200">Árvore Sintática (AST)</span>
            {ast && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-cyan-300 font-mono hidden sm:inline">
                {totalASTNodes} nós
              </span>
            )}
          </div>

          {/* View Mode Segmented Controls */}
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'tree'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Grafo Hierárquico Interativo com nós e links SVG pelo D3.js"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grafo D3</span>
            </button>

            <button
              onClick={() => setViewMode('treemap')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'treemap'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Treemap Retangular D3.js ponderado por extensão de código"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Treemap D3</span>
            </button>

            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'list'
                  ? 'bg-slate-800 text-cyan-300 border border-slate-600 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Visualização em Lista Indentada"
            >
              <ListTree className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search filter in AST */}
          <div className="relative w-36 sm:w-44">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar nó..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded pl-7 pr-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Depth control */}
          <div className="flex items-center gap-1 text-slate-400 text-xs">
            <span className="hidden md:inline">Nível:</span>
            <select
              value={maxDepth}
              onChange={(e) => {
                onChangeMaxDepth(Number(e.target.value));
                setForceExpand(null);
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value={2}>2 (Topo)</option>
              <option value={3}>3 (Médio)</option>
              <option value={5}>5 (Padrão)</option>
              <option value={8}>8 (Profundo)</option>
              <option value={15}>15 (Completo)</option>
            </select>
          </div>

          {/* Expand / Collapse buttons for list mode */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setForceExpand(true)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
                title="Expandir todos os nós"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setForceExpand(false)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
                title="Recolher nós"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* D3 Distribution Chart Toggle Button */}
          <button
            onClick={() => setShowD3Chart(!showD3Chart)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border shadow-xs ${
              showD3Chart
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Alternar gráfico de distribuição de tipos de nós com D3"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Estatísticas</span>
          </button>

          {/* EXPORT AST JSON BUTTON */}
          <button
            onClick={handleExportFullAST}
            disabled={!ast || exporting}
            className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 shadow-xs"
            title={`Exportar AST completa de '${filename}' como arquivo .json`}
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Exportar AST (.json)</span>
          </button>
        </div>
      </div>

      {/* D3 Node Distribution Chart Panel */}
      {showD3Chart && ast && (
        <ASTD3Chart
          ast={ast}
          selectedType={selectedTypeFilter}
          onSelectNodeType={handleSelectNodeTypeFromChart}
          onClose={() => setShowD3Chart(false)}
        />
      )}

      {/* Main Split: Visualizer/Tree + Node Detail */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Interactive AST Visualizer or Tree List */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {ast ? (
            viewMode === 'list' ? (
              <div className="flex-1 overflow-auto p-3 font-mono text-xs">
                <TreeNode
                  node={ast}
                  depth={0}
                  maxDepth={maxDepth}
                  forceExpand={forceExpand}
                  searchTerm={searchTerm}
                  selectedNode={selectedNode}
                  onSelectNode={onSelectNode}
                />
              </div>
            ) : (
              <ASTD3Visualizer
                ast={ast}
                selectedNode={selectedNode}
                maxDepth={maxDepth}
                searchTerm={searchTerm}
                mode={viewMode}
                onSelectNode={onSelectNode}
                onModeChange={(newMode) => setViewMode(newMode)}
              />
            )
          ) : (
            <div className="text-slate-500 italic p-6 text-center">
              Nenhuma árvore sintática disponível para este código.
            </div>
          )}
        </div>

        {/* Right Side: Selected Node Details Inspector */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-slate-800 bg-[#0d1322] p-4 flex flex-col overflow-y-auto shrink-0 text-xs">
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>Propriedades do Nó</span>
              </div>

              {selectedNode && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleExportNodeJSON}
                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded border border-slate-850 transition"
                    title="Baixar nó selecionado como JSON"
                  >
                    <Download className="w-3 h-3" />
                  </button>

                  <button
                    onClick={handleCopyNodeJSON}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px] flex items-center gap-1 transition"
                  >
                    {copiedNode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedNode ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              )}
            </div>

            {selectedNode ? (
              <div className="space-y-2.5">
                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px] mb-0.5">Tipo do Nó Tree-sitter</div>
                  <div className="font-mono text-cyan-300 font-semibold text-sm">{selectedNode.type}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {selectedNode.isNamed ? 'Nó Nomeado (Sintático)' : 'Nó Anônimo (Token Literário)'}
                  </div>
                </div>

                {selectedNode.field && (
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[11px] mb-0.5">Nome do Campo (Field)</div>
                    <div className="font-mono text-amber-300 font-medium">{selectedNode.field}</div>
                  </div>
                )}

                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px] mb-0.5">Posição no Código</div>
                  <div className="font-mono text-slate-200 text-xs">
                    Linha {selectedNode.startPoint.row + 1}, Coluna {selectedNode.startPoint.column}
                    {' → '}
                    Linha {selectedNode.endPoint.row + 1}, Coluna {selectedNode.endPoint.column}
                  </div>
                </div>

                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                  <div className="text-slate-400 text-[11px] mb-0.5">Intervalo em Bytes</div>
                  <div className="font-mono text-slate-300 text-xs">
                    Byte {selectedNode.startByte} até {selectedNode.endByte} (
                    {selectedNode.endByte - selectedNode.startByte} bytes)
                  </div>
                </div>

                {selectedNode.text && (
                  <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[11px] mb-1">Conteúdo do Trecho</div>
                    <pre className="font-mono text-[11px] bg-slate-950 p-2 rounded overflow-x-auto text-emerald-300 whitespace-pre-wrap max-h-44 border border-slate-850">
                      {selectedNode.text}
                    </pre>
                  </div>
                )}

                <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Nós Filhos Diretos</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {selectedNode.children?.length || 0}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 italic p-4 text-center border border-dashed border-slate-800 rounded-lg">
                Selecione qualquer nó na árvore à esquerda para inspecionar os detalhes e coordenadas exatas.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 text-center">
            Clique no nó para destacar a linha no editor de código.
          </div>
        </div>
      </div>
    </div>
  );
}

// Recursive Tree Node with Highlight and Collapsing
function TreeNode({
  node,
  depth,
  maxDepth,
  forceExpand,
  searchTerm,
  selectedNode,
  onSelectNode,
}: {
  node: ASTNode;
  depth: number;
  maxDepth: number;
  forceExpand: boolean | null;
  searchTerm: string;
  selectedNode: ASTNode | null;
  onSelectNode: (node: ASTNode) => void;
}) {
  const isSelected = selectedNode?.id === node.id;
  const hasChildren = node.children && node.children.length > 0;

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (forceExpand !== null) return !forceExpand;
    return depth >= maxDepth;
  });

  React.useEffect(() => {
    if (forceExpand !== null) {
      setCollapsed(!forceExpand);
    }
  }, [forceExpand]);

  // Check if matches search
  const isSearchMatch =
    searchTerm.length > 0 &&
    (node.type.toLowerCase().includes(searchTerm) ||
      (node.field && node.field.toLowerCase().includes(searchTerm)) ||
      (node.text && node.text.toLowerCase().includes(searchTerm)));

  // Color coding by node category
  let badgeColor = 'text-cyan-400 bg-cyan-950/40 border-cyan-800/40';
  if (node.type.includes('definition') || node.type.includes('declaration')) {
    badgeColor = 'text-blue-400 bg-blue-950/40 border-blue-800/40';
  } else if (node.type.includes('statement') || node.type === 'block') {
    badgeColor = 'text-purple-400 bg-purple-950/40 border-purple-800/40';
  } else if (node.type.includes('identifier')) {
    badgeColor = 'text-amber-400 bg-amber-950/40 border-amber-800/40';
  } else if (node.type.includes('comment')) {
    badgeColor = 'text-slate-400 bg-slate-900 border-slate-800';
  }

  return (
    <div className="pl-3 border-l border-slate-800/70 my-0.5 font-mono text-xs">
      <div
        onClick={() => onSelectNode(node)}
        className={`flex items-center gap-1.5 py-0.5 px-2 rounded-md cursor-pointer transition select-none ${
          isSelected
            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50 shadow-sm'
            : isSearchMatch
            ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
            : 'hover:bg-slate-800/60 text-slate-300'
        }`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="p-0.5 hover:text-white text-slate-500 transition"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}

        {/* Node type pill */}
        <span
          className={`font-semibold px-1.5 py-0.2 rounded border text-[11px] ${badgeColor}`}
        >
          {node.type}
        </span>

        {/* Field name if present */}
        {node.field && (
          <span className="text-amber-300 text-[11px]">
            {node.field}:
          </span>
        )}

        {/* Node text preview if leaf/identifier */}
        {node.text && node.children.length === 0 && (
          <span className="text-emerald-300 text-[11px] truncate max-w-xs opacity-90">
            "{node.text}"
          </span>
        )}

        {/* Line Coordinates */}
        <span className="text-slate-600 text-[10px] ml-auto">
          [{node.startPoint.row + 1}:{node.startPoint.column}]
        </span>
      </div>

      {hasChildren && !collapsed && (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              forceExpand={forceExpand}
              searchTerm={searchTerm}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
