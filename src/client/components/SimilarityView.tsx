import React from 'react';
import { GitCompare, Search, Sliders, CheckCircle, FileCode, Play } from 'lucide-react';

interface SimilarityViewProps {
  similaritySnippet: string;
  similarityResults: any[];
  similarityThreshold: number;
  loading: boolean;
  onChangeSnippet: (snip: string) => void;
  onChangeThreshold: (val: number) => void;
  onRunSimilarity: () => void;
}

const SAMPLE_SIMILARITY_SNIPPETS = [
  {
    label: 'Loop com Acumulação',
    code: `def process_items(items):\n    out = []\n    for x in items:\n        out.append(x.upper())\n    return out`,
  },
  {
    label: 'Classe com Construtor',
    code: `class DataManager:\n    def __init__(self, name):\n        self.name = name\n        self.items = []`,
  },
  {
    label: 'Função com Validação Condicional',
    code: `def validate(data):\n    if not data:\n        return False\n    return len(data) > 0`,
  },
];

export function SimilarityView({
  similaritySnippet,
  similarityResults,
  similarityThreshold,
  loading,
  onChangeSnippet,
  onChangeThreshold,
  onRunSimilarity,
}: SimilarityViewProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden">
      {/* Header */}
      <div className="h-10 px-3 border-b border-slate-800 bg-[#11192e] flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">
            Similaridade Estrutural por Fingerprint AST (Jaccard)
          </span>
        </div>

        <button
          onClick={onRunSimilarity}
          disabled={loading}
          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Buscar Semelhanças</span>
        </button>
      </div>

      {/* Snippet Input & Threshold Settings */}
      <div className="p-3 border-b border-slate-800 bg-[#0d131f] space-y-3 shrink-0">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-medium text-slate-300">
            Trecho Alvo para Comparação Estrutural com os Arquivos do Projeto:
          </span>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Exemplos rápidos:</span>
            {SAMPLE_SIMILARITY_SNIPPETS.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => onChangeSnippet(sample.code)}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 text-[10px] transition"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={similaritySnippet}
          onChange={(e) => onChangeSnippet(e.target.value)}
          className="w-full h-24 bg-slate-950 font-mono text-xs p-2.5 rounded-lg border border-slate-800 text-slate-200 resize-none focus:outline-none focus:border-cyan-500/60 leading-5"
          spellCheck={false}
        />

        {/* Threshold Slider */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-3">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 text-[11px]">Limiar de Similaridade Mínima:</span>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={similarityThreshold}
              onChange={(e) => onChangeThreshold(Number(e.target.value))}
              className="w-32 accent-cyan-500 cursor-pointer"
            />
            <span className="font-mono text-cyan-300 font-semibold text-xs">
              {(similarityThreshold * 100).toFixed(0)}%
            </span>
          </div>

          <div className="text-[11px] text-slate-500">
            Compara n-grams de tipos de nós AST entre subárvores.
          </div>
        </div>
      </div>

      {/* Results View */}
      <div className="flex-1 overflow-auto p-3 text-xs space-y-2">
        <h4 className="font-semibold text-slate-200 flex items-center justify-between">
          <span>Blocos Estruturalmente Similares ({similarityResults.length})</span>
          <span className="font-normal text-slate-400 text-[11px]">
            Classificados por coeficiente Jaccard
          </span>
        </h4>

        {similarityResults.length === 0 ? (
          <div className="text-slate-500 italic p-6 text-center border border-dashed border-slate-800 rounded-lg bg-slate-900/30">
            Nenhum bloco encontrado com índice acima de {(similarityThreshold * 100).toFixed(0)}%. Clique
            em "Buscar Semelhanças" para escanear os arquivos do projeto.
          </div>
        ) : (
          similarityResults.map((r, idx) => {
            const pct = Math.round(r.score * 100);
            let badgeBg = 'bg-emerald-950 text-emerald-300 border-emerald-800';
            if (pct < 70) badgeBg = 'bg-cyan-950 text-cyan-300 border-cyan-800';
            if (pct < 50) badgeBg = 'bg-amber-950 text-amber-300 border-amber-800';

            return (
              <div
                key={idx}
                className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-mono text-cyan-300 font-semibold text-xs">{r.filePath}</span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      (Linhas {r.lineStart + 1} a {r.lineEnd + 1})
                    </span>
                  </div>

                  <span className={`px-2 py-0.5 rounded font-mono text-[11px] border ${badgeBg}`}>
                    {pct}% Similaridade
                  </span>
                </div>

                <pre className="bg-slate-950 p-2.5 rounded border border-slate-850 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre">
                  {r.matchedSnippet}
                </pre>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
