import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  FolderGit2,
  Copy,
  Check,
  ChevronDown,
  ArrowUp,
  FolderTree,
  HardDrive,
} from 'lucide-react';
import { ProjectInfo } from '../types';

interface BreadcrumbBarProps {
  activeProject: string;
  activeFile: string;
  projectPath?: string;
  projectFiles: string[];
  language: string;
  projects?: ProjectInfo[];
  onSelectProject: (proj: string) => void;
  onSelectFile: (file: string) => void;
  onOpenProjectManager?: () => void;
  onToast?: (msg: string) => void;
}

interface PathSegment {
  name: string;
  fullPath: string; // Accumulated directory path or file path
  isDirectory: boolean;
  siblingFiles: string[];
}

export function BreadcrumbBar({
  activeProject,
  activeFile,
  projectPath,
  projectFiles,
  language,
  projects = [],
  onSelectProject,
  onSelectFile,
  onOpenProjectManager,
  onToast,
}: BreadcrumbBarProps) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute breadcrumb segments
  const segments = useMemo<PathSegment[]>(() => {
    if (!activeFile) return [];

    const parts = activeFile.split('/').filter(Boolean);
    const result: PathSegment[] = [];
    let accumulated = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      accumulated = accumulated ? `${accumulated}/${part}` : part;

      // Sibling files for directory
      let siblings: string[] = [];
      if (!isFile) {
        // Files inside this directory
        siblings = projectFiles.filter(
          (f) => f.startsWith(`${accumulated}/`) && f !== activeFile
        );
      } else {
        // Sibling files in same directory as this file
        const parentDir = parts.slice(0, -1).join('/');
        siblings = projectFiles.filter((f) => {
          if (parentDir) {
            return f.startsWith(`${parentDir}/`) && f !== activeFile;
          }
          return !f.includes('/') && f !== activeFile;
        });
      }

      result.push({
        name: part,
        fullPath: accumulated,
        isDirectory: !isFile,
        siblingFiles: siblings,
      });
    }

    return result;
  }, [activeFile, projectFiles]);

  // Jump to parent directory
  const handleJumpToParent = () => {
    if (segments.length <= 1) return;
    const parentSegment = segments[segments.length - 2];
    if (parentSegment && parentSegment.siblingFiles.length > 0) {
      onSelectFile(parentSegment.siblingFiles[0]);
    } else {
      // Find any file in parent dir
      const parentDir = parentSegment.fullPath;
      const fileInParent = projectFiles.find((f) => f.startsWith(`${parentDir}/`));
      if (fileInParent) {
        onSelectFile(fileInParent);
      }
    }
  };

  const handleCopyPath = () => {
    const full = projectPath ? `${projectPath}/${activeFile}` : activeFile;
    navigator.clipboard.writeText(full);
    setCopied(true);
    if (onToast) {
      onToast(`Caminho copiado: ${full}`);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const hasParentDir = segments.length > 1;

  return (
    <div
      ref={dropdownRef}
      className="h-8 px-4 bg-[#0a0f1c] border-b border-slate-800/90 flex items-center justify-between text-xs select-none shrink-0 text-slate-300 font-mono"
    >
      {/* Left: Interactive Breadcrumbs */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
        {/* Up to Parent Button */}
        {hasParentDir && (
          <button
            onClick={handleJumpToParent}
            className="p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition mr-1"
            title="Subir para o diretório pai"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Project Root Segment */}
        <div className="relative flex items-center">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'project' ? null : 'project')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-slate-800/80 transition font-medium text-slate-200 ${
              openDropdown === 'project' ? 'bg-slate-800 text-cyan-300' : ''
            }`}
            title="Projetos disponíveis"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate max-w-[140px]">{activeProject}</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {/* Project Switcher Dropdown */}
          {openDropdown === 'project' && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-1 space-y-0.5 animate-in fade-in duration-100 font-sans">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 flex justify-between items-center">
                <span>Alternar Projeto</span>
                {onOpenProjectManager && (
                  <button
                    onClick={() => {
                      setOpenDropdown(null);
                      onOpenProjectManager();
                    }}
                    className="text-cyan-400 hover:text-cyan-300 font-normal"
                  >
                    Gerenciar
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto">
                {projects.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      onSelectProject(p.name);
                      setOpenDropdown(null);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                      p.name === activeProject
                        ? 'bg-cyan-950/70 text-cyan-200 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderGit2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{p.name}</span>
                    </div>
                    {p.name === activeProject && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Directory & File Path Segments */}
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          const isDropdownOpen = openDropdown === seg.fullPath;

          return (
            <React.Fragment key={seg.fullPath}>
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />

              <div className="relative flex items-center">
                {seg.isDirectory ? (
                  // Directory Segment with Subdirectory / Sibling Picker
                  <>
                    <button
                      onClick={() =>
                        setOpenDropdown(isDropdownOpen ? null : seg.fullPath)
                      }
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-slate-300 hover:text-slate-100 hover:bg-slate-800/70 transition ${
                        isDropdownOpen ? 'bg-slate-800 text-cyan-300' : ''
                      }`}
                      title={`Diretório: ${seg.fullPath}/`}
                    >
                      <Folder className="w-3.5 h-3.5 text-cyan-400/90 shrink-0" />
                      <span className="truncate max-w-[120px]">{seg.name}</span>
                      <ChevronDown className="w-2.5 h-2.5 text-slate-500" />
                    </button>

                    {/* Dropdown for Directory Files */}
                    {isDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-1 space-y-0.5 animate-in fade-in duration-100">
                        <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          Arquivos em {seg.fullPath}/
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {seg.siblingFiles.length > 0 ? (
                            seg.siblingFiles.map((file) => (
                              <button
                                key={file}
                                onClick={() => {
                                  onSelectFile(file);
                                  setOpenDropdown(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-slate-300 hover:bg-slate-800/70 transition"
                              >
                                <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="truncate">{file.split('/').pop()}</span>
                              </button>
                            ))
                          ) : (
                            <div className="px-2.5 py-2 text-slate-500 italic text-[11px]">
                              Nenhum outro arquivo nesta pasta.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // File Segment (Active File) with Sibling Files Picker
                  <>
                    <button
                      onClick={() =>
                        setOpenDropdown(isDropdownOpen ? null : seg.fullPath)
                      }
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-semibold text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 hover:bg-cyan-950/70 transition ${
                        isDropdownOpen ? 'bg-cyan-900/60 border-cyan-500' : ''
                      }`}
                      title="Arquivo atual (clique para alternar arquivo no mesmo diretório)"
                    >
                      <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate max-w-[160px]">{seg.name}</span>
                      {seg.siblingFiles.length > 0 && (
                        <ChevronDown className="w-2.5 h-2.5 text-cyan-500" />
                      )}
                    </button>

                    {/* Dropdown for Sibling Files */}
                    {isDropdownOpen && seg.siblingFiles.length > 0 && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-1 space-y-0.5 animate-in fade-in duration-100">
                        <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          Outros arquivos no mesmo diretório
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {seg.siblingFiles.map((file) => (
                            <button
                              key={file}
                              onClick={() => {
                                onSelectFile(file);
                                setOpenDropdown(null);
                              }}
                              className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 text-slate-300 hover:bg-slate-800/70 transition"
                            >
                              <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span className="truncate">{file.split('/').pop()}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </React.Fragment>
          );
        })}
        {!activeFile && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
            <span className="text-slate-500 italic text-[11px] font-sans">
              Selecione um arquivo no Explorer para abrir
            </span>
          </>
        )}
      </div>

      {/* Right: Path Info & Copy Action */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] uppercase px-1.5 py-0.2 rounded bg-slate-800/80 text-cyan-400 border border-slate-700 hidden md:inline">
          {language}
        </span>

        <button
          onClick={handleCopyPath}
          className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition flex items-center gap-1 text-[11px]"
          title="Copiar caminho relativo do arquivo"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span className="hidden lg:inline">{copied ? 'Copiado!' : 'Copiar Caminho'}</span>
        </button>
      </div>
    </div>
  );
}
