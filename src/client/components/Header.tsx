import React, { useState } from 'react';
import { Network, Save, Copy, Check, Sparkles, Server, Terminal, HardDrive } from 'lucide-react';
import { ProjectInfo, PRESET_SNIPPETS } from '../types';

interface HeaderProps {
  activeProject: string;
  activeFile: string;
  language: string;
  projects: ProjectInfo[];
  projectFiles: string[];
  onSelectProject: (proj: string) => void;
  onSelectFile: (file: string) => void;
  onSaveFile: () => void;
  onLoadPreset: (preset: (typeof PRESET_SNIPPETS)[0]) => void;
  onOpenMCPModal: () => void;
}

export function Header({
  activeProject,
  activeFile,
  language,
  projects,
  projectFiles,
  onSelectProject,
  onSelectFile,
  onSaveFile,
  onLoadPreset,
  onOpenMCPModal,
}: HeaderProps) {
  const [showPresets, setShowPresets] = useState(false);
  const currentProject = projects.find((p) => p.name === activeProject);

  return (
    <header className="h-14 border-b border-slate-800 bg-[#0b0f19] px-4 flex items-center justify-between shrink-0 select-none">
      {/* Zone 1: Brand Wordmark (Single text element) */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Network className="w-4 h-4" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-2">
          TreeSitter MCP
          <span className="text-[11px] font-normal text-slate-400">· Studio</span>
        </span>
      </div>

      {/* Zone 2: Breadcrumbs & Project/File Navigation with Isolated Path */}
      <div className="hidden md:flex items-center gap-2 text-xs">
        <span className="text-slate-400 font-medium">Projeto:</span>
        <select
          value={activeProject}
          onChange={(e) => onSelectProject(e.target.value)}
          className="bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 hover:border-slate-600 transition"
        >
          {projects.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} — {p.path}
            </option>
          ))}
        </select>

        {currentProject && (
          <span
            className="text-[10px] text-cyan-400/80 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 truncate max-w-48 hidden lg:inline"
            title={`Caminho isolado do projeto: ${currentProject.path}`}
          >
            {currentProject.path}
          </span>
        )}

        <span className="text-slate-600">/</span>

        <span className="text-slate-400 font-medium">Arquivo:</span>
        <select
          value={activeFile}
          onChange={(e) => onSelectFile(e.target.value)}
          className="bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500 hover:border-slate-600 transition"
        >
          {projectFiles.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[11px] uppercase border border-slate-700">
          {language}
        </span>
      </div>

      {/* Zone 3: Primary Action Controls */}
      <div className="flex items-center gap-2">
        {/* Presets dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 flex items-center gap-1.5 transition"
            title="Carregar exemplo de código em outra linguagem"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Exemplos</span>
          </button>

          {showPresets && (
            <div className="absolute right-0 mt-1 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 z-50 text-xs">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                Exemplos de Código Multi-linguagem
              </div>
              {PRESET_SNIPPETS.map((ps) => (
                <button
                  key={ps.filename}
                  onClick={() => {
                    onLoadPreset(ps);
                    setShowPresets(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-300 flex items-center justify-between transition"
                >
                  <span className="truncate">{ps.name}</span>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase">{ps.language}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={onSaveFile}
          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 flex items-center gap-1.5 transition"
          title="Salvar alterações no arquivo"
        >
          <Save className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Salvar</span>
        </button>

        {/* MCP Connect modal button */}
        <button
          onClick={onOpenMCPModal}
          className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
          title="Ver configurações para conectar Claude Desktop ou Cursor"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Conectar MCP</span>
        </button>
      </div>
    </header>
  );
}
