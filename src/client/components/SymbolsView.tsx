import React, { useState, useMemo } from 'react';
import { FileCode, Search, Code, Box, Layers, ArrowUpRight } from 'lucide-react';
import { SymbolItem } from '../types';

interface SymbolsViewProps {
  symbols: Record<string, SymbolItem[]>;
  onJumpToLine?: (line: number) => void;
}

export function SymbolsView({ symbols, onJumpToLine }: SymbolsViewProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const functions = symbols.functions || [];
  const classes = symbols.classes || [];
  const imports = symbols.imports || [];
  const interfaces = symbols.interfaces || [];

  const totalCount = functions.length + classes.length + imports.length + interfaces.length;

  const filteredSymbols = useMemo(() => {
    let list: Array<SymbolItem & { category: string }> = [];

    if (filterType === 'all' || filterType === 'functions') {
      list.push(...functions.map((f) => ({ ...f, category: 'Função / Método' })));
    }
    if (filterType === 'all' || filterType === 'classes') {
      list.push(...classes.map((c) => ({ ...c, category: 'Classe / Struct' })));
    }
    if (filterType === 'all' || filterType === 'imports') {
      list.push(...imports.map((i) => ({ ...i, category: 'Importação' })));
    }
    if (filterType === 'all' || filterType === 'interfaces') {
      list.push(...interfaces.map((i) => ({ ...i, category: 'Interface / Tipo' })));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.signature && s.signature.toLowerCase().includes(q)) ||
          (s.parent && s.parent.toLowerCase().includes(q))
      );
    }

    return list;
  }, [symbols, filterType, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden">
      {/* Top Header */}
      <div className="h-10 px-3 border-b border-slate-800 bg-[#11192e] flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">Símbolos e Declarações do Código</span>
        </div>

        {/* Search */}
        <div className="relative w-52">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Filtrar por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded pl-7 pr-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="px-3 py-2 border-b border-slate-800 bg-[#0d131f] flex items-center gap-2 overflow-x-auto text-xs shrink-0">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1 rounded-md transition font-medium ${
            filterType === 'all'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          Todos ({totalCount})
        </button>

        <button
          onClick={() => setFilterType('functions')}
          className={`px-3 py-1 rounded-md transition font-medium flex items-center gap-1.5 ${
            filterType === 'functions'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Code className="w-3 h-3 text-blue-400" />
          Funções ({functions.length})
        </button>

        <button
          onClick={() => setFilterType('classes')}
          className={`px-3 py-1 rounded-md transition font-medium flex items-center gap-1.5 ${
            filterType === 'classes'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Box className="w-3 h-3 text-amber-400" />
          Classes ({classes.length})
        </button>

        <button
          onClick={() => setFilterType('imports')}
          className={`px-3 py-1 rounded-md transition font-medium flex items-center gap-1.5 ${
            filterType === 'imports'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3 h-3 text-purple-400" />
          Importações ({imports.length})
        </button>
      </div>

      {/* Symbol List Content */}
      <div className="flex-1 overflow-auto p-3 text-xs space-y-2">
        {filteredSymbols.length === 0 ? (
          <div className="text-slate-500 italic p-6 text-center border border-dashed border-slate-800 rounded-lg bg-slate-900/30">
            Nenhum símbolo encontrado para os critérios selecionados.
          </div>
        ) : (
          filteredSymbols.map((sym, idx) => (
            <div
              key={idx}
              className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition flex items-center justify-between"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-cyan-300 font-semibold text-sm">{sym.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                    {sym.category}
                  </span>
                  {sym.parent && (
                    <span className="text-[10px] text-slate-500">Membro de: {sym.parent}</span>
                  )}
                </div>

                {sym.signature && (
                  <div className="font-mono text-slate-400 text-[11px] truncate max-w-xl">
                    {sym.signature}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-slate-500 text-[11px]">
                  Linhas {sym.startLine + 1} - {sym.endLine + 1}
                </span>

                {onJumpToLine && (
                  <button
                    onClick={() => onJumpToLine(sym.startLine)}
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded transition"
                    title="Ir para linha no código"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
