import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  FileCode,
  Folder,
  FolderOpen,
  Plus,
  Github,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Terminal,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { NavTab } from './Sidebar';
import { ProjectInfo, SymbolItem, ASTNode } from '../types';
import { DiagnosticsPanel } from './DiagnosticsPanel';

interface VSCodePrimarySideBarProps {
  activeTab: NavTab;
  projects: ProjectInfo[];
  activeProject: string;
  projectFiles: string[];
  activeFile: string;
  language: string;
  ast?: ASTNode | null;
  symbols?: Record<string, SymbolItem[]>;
  templates?: Record<string, Record<string, string>>;
  mcpTools?: any[];
  onSelectProject: (proj: string) => void;
  onSelectFile: (file: string) => void;
  onSelectTab: (tab: NavTab) => void;
  onRefreshProjects: () => void;
  onOpenProjectManager: () => void;
  onOpenNewProjectModal?: () => void;
  onOpenGitHubModal?: () => void;
  onOpenScanModal?: () => void;
  onJumpToLine?: (line: number) => void;
  onSelectNode?: (node: any) => void;
}

interface FileTreeNode {
  name: string;
  path: string; // Full relative path
  isDirectory: boolean;
  children: FileTreeNode[];
  extension?: string;
}

// Convert a flat list of file paths into a nested tree structure
function buildFileTree(filePaths: string[]): FileTreeNode[] {
  const rootNodes: FileTreeNode[] = [];

  for (const filePath of filePaths) {
    const parts = filePath.split('/');
    let currentLevel = rootNodes;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
      const isFile = i === parts.length - 1;

      let existingNode = currentLevel.find((n) => n.name === part);

      if (!existingNode) {
        existingNode = {
          name: part,
          path: accumulatedPath,
          isDirectory: !isFile,
          children: [],
          extension: isFile ? part.split('.').pop()?.toLowerCase() : undefined,
        };
        currentLevel.push(existingNode);
      }

      currentLevel = existingNode.children;
    }
  }

  // Sort nodes: directories first, then alphabetical
  function sortNodes(nodes: FileTreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    }
  }

  sortNodes(rootNodes);
  return rootNodes;
}

export function VSCodePrimarySideBar({
  activeTab,
  projects,
  activeProject,
  projectFiles,
  activeFile,
  language,
  ast,
  symbols = {},
  templates = {},
  mcpTools = [],
  onSelectProject,
  onSelectFile,
  onSelectTab,
  onRefreshProjects,
  onOpenProjectManager,
  onOpenNewProjectModal,
  onOpenGitHubModal,
  onOpenScanModal,
  onJumpToLine,
  onSelectNode,
}: VSCodePrimarySideBarProps) {
  const [fileFilter, setFileFilter] = useState('');
  const [isExplorerExpanded, setIsExplorerExpanded] = useState(true);
  const [isDiagnosticsSectionExpanded, setIsDiagnosticsSectionExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const filteredFiles = useMemo(() => {
    return projectFiles.filter((f) =>
      f.toLowerCase().includes(fileFilter.toLowerCase())
    );
  }, [projectFiles, fileFilter]);

  const fileTree = useMemo(() => {
    return buildFileTree(filteredFiles);
  }, [filteredFiles]);

  const currentProject = projects.find((p) => p.name === activeProject);

  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: prev[folderPath] !== undefined ? !prev[folderPath] : false, // Default: expanded (true)
    }));
  };

  const isFolderExpanded = (folderPath: string) => {
    return expandedFolders[folderPath] !== false; // Expanded by default
  };

  function getFileIcon(filename: string) {
    if (filename.endsWith('.py')) return <span className="text-amber-400 font-bold text-[10px]">PY</span>;
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return <span className="text-cyan-400 font-bold text-[10px]">TS</span>;
    if (filename.endsWith('.go')) return <span className="text-sky-400 font-bold text-[10px]">GO</span>;
    if (filename.endsWith('.rs')) return <span className="text-orange-400 font-bold text-[10px]">RS</span>;
    if (filename.endsWith('.json')) return <span className="text-emerald-400 font-bold text-[10px]">{}</span>;
    if (filename.endsWith('.sql')) return <span className="text-purple-400 font-bold text-[10px]">SQL</span>;
    return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
  }

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: FileTreeNode, depth = 0) => {
    if (node.isDirectory) {
      const expanded = isFolderExpanded(node.path);

      return (
        <div key={node.path} className="select-none">
          <div
            onClick={(e) => toggleFolder(node.path, e)}
            style={{ paddingLeft: `${depth * 8 + 4}px` }}
            className="flex items-center gap-1.5 py-1 px-1 rounded-sm hover:bg-[#2a2d2e] text-slate-300 hover:text-slate-100 text-[11px] cursor-pointer group transition"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            )}
            <span className="font-mono font-medium truncate">{node.name}</span>
          </div>

          {expanded && (
            <div className="relative border-l border-[#333] ml-2 mt-0.5">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const isActive = activeFile === node.path;

    return (
      <button
        key={node.path}
        onClick={() => {
          onSelectFile(node.path);
        }}
        style={{ paddingLeft: `${depth * 8 + 4}px` }}
        className={`w-full text-left py-1 px-1 rounded-sm text-[11px] flex items-center justify-between transition group font-mono ${
          isActive
            ? 'bg-[#04395e] text-white font-medium'
            : 'text-slate-300 hover:bg-[#2a2d2e] hover:text-slate-100'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {getFileIcon(node.name)}
          <span className="truncate">{node.name}</span>
        </div>
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mr-1" />
        )}
      </button>
    );
  };

  return (
    <aside className="w-60 bg-[#252526] border-r border-[#2b2b2b] flex flex-col justify-between shrink-0 select-none text-xs font-sans">
      {/* Top Sidebar Header */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
        {/* Section Header */}
        <div className="h-9 px-3 border-b border-[#2b2b2b] flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-[#1f1f1f] shrink-0">
          <span className="truncate">
            {activeTab === 'diagnostics' && 'Diagnósticos & Sintaxe'}
            {activeTab === 'database' && 'SQLite Database Tables'}
            {activeTab === 'mcp' && 'Ferramentas MCP Registradas'}
            {activeTab !== 'diagnostics' && activeTab !== 'database' && activeTab !== 'mcp' && 'Explorer / Workspace'}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={onRefreshProjects}
              className="p-1 hover:bg-[#333] hover:text-slate-200 text-slate-400 rounded transition"
              title="Atualizar lista de projetos e arquivos"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Dynamic Sidebar Content according to activeTab */}
        {activeTab === 'diagnostics' ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <DiagnosticsPanel
              ast={ast}
              activeFile={activeFile}
              filename={activeFile}
              language={language}
              onJumpToLine={onJumpToLine}
              onSelectNode={onSelectNode}
            />
          </div>
        ) : activeTab !== 'database' && activeTab !== 'mcp' ? (
          <div className="p-2 space-y-3">
            {/* Project Switcher Selector */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium px-1">
                <span>Projeto Ativo:</span>
                <button
                  onClick={onOpenProjectManager}
                  className="text-cyan-400 hover:underline hover:text-cyan-300"
                >
                  Dashboard ({projects.length})
                </button>
              </div>

              <select
                value={activeProject}
                onChange={(e) => onSelectProject(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono truncate"
              >
                {projects.length === 0 ? (
                  <option value="">Nenhum projeto registrado</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>

              {currentProject && (
                <div className="px-1 text-[10px] text-slate-500 font-mono truncate" title={currentProject.path}>
                  {currentProject.path}
                </div>
              )}
            </div>

            {/* Quick Action CTAs */}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {onOpenNewProjectModal && (
                <button
                  onClick={onOpenNewProjectModal}
                  className="px-2 py-1 bg-[#2d2d2d] hover:bg-[#373737] border border-[#3c3c3c] text-slate-200 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition"
                  title="Criar novo projeto"
                >
                  <Plus className="w-3 h-3 text-cyan-400" />
                  <span>Novo</span>
                </button>
              )}
              {onOpenGitHubModal && (
                <button
                  onClick={onOpenGitHubModal}
                  className="px-2 py-1 bg-[#2d2d2d] hover:bg-[#373737] border border-[#3c3c3c] text-slate-200 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition"
                  title="Importar do GitHub"
                >
                  <Github className="w-3 h-3 text-purple-400" />
                  <span>GitHub</span>
                </button>
              )}
            </div>

            {/* File Filter Input */}
            <div className="relative pt-1">
              <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2.5" />
              <input
                type="text"
                placeholder="Filtrar arquivos..."
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded pl-7 pr-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Project File Tree Section */}
            <div className="pt-2">
              <button
                onClick={() => setIsExplorerExpanded(!isExplorerExpanded)}
                className="w-full flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white pb-1"
              >
                {isExplorerExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="truncate font-mono uppercase text-[10px]">
                  {activeProject ? activeProject : 'SEM PROJETO'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono ml-auto">
                  ({filteredFiles.length})
                </span>
              </button>

              {isExplorerExpanded && (
                <div className="pl-1 space-y-0.5 mt-1 border-l border-[#333] ml-1.5">
                  {fileTree.length === 0 ? (
                    <div className="py-2 text-[11px] text-slate-500 italic px-2">
                      {activeProject ? 'Nenhum arquivo encontrado' : 'Crie ou importe um projeto'}
                    </div>
                  ) : (
                    fileTree.map((node) => renderTreeNode(node, 0))
                  )}
                </div>
              )}
            </div>

            {/* Quick Diagnostics in Explorer view */}
            <div className="pt-2 border-t border-[#333] mt-2">
              <button
                onClick={() => setIsDiagnosticsSectionExpanded(!isDiagnosticsSectionExpanded)}
                className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-white pb-1"
              >
                {isDiagnosticsSectionExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <span className="truncate font-mono uppercase text-[10px]">
                  Problemas de Sintaxe
                </span>
                {ast?.hasError ? (
                  <span className="text-[10px] text-red-400 font-mono ml-auto bg-red-950/80 px-1.5 py-0.2 rounded border border-red-800/60 font-semibold shrink-0">
                    {ast?.errors?.length || 1} erro(s)
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-mono ml-auto bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800/60 font-semibold shrink-0">
                    0 erros
                  </span>
                )}
              </button>

              {isDiagnosticsSectionExpanded && (
                <div className="mt-1 border border-[#333] rounded overflow-hidden max-h-72 flex flex-col">
                  <DiagnosticsPanel
                    ast={ast}
                    activeFile={activeFile}
                    filename={activeFile}
                    language={language}
                    className="max-h-72"
                    onJumpToLine={onJumpToLine}
                    onSelectNode={onSelectNode}
                  />
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'database' ? (
          <div className="p-3 space-y-3">
            <div className="text-[11px] text-slate-400 space-y-2">
              <div className="p-2 bg-[#1e1e1e] border border-[#3c3c3c] rounded text-[11px] font-mono space-y-1">
                <div className="text-slate-300 font-semibold">SQLite Storage Engine</div>
                <div className="text-slate-500">Database: workspace.db</div>
                <div className="text-emerald-400 text-[10px]">✓ WAL Mode Active</div>
              </div>

              <div className="font-semibold text-slate-300 uppercase text-[10px] tracking-wider pt-2">
                Tabelas Relacionais:
              </div>
              <div className="space-y-1">
                <div className="p-2 bg-[#1e1e1e] hover:bg-[#2a2d2e] border border-[#333] rounded flex items-center justify-between font-mono text-[11px]">
                  <span className="text-cyan-300">projects</span>
                  <span className="text-slate-500">{projects.length} registros</span>
                </div>
                <div className="p-2 bg-[#1e1e1e] hover:bg-[#2a2d2e] border border-[#333] rounded flex items-center justify-between font-mono text-[11px]">
                  <span className="text-cyan-300">files</span>
                  <span className="text-slate-500">{projectFiles.length} arquivos</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <div className="text-[11px] text-slate-400 space-y-2">
              <div className="p-2 bg-[#1e1e1e] border border-[#3c3c3c] rounded text-[11px] font-mono space-y-1">
                <div className="text-slate-300 font-semibold">Console & Ferramentas</div>
                <div className="text-slate-500">Protocolo: MCP JSON-RPC 2.0</div>
                <div className="text-cyan-400 text-[10px]">✓ Standalone Server Ready</div>
              </div>

              <div className="font-semibold text-slate-300 uppercase text-[10px] tracking-wider pt-2">
                Ferramentas Disponíveis:
              </div>
              <div className="space-y-1">
                {['get_ast', 'run_query', 'extract_symbols', 'get_complexity', 'find_similar'].map((tool) => (
                  <div key={tool} className="p-2 bg-[#1e1e1e] border border-[#333] rounded font-mono text-[11px] text-cyan-300">
                    {tool}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Footer: Quick Info */}
      <div className="p-2 border-t border-[#2b2b2b] bg-[#1f1f1f] text-[10px] text-slate-500 flex items-center justify-between font-mono">
        <span>Tree-sitter 0.24</span>
        <span className="text-emerald-400">✓ Isolated</span>
      </div>
    </aside>
  );
}
