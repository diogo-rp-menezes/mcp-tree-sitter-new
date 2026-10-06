import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  ChevronRight,
  ChevronDown,
  Trash2,
  FilePlus,
  Search,
  FolderPlus,
  Minimize2,
  Maximize2,
  Code2,
} from 'lucide-react';

export interface FileTreeNode {
  name: string;
  path: string; // Full relative path
  isDirectory: boolean;
  children: FileTreeNode[];
  extension?: string;
}

interface FileTreeNavigatorProps {
  files: string[];
  activeFile: string;
  activeProject: string;
  projectPath?: string;
  onSelectFile: (filePath: string) => void;
  onDeleteFile: (filePath: string, e: React.MouseEvent) => void;
  onOpenCreateModal: (targetDirectory?: string) => void;
}

// Helper to determine file icon color based on extension
function getFileColor(ext?: string) {
  switch (ext) {
    case 'py':
      return 'text-sky-400';
    case 'ts':
    case 'tsx':
      return 'text-cyan-400';
    case 'js':
    case 'jsx':
      return 'text-amber-300';
    case 'go':
      return 'text-emerald-400';
    case 'rs':
      return 'text-orange-400';
    case 'java':
      return 'text-red-400';
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
      return 'text-purple-400';
    case 'json':
      return 'text-yellow-400';
    case 'md':
      return 'text-slate-400';
    default:
      return 'text-slate-400';
  }
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

export function FileTreeNavigator({
  files,
  activeFile,
  activeProject,
  projectPath,
  onSelectFile,
  onDeleteFile,
  onOpenCreateModal,
}: FileTreeNavigatorProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Filter files by search term
  const filteredFiles = useMemo(() => {
    if (!filterQuery.trim()) return files;
    const q = filterQuery.toLowerCase();
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, filterQuery]);

  // Build tree from files
  const fileTree = useMemo(() => {
    return buildFileTree(filteredFiles);
  }, [filteredFiles]);

  // Auto-expand all folders on mount or toggle
  const toggleFolder = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: prev[folderPath] !== undefined ? !prev[folderPath] : false, // Default is expanded
    }));
  };

  const isFolderExpanded = (folderPath: string) => {
    return expandedFolders[folderPath] !== false; // Expanded by default
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    function collectDirs(nodes: FileTreeNode[]) {
      for (const n of nodes) {
        if (n.isDirectory) {
          allExpanded[n.path] = true;
          collectDirs(n.children);
        }
      }
    }
    collectDirs(fileTree);
    setExpandedFolders(allExpanded);
  };

  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    function collectDirs(nodes: FileTreeNode[]) {
      for (const n of nodes) {
        if (n.isDirectory) {
          allCollapsed[n.path] = false;
          collectDirs(n.children);
        }
      }
    }
    collectDirs(fileTree);
    setExpandedFolders(allCollapsed);
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: FileTreeNode, depth = 0) => {
    if (node.isDirectory) {
      const expanded = isFolderExpanded(node.path);

      return (
        <div key={node.path} className="select-none">
          <div
            onClick={(e) => toggleFolder(node.path, e)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="flex items-center justify-between py-1.5 pr-2 rounded-lg hover:bg-slate-800/80 text-slate-300 text-xs cursor-pointer group transition"
          >
            <div className="flex items-center gap-1.5 truncate">
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              {expanded ? (
                <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <span className="font-mono font-medium text-slate-200 truncate">{node.name}</span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCreateModal(node.path);
                }}
                className="p-1 hover:bg-slate-750 text-slate-400 hover:text-cyan-300 rounded"
                title={`Novo arquivo em ${node.path}/`}
              >
                <FilePlus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {expanded && (
            <div className="relative border-l border-slate-800/80 ml-3.5">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File Node
    const isSelected = activeFile === node.path;
    const fileColor = getFileColor(node.extension);

    return (
      <div
        key={node.path}
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex items-center justify-between py-1.5 pr-2 rounded-lg text-xs cursor-pointer group transition font-mono ${
          isSelected
            ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 shadow-xs'
            : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          <FileCode className={`w-3.5 h-3.5 shrink-0 ${fileColor}`} />
          <span className="truncate">{node.name}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" title="Arquivo ativo" />
          )}
          <button
            onClick={(e) => onDeleteFile(node.path, e)}
            className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition"
            title="Excluir arquivo"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col h-full overflow-hidden">
      {/* Header with Title and Tree Controls */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-xs text-slate-200">Estrutura de Diretórios</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
            {files.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={expandAll}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
            title="Expandir todas as pastas"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={collapseAll}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
            title="Recolher todas as pastas"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onOpenCreateModal()}
            className="p-1 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition"
            title="Novo Arquivo na Raiz"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="p-2 border-b border-slate-800/80 bg-slate-950/20">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar arquivos na árvore..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Tree Content Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-[300px]">
        {fileTree.length > 0 ? (
          fileTree.map((node) => renderTreeNode(node, 0))
        ) : (
          <div className="text-slate-500 text-xs italic text-center py-8">
            {filterQuery ? 'Nenhum arquivo corresponde ao filtro.' : 'Nenhum arquivo cadastrado.'}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 border-t border-slate-800 text-[10px] text-slate-500 font-mono bg-slate-950/40 truncate">
        Root: {projectPath || `/workspace/${activeProject}`}
      </div>
    </div>
  );
}
