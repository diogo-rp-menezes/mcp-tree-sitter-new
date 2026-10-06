import React from 'react';
import { FileCode, X } from 'lucide-react';

interface VSCodeTabBarProps {
  openFiles: string[];
  activeFile: string;
  language: string;
  isDirty?: boolean;
  onSelectFile: (file: string) => void;
  onCloseFile: (file: string) => void;
  onSaveFile?: () => void;
}

function getFileIcon(filename: string) {
  if (filename.endsWith('.py')) return <span className="text-amber-400 font-bold text-[10px]">PY</span>;
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return <span className="text-cyan-400 font-bold text-[10px]">TS</span>;
  if (filename.endsWith('.go')) return <span className="text-sky-400 font-bold text-[10px]">GO</span>;
  if (filename.endsWith('.rs')) return <span className="text-orange-400 font-bold text-[10px]">RS</span>;
  if (filename.endsWith('.json')) return <span className="text-emerald-400 font-bold text-[10px]">{}</span>;
  if (filename.endsWith('.sql')) return <span className="text-purple-400 font-bold text-[10px]">SQL</span>;
  return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
}

export function VSCodeTabBar({
  openFiles,
  activeFile,
  language,
  isDirty,
  onSelectFile,
  onCloseFile,
  onSaveFile,
}: VSCodeTabBarProps) {
  return (
    <div className="h-9 bg-[#252526] border-b border-[#2b2b2b] flex items-center justify-between px-1 select-none shrink-0 font-sans text-xs">
      {/* Scrollable Editor File Tabs (Only Documents explicitly opened) */}
      <div className="flex items-center overflow-x-auto no-scrollbar flex-1 h-full">
        {openFiles.length === 0 ? (
          <div className="px-3 text-[11px] text-slate-500 italic font-mono flex items-center gap-2">
            <span>Nenhum arquivo aberto — Selecione um arquivo no Explorer para abrir</span>
          </div>
        ) : (
          openFiles.map((file) => {
            const isActive = activeFile === file;
            return (
              <div
                key={file}
                onClick={() => onSelectFile(file)}
                className={`group relative h-full px-3 flex items-center gap-2 cursor-pointer border-r border-[#2b2b2b] transition shrink-0 ${
                  isActive
                    ? 'bg-[#1e1e1e] text-white font-medium border-t-2 border-t-cyan-400'
                    : 'bg-[#2d2d2d] text-slate-400 hover:bg-[#2a2a2a] hover:text-slate-200'
                }`}
              >
                {getFileIcon(file)}
                <span className="truncate max-w-40 font-mono text-xs">
                  {file}
                </span>

                {/* Unsaved changes dirty dot indicator */}
                {isActive && isDirty ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Alterações não salvas" />
                ) : null}

                {/* Close tab button ('x') */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(file);
                  }}
                  className="p-0.5 rounded hover:bg-[#3c3c3c] hover:text-white text-slate-400 transition"
                  title="Fechar aba"
                >
                  <X className="w-3 h-3 text-slate-400 hover:text-white" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Right Tab Bar Actions */}
      <div className="flex items-center gap-2 px-2 border-l border-[#2b2b2b] bg-[#252526] h-full shrink-0">
        <span className="text-[10px] text-cyan-400 font-mono bg-[#1e1e1e] px-2 py-0.5 rounded border border-[#333] uppercase">
          {language || 'TXT'}
        </span>
      </div>
    </div>
  );
}
