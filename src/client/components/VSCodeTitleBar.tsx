import React, { useState } from 'react';
import { Network, Search } from 'lucide-react';
import { ProjectInfo, PRESET_SNIPPETS } from '../types';

interface VSCodeTitleBarProps {
  activeProject: string;
  activeFile: string;
  language: string;
  projects: ProjectInfo[];
  projectFiles: string[];
  isDirty?: boolean;
  onSelectProject: (proj: string) => void;
  onSelectFile: (file: string) => void;
  onSaveFile: () => void;
  onLoadPreset: (preset: (typeof PRESET_SNIPPETS)[0]) => void;
  onOpenMCPModal: () => void;
  onToggleSideBar?: () => void;
  isSideBarOpen?: boolean;
}

export function VSCodeTitleBar({
  activeProject,
  activeFile,
  language,
  projects,
  projectFiles,
  isDirty,
  onSelectProject,
  onSelectFile,
  onSaveFile,
  onLoadPreset,
  onOpenMCPModal,
  onToggleSideBar,
  isSideBarOpen = true,
}: VSCodeTitleBarProps) {
  const [showPresets, setShowPresets] = useState(false);
  const currentProject = projects.find((p) => p.name === activeProject);

  return (
    <div className="h-9 bg-[#181818] border-b border-[#2b2b2b] px-3 flex items-center justify-between text-xs text-slate-300 select-none shrink-0 font-sans">
      {/* Left: VS Code Brand & Menu Bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-2 border-r border-[#333]">
          <div className="w-5 h-5 rounded bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Network className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-xs tracking-tight text-slate-200">
            TreeSitter <span className="text-cyan-400">MCP</span>
          </span>
        </div>

        {/* VS Code Classic Top Menu Items */}
        <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400">
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Arquivo</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Editar</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Seleção</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Ver</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Ir</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Executar</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Terminal</button>
          <button className="px-2 py-0.5 hover:bg-[#2a2d2e] rounded text-slate-300 hover:text-white transition">Ajuda</button>
        </div>
      </div>

      {/* Center: Command Palette / Quick Search Input Bar */}
      <div className="flex-1 max-w-xl mx-4 hidden md:flex items-center">
        <div className="w-full bg-[#252526] hover:bg-[#2c2c2d] border border-[#3c3c3c] focus-within:border-cyan-500 rounded-md px-3 py-1 flex items-center gap-2 text-slate-400 cursor-pointer transition shadow-inner">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-mono text-[11px] truncate text-slate-300 flex-1">
            {activeProject ? `${activeProject} > ${activeFile || 'Sem arquivo selecionado'}` : 'Nenhum projeto selecionado — Ctrl+P para buscar'}
          </span>
          <span className="text-[10px] bg-[#333] border border-[#444] text-slate-400 px-1.5 py-0.2 rounded font-mono shrink-0">
            Ctrl+P
          </span>
        </div>
      </div>

      {/* Right: Actions, Project Switcher & Status Badges */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Connected
        </span>
      </div>
    </div>
  );
}
