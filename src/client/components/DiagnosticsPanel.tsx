import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Search,
  Code2,
  Copy,
  Check,
  FileCode,
  ArrowUpRight,
  ExternalLink,
  Table as TableIcon,
  List as ListIcon,
  Terminal,
} from 'lucide-react';
import { ASTNode, SyntaxDiagnostic } from '../types';

export interface DiagnosticsPanelProps {
  ast?: ASTNode | null;
  hasError?: boolean;
  errors?: SyntaxDiagnostic[];
  filename?: string;
  activeFile?: string;
  language?: string;
  className?: string;
  onJumpToLine?: (line: number) => void;
  onSelectNode?: (node: ASTNode | SyntaxDiagnostic) => void;
}

/**
 * Traverses an ASTNode to collect any ERROR or MISSING syntax nodes as fallback
 */
function collectASTErrorsFallback(node: ASTNode | null | undefined): SyntaxDiagnostic[] {
  if (!node) return [];
  const results: SyntaxDiagnostic[] = [];

  function walk(curr: ASTNode) {
    const isError = curr.type === 'ERROR' || curr.type.includes('ERROR');
    const isMissing = curr.type.startsWith('MISSING') || curr.type === 'MISSING';

    if (isError || isMissing) {
      results.push({
        type: curr.type,
        message: isMissing
          ? `Token sintático ausente '${curr.type}'`
          : `Erro de sintaxe próximo a '${(curr.text || '').trim().slice(0, 35)}'`,
        isMissing,
        startPosition: { row: curr.startPoint.row, column: curr.startPoint.column },
        endPosition: { row: curr.endPoint.row, column: curr.endPoint.column },
        startByte: curr.startByte,
        endByte: curr.endByte,
        text: curr.text,
      });
    }

    if (curr.children && Array.isArray(curr.children)) {
      for (const child of curr.children) {
        walk(child);
      }
    }
  }

  walk(node);
  return results;
}

export function DiagnosticsPanel({
  ast,
  hasError: explicitHasError,
  errors: explicitErrors,
  filename,
  activeFile,
  language,
  className,
  onJumpToLine,
  onSelectNode,
}: DiagnosticsPanelProps) {
  const currentFile = activeFile || filename;
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'ERROR' | 'MISSING'>('ALL');
  const [viewLayout, setViewLayout] = useState<'table' | 'list'>('table');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 1. Reads 'ast.errors' from the application state, with prop/fallback support
  const allDiagnostics = useMemo<SyntaxDiagnostic[]>(() => {
    if (explicitErrors && Array.isArray(explicitErrors)) {
      return explicitErrors;
    }
    if (ast?.errors && Array.isArray(ast.errors)) {
      return ast.errors;
    }
    if (ast) {
      return collectASTErrorsFallback(ast);
    }
    return [];
  }, [ast, explicitErrors]);

  const hasSyntaxError = useMemo(() => {
    if (explicitHasError !== undefined) return explicitHasError;
    if (ast?.hasError !== undefined) return ast.hasError;
    return allDiagnostics.length > 0;
  }, [explicitHasError, ast, allDiagnostics]);

  // Filter diagnostics by search query and type filter
  const filteredDiagnostics = useMemo(() => {
    return allDiagnostics.filter((diag) => {
      // Type filter
      if (selectedType === 'ERROR' && diag.isMissing) return false;
      if (selectedType === 'MISSING' && !diag.isMissing) return false;

      // Text query match
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      const lineStr = `linha ${diag.startPosition.row + 1} line ${diag.startPosition.row + 1}`;
      const msg = (diag.message || '').toLowerCase();
      const txt = (diag.text || '').toLowerCase();
      const typ = diag.type.toLowerCase();

      return msg.includes(q) || txt.includes(q) || typ.includes(q) || lineStr.includes(q);
    });
  }, [allDiagnostics, selectedType, filterQuery]);

  const errorCount = useMemo(
    () => allDiagnostics.filter((d) => !d.isMissing).length,
    [allDiagnostics]
  );
  const missingCount = useMemo(
    () => allDiagnostics.filter((d) => d.isMissing).length,
    [allDiagnostics]
  );

  const handleCopy = (diag: SyntaxDiagnostic, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = `[${diag.type}] Linha ${diag.startPosition.row + 1}:${diag.startPosition.column + 1} - ${diag.message || ''} (${diag.text || ''})`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const handleNavigate = (diag: SyntaxDiagnostic, idx: number) => {
    if (onJumpToLine) {
      onJumpToLine(diag.startPosition.row);
    }
    if (onSelectNode) {
      onSelectNode({
        id: `diagnostic_${idx}`,
        type: diag.type,
        isNamed: true,
        startPoint: diag.startPosition,
        endPoint: diag.endPosition,
        startByte: diag.startByte,
        endByte: diag.endByte,
        text: diag.text,
        children: [],
      } as ASTNode);
    }
  };

  return (
    <div
      className={`flex flex-col ${
        className || 'h-full w-full'
      } bg-[#1e1e1e] text-slate-200 select-none text-xs font-sans overflow-hidden`}
    >
      {/* Top Header & Diagnostics Summary */}
      <div className="p-3.5 border-b border-[#2b2b2b] bg-[#252526] shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-slate-100 text-sm tracking-wide flex items-center gap-2">
                <span>Diagnósticos de Sintaxe</span>
                <span className="text-[10px] text-slate-400 font-mono font-normal">
                  (Tree-sitter AST)
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Detecção de nós <code className="text-red-300 bg-red-950/60 px-1 rounded">ERROR</code> e{' '}
                <code className="text-amber-300 bg-amber-950/60 px-1 rounded">MISSING</code> via{' '}
                <span className="font-mono text-cyan-300">ast.errors</span>
              </div>
            </div>
          </div>

          {/* Status Badge & View Mode Toggle */}
          <div className="flex items-center gap-2">
            {hasSyntaxError || allDiagnostics.length > 0 ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-red-950/80 border border-red-700/70 text-red-300 flex items-center gap-1.5 shadow-sm">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span>
                  {allDiagnostics.length} {allDiagnostics.length === 1 ? 'problema detectado' : 'problemas detectados'}
                </span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-950/80 border border-emerald-700/70 text-emerald-300 flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sintaxe Íntegra (0 erros)</span>
              </span>
            )}

            {/* Table / List layout switch */}
            <div className="flex items-center border border-[#3c3c3c] rounded bg-[#1e1e1e] p-0.5">
              <button
                onClick={() => setViewLayout('table')}
                className={`p-1 rounded text-xs transition ${
                  viewLayout === 'table' ? 'bg-[#333] text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Modo Tabela de Erros"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewLayout('list')}
                className={`p-1 rounded text-xs transition ${
                  viewLayout === 'list' ? 'bg-[#333] text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Modo Lista de Diagnósticos"
              >
                <ListIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-[#333]/70">
          {/* File Context & Type Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono bg-[#181818] px-2 py-1 rounded border border-[#3c3c3c]">
              <FileCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate max-w-[180px]">{currentFile || 'Buffer Ativo'}</span>
              <span className="text-slate-500 uppercase text-[10px]">({language || 'code'})</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setSelectedType('ALL')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  selectedType === 'ALL'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-[#181818] text-slate-400 hover:text-slate-200 hover:bg-[#2a2a2a] border border-[#3c3c3c]'
                }`}
              >
                Todos ({allDiagnostics.length})
              </button>
              <button
                onClick={() => setSelectedType('ERROR')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1.5 ${
                  selectedType === 'ERROR'
                    ? 'bg-red-700 text-white shadow-sm'
                    : 'bg-[#181818] text-red-400 hover:text-red-300 hover:bg-[#2a2a2a] border border-[#3c3c3c]'
                }`}
              >
                <XCircle className="w-3 h-3" />
                <span>ERROR ({errorCount})</span>
              </button>
              <button
                onClick={() => setSelectedType('MISSING')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center gap-1.5 ${
                  selectedType === 'MISSING'
                    ? 'bg-amber-700 text-white shadow-sm'
                    : 'bg-[#181818] text-amber-400 hover:text-amber-300 hover:bg-[#2a2a2a] border border-[#3c3c3c]'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>MISSING ({missingCount})</span>
              </button>
            </div>
          </div>

          {/* Search text filter */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filtrar por mensagem, linha ou token..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-[#181818] border border-[#3c3c3c] rounded pl-8 pr-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Main Content: Table or List */}
      <div className="flex-1 overflow-auto p-3">
        {filteredDiagnostics.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-slate-400 space-y-3 bg-[#252526]/50 rounded-lg border border-[#333]/50">
            {allDiagnostics.length === 0 ? (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-950/70 border border-emerald-700/60 flex items-center justify-center text-emerald-400 shadow-inner">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="font-semibold text-slate-100 text-sm">Nenhum Erro de Sintaxe Detectado</div>
                <div className="text-xs text-slate-400 font-mono max-w-md">
                  A árvore gerada pelo parser Tree-sitter para este arquivo não contém nós <code className="text-emerald-300">ERROR</code> ou <code className="text-emerald-300">MISSING</code>. Todas as estruturas sintáticas estão em conformidade com a gramática.
                </div>
              </>
            ) : (
              <>
                <Search className="w-8 h-8 text-slate-600" />
                <div className="text-sm font-medium text-slate-300">Nenhum diagnóstico corresponde aos filtros</div>
                <button
                  onClick={() => {
                    setFilterQuery('');
                    setSelectedType('ALL');
                  }}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Limpar filtros
                </button>
              </>
            )}
          </div>
        ) : viewLayout === 'table' ? (
          /* Table View of Syntax Errors */
          <div className="border border-[#3c3c3c] rounded-lg overflow-hidden bg-[#252526] shadow-sm">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="border-b border-[#3c3c3c] bg-[#1f1f1f] text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-28">Tipo</th>
                  <th className="py-2.5 px-3 w-44">Faixa Linha / Coluna</th>
                  <th className="py-2.5 px-3">Descrição do Erro</th>
                  <th className="py-2.5 px-3 w-52">Token Afetado</th>
                  <th className="py-2.5 px-3 w-36 text-right">Ação / Navegação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333]">
                {filteredDiagnostics.map((diag, idx) => {
                  const startLine = diag.startPosition.row + 1;
                  const endLine = diag.endPosition.row + 1;
                  const startCol = diag.startPosition.column + 1;
                  const endCol = diag.endPosition.column + 1;
                  const isSingleLine = startLine === endLine;

                  const rangeLabel = isSingleLine
                    ? `Ln ${startLine}:${startCol}–${endCol}`
                    : `Ln ${startLine}:${startCol} → Ln ${endLine}:${endCol}`;

                  return (
                    <tr
                      key={`${diag.type}-${idx}-${diag.startByte}`}
                      className={`hover:bg-[#2a2d2e] transition cursor-pointer group ${
                        diag.isMissing ? 'bg-amber-950/10' : 'bg-red-950/10'
                      }`}
                      onClick={() => handleNavigate(diag, idx)}
                    >
                      {/* 1. Type / Severity */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {diag.isMissing ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-900/60 text-amber-300 border border-amber-700/60">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>MISSING</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-900/60 text-red-300 border border-red-700/60">
                            <XCircle className="w-2.5 h-2.5" />
                            <span>ERROR</span>
                          </span>
                        )}
                      </td>

                      {/* 2. Line / Column Range */}
                      <td className="py-2 px-3 whitespace-nowrap font-mono text-[11px] text-cyan-300 font-medium">
                        {rangeLabel}
                      </td>

                      {/* 3. Short Error Message */}
                      <td className="py-2 px-3 text-slate-200">
                        <div className="font-medium text-[11px] leading-snug">
                          {diag.message || (diag.isMissing ? 'Token sintático ausente' : 'Erro de sintaxe')}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Offset: bytes {diag.startByte}..{diag.endByte}
                        </div>
                      </td>

                      {/* 4. Token Snippet */}
                      <td className="py-2 px-3">
                        {diag.text ? (
                          <code className="block max-w-[200px] truncate bg-[#181818] border border-[#333] px-2 py-0.5 rounded text-[10px] font-mono text-amber-200 group-hover:border-slate-500">
                            {diag.text.trim() || '<espaço em branco>'}
                          </code>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">&lt;ausente&gt;</span>
                        )}
                      </td>

                      {/* 5. Clickable Action Link to onJumpToLine */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigate(diag, idx);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/80 hover:bg-cyan-800 border border-cyan-700/60 text-cyan-200 hover:text-white font-mono text-[11px] font-medium transition shadow-sm"
                            title={`Navegar para Linha ${startLine}`}
                          >
                            <span>Ir para Linha {startLine}</span>
                            <ExternalLink className="w-3 h-3 text-cyan-300" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleCopy(diag, idx, e)}
                            className="p-1 rounded hover:bg-[#333] text-slate-400 hover:text-slate-200 transition"
                            title="Copiar linha e diagnóstico"
                          >
                            {copiedIndex === idx ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* List / Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredDiagnostics.map((diag, idx) => {
              const startLine = diag.startPosition.row + 1;
              const endLine = diag.endPosition.row + 1;
              const startCol = diag.startPosition.column + 1;
              const endCol = diag.endPosition.column + 1;
              const isSingleLine = startLine === endLine;

              const rangeLabel = isSingleLine
                ? `Linha ${startLine}:${startCol}–${endCol}`
                : `Linhas ${startLine}:${startCol} → ${endLine}:${endCol}`;

              return (
                <div
                  key={`${diag.type}-${idx}-${diag.startByte}`}
                  onClick={() => handleNavigate(diag, idx)}
                  className={`p-3 rounded-lg border transition cursor-pointer group text-xs flex flex-col justify-between ${
                    diag.isMissing
                      ? 'bg-amber-950/20 border-amber-900/60 hover:bg-amber-950/30 hover:border-amber-700'
                      : 'bg-red-950/20 border-red-900/60 hover:bg-red-950/30 hover:border-red-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#333]/60 mb-2">
                      <div className="flex items-center gap-1.5">
                        {diag.isMissing ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-900/60 text-amber-300 border border-amber-700/50">
                            MISSING
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-900/60 text-red-300 border border-red-700/50">
                            ERROR
                          </span>
                        )}
                        <span className="font-mono text-cyan-300 font-semibold">{rangeLabel}</span>
                      </div>

                      <button
                        onClick={(e) => handleCopy(diag, idx, e)}
                        className="p-1 hover:bg-[#333] rounded text-slate-400 hover:text-slate-200 transition"
                        title="Copiar diagnóstico"
                      >
                        {copiedIndex === idx ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    <div className="text-slate-200 font-normal leading-relaxed text-xs">
                      {diag.message || (diag.isMissing ? 'Nó sintático ausente' : 'Erro de sintaxe')}
                    </div>

                    {diag.text && (
                      <div className="mt-2 p-2 bg-[#181818] border border-[#333] rounded font-mono text-[11px] text-amber-200 truncate">
                        <code>{diag.text.trim() || '<vazio>'}</code>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-[#333]/50 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500">
                      Offset: {diag.startByte}..{diag.endByte}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNavigate(diag, idx);
                      }}
                      className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-200 font-mono text-xs font-semibold hover:underline"
                    >
                      <span>Ir para Linha {startLine}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Metrics & State Details */}
      <div className="p-2.5 border-t border-[#2b2b2b] bg-[#252526] text-[11px] text-slate-400 font-mono flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Tree-sitter State:</span>
            <span className={hasSyntaxError ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
              {hasSyntaxError ? 'hasError = true' : 'hasError = false'}
            </span>
          </div>
          <span className="text-slate-600">|</span>
          <div className="flex items-center gap-1 text-slate-400">
            <span>ast.errors:</span>
            <span className="text-slate-200 font-semibold">{allDiagnostics.length} registros</span>
          </div>
        </div>

        <div className="text-slate-400">
          Exibindo <span className="text-white font-semibold">{filteredDiagnostics.length}</span> de{' '}
          <span className="text-white font-semibold">{allDiagnostics.length}</span> erros
        </div>
      </div>
    </div>
  );
}
