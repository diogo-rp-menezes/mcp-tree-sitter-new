import React from 'react';
import {
  Layers,
  Search,
  FileCode,
  BarChart3,
  GitCompare,
  Terminal,
  FolderTree,
  CheckCircle2,
  Cpu,
  Database,
  AlertTriangle,
} from 'lucide-react';

export type NavTab = 'ast' | 'query' | 'symbols' | 'complexity' | 'similarity' | 'mcp' | 'projects' | 'database' | 'diagnostics';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  symbolsCount: number;
  diagnosticsCount?: number;
}

export function Sidebar({ activeTab, onSelectTab, symbolsCount, diagnosticsCount = 0 }: SidebarProps) {
  const navItems = [
    {
      id: 'ast' as NavTab,
      label: 'AST Explorer',
      sublabel: 'Árvore Sintática',
      icon: Layers,
    },
    {
      id: 'diagnostics' as NavTab,
      label: 'Diagnósticos',
      sublabel: diagnosticsCount > 0 ? `${diagnosticsCount} erros detectados` : 'Sintaxe válida',
      icon: AlertTriangle,
    },
    {
      id: 'query' as NavTab,
      label: 'Query Studio',
      sublabel: 'Consultas S-Expr',
      icon: Search,
    },
    {
      id: 'symbols' as NavTab,
      label: 'Símbolos',
      sublabel: `${symbolsCount} declarados`,
      icon: FileCode,
    },
    {
      id: 'complexity' as NavTab,
      label: 'Complexidade',
      sublabel: 'Métricas & Risco',
      icon: BarChart3,
    },
    {
      id: 'similarity' as NavTab,
      label: 'Similaridade AST',
      sublabel: 'Fingerprint Jaccard',
      icon: GitCompare,
    },
    {
      id: 'mcp' as NavTab,
      label: 'Console MCP',
      sublabel: 'JSON-RPC / SSE',
      icon: Terminal,
    },
    {
      id: 'projects' as NavTab,
      label: 'Arquivos & Projetos',
      sublabel: 'Workspace',
      icon: FolderTree,
    },
    {
      id: 'database' as NavTab,
      label: 'Database',
      sublabel: 'SQLite Explorer',
      icon: Database,
    },
  ];

  return (
    <aside className="w-60 border-r border-slate-800 bg-[#0d131f] flex flex-col justify-between shrink-0 select-none">
      {/* Top Nav Items */}
      <div className="p-3 space-y-1">
        <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Ferramentas Tree-sitter
        </div>

        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <div className="truncate">
                    <div className="truncate text-slate-200">{item.label}</div>
                    <div className="text-[10px] text-slate-400 font-normal truncate">{item.sublabel}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Service Info Card */}
      <div className="p-3 border-t border-slate-800 bg-[#0a0e17]">
        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Servidor MCP
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Ativo (3000)
            </span>
          </div>

          <div className="text-[11px] text-slate-400">
            Tree-sitter Language Pack v0.6.1 + FastMCP Engine
          </div>
        </div>
      </div>
    </aside>
  );
}
