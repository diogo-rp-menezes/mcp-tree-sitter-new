import React from 'react';
import { FolderTree, Database, Terminal, Settings, AlertTriangle } from 'lucide-react';
import { NavTab } from './Sidebar';

interface VSCodeActivityBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  symbolsCount?: number;
  diagnosticsCount?: number;
  onOpenMCPModal?: () => void;
}

export function VSCodeActivityBar({
  activeTab,
  onSelectTab,
  symbolsCount = 0,
  diagnosticsCount = 0,
  onOpenMCPModal,
}: VSCodeActivityBarProps) {
  // Sidebar Activity Bar focus on Workspace Navigation, Diagnostics, and Services
  const activityItems = [
    {
      id: 'projects' as NavTab,
      label: 'Explorer / Workspace',
      icon: FolderTree,
      badge: null,
    },
    {
      id: 'diagnostics' as NavTab,
      label: 'Diagnósticos de Sintaxe',
      icon: AlertTriangle,
      badge: diagnosticsCount > 0 ? diagnosticsCount : null,
      badgeColor: 'bg-red-600',
    },
    {
      id: 'database' as NavTab,
      label: 'SQLite Database',
      icon: Database,
      badge: null,
    },
    {
      id: 'mcp' as NavTab,
      label: 'Console MCP',
      icon: Terminal,
      badge: null,
    },
  ];

  return (
    <aside className="w-12 bg-[#181818] border-r border-[#2b2b2b] flex flex-col justify-between shrink-0 select-none z-20">
      {/* Top Activity Icons */}
      <div className="flex flex-col items-center py-1 space-y-1">
        {activityItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`relative w-12 h-11 flex items-center justify-center transition group ${
                isActive
                  ? 'text-white bg-[#2a2d2e]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#202020]'
              }`}
              title={item.label}
            >
              {/* Active Left Indicator Accent Bar */}
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-cyan-400 rounded-r" />
              )}

              <Icon className={`w-5 h-5 transition ${isActive ? 'text-cyan-400 scale-105' : 'group-hover:scale-105'}`} />

              {/* Badge Overlay */}
              {item.badge !== null && (
                <span
                  className={`absolute top-1 right-1 ${
                    (item as any).badgeColor || 'bg-cyan-600'
                  } text-white font-mono text-[9px] px-1 rounded-full font-bold`}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Settings / Status Icon */}
      <div className="flex flex-col items-center pb-2 space-y-1 border-t border-[#2b2b2b] pt-2">
        <button
          onClick={onOpenMCPModal}
          className="w-12 h-10 flex items-center justify-center text-slate-400 hover:text-cyan-300 hover:bg-[#202020] transition relative"
          title="Configurações do Servidor MCP & Protocolo"
        >
          <Settings className="w-5 h-5" />
          <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-emerald-400 border border-[#181818]" />
        </button>
      </div>
    </aside>
  );
}
