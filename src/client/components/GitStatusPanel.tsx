import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  RefreshCw,
  FolderGit2,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Send,
  HardDrive,
  Layers,
  ArrowRightLeft,
} from 'lucide-react';
import { GitRepoStatus } from '../types';

interface GitStatusPanelProps {
  activeProject: string;
  projectPath?: string;
}

export function GitStatusPanel({ activeProject, projectPath }: GitStatusPanelProps) {
  const [gitStatus, setGitStatus] = useState<GitRepoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Commit & Branch forms
  const [commitMsg, setCommitMsg] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [isNewBranch, setIsNewBranch] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const fetchGitStatus = async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-status`);
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
      }
    } catch (err) {
      console.error('Failed to load git status', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGitStatus();
  }, [activeProject]);

  const showFeedback = (text: string, isError = false) => {
    setActionMessage({ text, isError });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleInitGit = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-init`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao inicializar repositório Git.');
      setGitStatus(data);
      showFeedback('Repositório Git inicializado com sucesso no workspace!');
    } catch (err: any) {
      showFeedback(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncDisk = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-sync`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao sincronizar arquivos no disco.');
      if (data.gitStatus) setGitStatus(data.gitStatus);
      showFeedback(`${data.syncedCount} arquivos sincronizados no disco.`);
    } catch (err: any) {
      showFeedback(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStageAll = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao adicionar arquivos ao staging.');
      setGitStatus(data);
      showFeedback('Arquivos adicionados para commit (git add -A).');
    } catch (err: any) {
      showFeedback(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnstageAll = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-unstage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao remover arquivos do staging.');
      setGitStatus(data);
      showFeedback('Arquivos desmarcados do staging (git restore --staged).');
    } catch (err: any) {
      showFeedback(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!commitMsg.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMsg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao realizar commit.');
      setGitStatus(data);
      setCommitMsg('');
      showFeedback(`Commit realizado com sucesso: "${data.lastCommit?.message || commitMsg}"!`);
    } catch (err: any) {
      showFeedback(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSwitchBranch = async () => {
    if (!branchInput.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/git-branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branchInput.trim(), create: isNewBranch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao alternar branch.');
      setGitStatus(data);
      setBranchInput('');
      setShowBranchModal(false);
      showFeedback(`Branch alternado para '${data.branch}'!`);
    } catch (err: any) {
      showFeedback(err.message, true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  if (!gitStatus && !loading) return null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <FolderGit2 className="w-5 h-5 text-cyan-400" />
          <div>
            <h4 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
              Controle de Versão Git: <span className="text-cyan-400 font-mono">{activeProject}</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Controle de versão, commits e branches sincronizados com o workspace
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleSyncDisk}
            disabled={actionLoading}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition"
            title="Grava todos os arquivos do SQLite no disco"
          >
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sincronizar Disco</span>
          </button>

          <button
            onClick={fetchGitStatus}
            disabled={loading}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition"
            title="Atualizar status do Git"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-2.5 rounded-xl border text-xs font-mono flex items-center gap-2 animate-in fade-in duration-150 ${
            actionMessage.isError
              ? 'bg-red-950/80 border-red-800 text-red-200'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
          }`}
        >
          {actionMessage.isError ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Main Content Area */}
      {gitStatus?.isGitRepo ? (
        <div className="space-y-4 text-xs animate-in fade-in duration-150">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Branch Card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400 shrink-0">
                  <GitBranch className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Branch Atual</div>
                  <div className="font-mono font-bold text-slate-100 text-sm truncate flex items-center gap-1.5 mt-0.5">
                    <span className="text-cyan-300">{gitStatus.branch}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Branch ativo" />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowBranchModal(true)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition border border-slate-700 shrink-0"
              >
                Trocar / Criar
              </button>
            </div>

            {/* Uncommitted Changes Card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                  gitStatus.uncommittedCount === 0
                    ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
                    : 'bg-amber-950/60 border-amber-800/80 text-amber-400'
                }`}
              >
                {gitStatus.uncommittedCount === 0 ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Alterações Pendentes</div>
                <div className="font-mono font-bold text-slate-100 text-sm tabular-nums mt-0.5">
                  {gitStatus.uncommittedCount === 0 ? (
                    <span className="text-emerald-400 font-sans text-xs">Working tree limpa</span>
                  ) : (
                    <span className="text-amber-400">
                      {gitStatus.uncommittedCount} arquivo(s)
                    </span>
                  )}
                </div>
                {gitStatus.uncommittedCount > 0 && (
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {gitStatus.stagedCount} staged · {gitStatus.modifiedCount} mod · {gitStatus.untrackedCount} untracked
                  </div>
                )}
              </div>
            </div>

            {/* Last Commit Hash Card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-950/60 border border-purple-800/80 flex items-center justify-center text-purple-400 shrink-0">
                <GitCommit className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Último Commit</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono font-bold text-purple-300 text-xs bg-purple-950/50 px-1.5 py-0.5 rounded border border-purple-800/50">
                    {gitStatus.lastCommit?.hash || 'HEAD'}
                  </span>
                  {gitStatus.lastCommit?.hash && (
                    <button
                      onClick={() => handleCopyHash(gitStatus.lastCommit!.hash)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition"
                      title="Copiar Hash"
                    >
                      {copiedHash ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Git Operations: Stage & Commit Box */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
                  <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Novo Commit no Repositório</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleStageAll}
                  disabled={actionLoading || gitStatus.uncommittedCount === 0}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded text-[11px] font-medium transition"
                  title="Executar git add -A"
                >
                  Stage All ({gitStatus.modifiedCount + gitStatus.untrackedCount})
                </button>
                <button
                  onClick={handleUnstageAll}
                  disabled={actionLoading || gitStatus.stagedCount === 0}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded text-[11px] font-medium transition"
                  title="Executar git restore --staged"
                >
                  Unstage All ({gitStatus.stagedCount})
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommit();
                }}
                placeholder="Mensagem do commit (ex: feat: add tree-sitter C# parser)..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                onClick={handleCommit}
                disabled={actionLoading || !commitMsg.trim()}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg font-semibold flex items-center gap-1.5 transition text-xs shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Commit</span>
              </button>
            </div>
          </div>

          {/* Last Commit Detail Box */}
          {gitStatus.lastCommit && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-900 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">Mensagem do Commit:</span>
                  <span className="text-slate-100 font-mono text-xs">{gitStatus.lastCommit.message}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-slate-400" />
                    {gitStatus.lastCommit.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {gitStatus.lastCommit.relativeDate}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-0.5">
                <span>Repositório: {gitStatus.repoPath}</span>
                {gitStatus.remoteUrl && (
                  <span className="text-cyan-400 truncate max-w-sm">
                    Remoto: {gitStatus.remoteUrl}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Not a Git Repository State */
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="font-semibold text-slate-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>Nenhum Repositório Git Ativo Detectado</span>
            </div>
            <p className="text-slate-500 text-[11px]">
              O diretório configurado (<code className="text-cyan-400 font-mono">{projectPath || activeProject}</code>) ainda não foi inicializado com controle de versão Git.
            </p>
          </div>

          <button
            onClick={handleInitGit}
            disabled={actionLoading}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition text-xs shrink-0 self-start sm:self-auto"
          >
            {actionLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Inicializando...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Inicializar Git (git init)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#0e1422] border border-slate-700/80 rounded-2xl max-w-md w-full p-5 shadow-2xl text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-cyan-400" />
                <span>Alternar ou Criar Branch</span>
              </h3>
              <button
                onClick={() => setShowBranchModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Nome do Branch
                </label>
                <input
                  type="text"
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  placeholder="ex: feature/ast-inspector"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={isNewBranch}
                  onChange={(e) => setIsNewBranch(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-800 text-cyan-500 focus:ring-0"
                />
                <span>Criar novo branch (git checkout -b)</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                onClick={() => setShowBranchModal(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleSwitchBranch}
                disabled={actionLoading || !branchInput.trim()}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold text-xs transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
