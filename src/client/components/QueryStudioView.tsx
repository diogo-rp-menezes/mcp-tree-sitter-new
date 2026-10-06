import React from 'react';
import { Search, Play, BookOpen, Sparkles, Filter, Code } from 'lucide-react';
import { QueryMatch } from '../types';

interface QueryStudioViewProps {
  language: string;
  queryInput: string;
  queryMatches: QueryMatch[];
  templates: Record<string, Record<string, string>>;
  selectedTemplate: string;
  loading: boolean;
  errorMsg: string | null;
  onChangeQuery: (q: string) => void;
  onSelectTemplate: (t: string) => void;
  onRunQuery: () => void;
}

const TEMPLATE_NAMES_MAP: Record<string, string> = {
  functions: 'Todas as Funções e Métodos',
  classes: 'Todas as Classes e Estruturas',
  imports: 'Declarações de Importação',
  calls: 'Chamadas de Função (Invocations)',
  comments: 'Comentários no Código',
  errors: 'Nós com Erros de Sintaxe (ERROR)',
  interfaces: 'Interfaces e Tipos',
};

export function QueryStudioView({
  language,
  queryInput,
  queryMatches,
  templates,
  selectedTemplate,
  loading,
  errorMsg,
  onChangeQuery,
  onSelectTemplate,
  onRunQuery,
}: QueryStudioViewProps) {
  const availableTemplates = templates[language] || templates['python'] || {};

  const handleQuickInsert = (snippet: string) => {
    onChangeQuery(queryInput + '\n' + snippet);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden">
      {/* Query Studio Header */}
      <div className="h-10 px-3 border-b border-slate-800 bg-[#11192e] flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">Query Studio (Tree-sitter S-Expressions)</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs hidden sm:inline">Modelos Prontos:</span>
          <select
            value={selectedTemplate}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          >
            {Object.keys(availableTemplates).map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_NAMES_MAP[t] || t}
              </option>
            ))}
          </select>

          <button
            onClick={onRunQuery}
            disabled={loading}
            className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Executar Consulta</span>
          </button>
        </div>
      </div>

      {/* Query Input Editor */}
      <div className="h-48 border-b border-slate-800 bg-[#0d131f] p-3 flex flex-col shrink-0">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
          <span className="flex items-center gap-1.5 font-medium text-slate-300">
            <Code className="w-3.5 h-3.5 text-cyan-400" />
            Consulta S-Expression:
          </span>

          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-slate-400">Atalhos rápidos:</span>
            <button
              onClick={() => handleQuickInsert('(identifier) @name')}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 transition"
            >
              @name
            </button>
            <button
              onClick={() => handleQuickInsert('(parameters) @params')}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 transition"
            >
              @params
            </button>
            <button
              onClick={() => handleQuickInsert('(#eq? @name "foo")')}
              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 transition"
            >
              #eq?
            </button>
          </div>
        </div>

        <textarea
          value={queryInput}
          onChange={(e) => onChangeQuery(e.target.value)}
          className="flex-1 bg-slate-950 text-slate-100 p-2.5 rounded-lg border border-slate-800 resize-none font-mono text-xs focus:outline-none focus:border-cyan-500/60 leading-5"
          spellCheck={false}
        />
      </div>

      {/* Query Matches View */}
      <div className="flex-1 overflow-auto p-3 text-xs">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            Resultados Encontrados ({queryMatches.length})
          </h4>
        </div>

        {errorMsg && (
          <div className="p-3 mb-3 bg-red-950/40 border border-red-800/60 rounded-lg text-red-300 text-xs">
            {errorMsg}
          </div>
        )}

        {queryMatches.length === 0 ? (
          <div className="text-slate-500 italic p-6 text-center border border-dashed border-slate-800 rounded-lg bg-slate-900/30">
            Nenhum resultado capturado ou consulta ainda não executada. Clique em "Executar Consulta" acima.
          </div>
        ) : (
          <div className="space-y-2.5">
            {queryMatches.map((match, idx) => (
              <div
                key={idx}
                className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-300">Ocorrência #{idx + 1}</span>
                    {match.captures[0] && (
                      <span className="text-[11px] text-slate-400">
                        Linha {match.captures[0].startPoint.row + 1}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    {match.captures.map((cap, cIdx) => (
                      <span
                        key={cIdx}
                        className="px-2 py-0.5 rounded text-[11px] bg-cyan-950 border border-cyan-800/80 text-cyan-300 font-mono"
                      >
                        @{cap.capture}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Capture details */}
                <div className="space-y-1.5">
                  {match.captures.map((cap, cIdx) => (
                    <div
                      key={cIdx}
                      className="bg-slate-950 p-2 rounded border border-slate-850 flex items-start gap-2 font-mono text-[11px]"
                    >
                      <span className="text-amber-400 font-semibold shrink-0">@{cap.capture}:</span>
                      <span className="text-emerald-300 break-all flex-1">{cap.text}</span>
                      <span className="text-slate-400 shrink-0 text-[10px]">
                        L{cap.startPoint.row + 1}:C{cap.startPoint.column}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
