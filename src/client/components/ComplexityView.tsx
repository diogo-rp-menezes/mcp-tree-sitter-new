import React from 'react';
import { BarChart3, AlertTriangle, CheckCircle2, ShieldAlert, BookOpen, Layers } from 'lucide-react';
import { CodeComplexity } from '../types';

interface ComplexityViewProps {
  complexity: CodeComplexity | null;
}

export function ComplexityView({ complexity }: ComplexityViewProps) {
  if (!complexity) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-[#0f172a]">
        Calculando métricas de complexidade do código...
      </div>
    );
  }

  // Assess risk
  const score = complexity.cyclomaticComplexity;
  let riskLevel: 'low' | 'moderate' | 'high' = 'low';
  let riskTitle = 'Código Simples & Manutenível';
  let riskColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60';
  let riskIcon = CheckCircle2;
  let riskDesc =
    'A complexidade ciclomática está em níveis saudáveis (<= 10). O fluxo de controle tem poucos caminhos alternativos e é fácil de testar.';

  if (score > 10 && score <= 20) {
    riskLevel = 'moderate';
    riskTitle = 'Complexidade Moderada';
    riskColor = 'text-amber-400 bg-amber-950/40 border-amber-800/60';
    riskIcon = AlertTriangle;
    riskDesc =
      'O código possui ramificações moderadas (11-20). Considere isolar blocos condicionais aninhados em funções auxiliares menores.';
  } else if (score > 20) {
    riskLevel = 'high';
    riskTitle = 'Complexidade Elevada (Atenção)';
    riskColor = 'text-red-400 bg-red-950/40 border-red-800/60';
    riskIcon = ShieldAlert;
    riskDesc =
      'Alta densidade de desvios condicionais (> 20). Recomenda-se refatorar para diminuir pontos de falha e facilitar cobertura de testes unitários.';
  }

  const RiskIcon = riskIcon;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-auto p-4 space-y-4 text-xs">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Métricas de Complexidade Sintática (AST)
            </h3>
            <p className="text-[11px] text-slate-400">
              Análise estática calculada via contagem de nós de controle de fluxo e árvores de decisão.
            </p>
          </div>
        </div>
      </div>

      {/* Main Risk Status Card */}
      <div className={`p-4 rounded-xl border flex items-start gap-3 ${riskColor}`}>
        <RiskIcon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>{riskTitle}</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-current">
              Score: {complexity.cyclomaticComplexity}
            </span>
          </div>
          <p className="text-slate-300 text-xs leading-relaxed">{riskDesc}</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-medium">Complexidade Ciclomática</div>
          <div className="text-2xl font-bold font-mono text-cyan-400">
            {complexity.cyclomaticComplexity}
          </div>
          <div className="text-[10px] text-slate-500">Pontos de ramificação no AST</div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-medium">Linhas de Código Totais</div>
          <div className="text-2xl font-bold font-mono text-slate-200">{complexity.lineCount}</div>
          <div className="text-[10px] text-slate-500">{complexity.codeLines} linhas executáveis</div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-medium">Funções & Métodos</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {complexity.functionCount}
          </div>
          <div className="text-[10px] text-slate-500">
            Média de {complexity.avgFunctionLines} linhas por função
          </div>
        </div>

        <div className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] font-medium">Densidade de Comentários</div>
          <div className="text-2xl font-bold font-mono text-purple-400">
            {(complexity.commentRatio * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500">{complexity.commentLines} linhas comentadas</div>
        </div>
      </div>

      {/* Code Distribution Bar */}
      <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 space-y-3">
        <h4 className="text-xs font-semibold text-slate-200 flex items-center justify-between">
          <span>Composição Estrutural do Arquivo</span>
          <span className="font-normal text-slate-400 text-[11px]">
            {complexity.codeLines} código · {complexity.commentLines} comentários ·{' '}
            {Math.max(0, complexity.lineCount - complexity.codeLines - complexity.commentLines)} vazias
          </span>
        </h4>

        <div className="h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
          <div
            className="bg-cyan-500 h-full transition-all"
            style={{
              width: `${Math.min(
                100,
                (complexity.codeLines / Math.max(1, complexity.lineCount)) * 100
              )}%`,
            }}
            title={`Código: ${complexity.codeLines} linhas`}
          />
          <div
            className="bg-purple-500 h-full transition-all"
            style={{
              width: `${Math.min(
                100,
                (complexity.commentLines / Math.max(1, complexity.lineCount)) * 100
              )}%`,
            }}
            title={`Comentários: ${complexity.commentLines} linhas`}
          />
        </div>

        <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span>
            <span>Código Executável</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span>Documentação / Comentários</span>
          </div>
        </div>
      </div>

      {/* Educational Guide on AST Metrics */}
      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
        <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
          Como o Tree-sitter calcula a complexidade?
        </h4>
        <p className="text-slate-400 text-xs leading-relaxed">
          Ao contrário de analisadores puramente baseados em texto, o Tree-sitter inspeciona diretamente a árvore
          sintática concreta. Ele detecta nós como <code className="text-cyan-300">if_statement</code>,{' '}
          <code className="text-cyan-300">for_statement</code>, <code className="text-cyan-300">while_statement</code>,{' '}
          <code className="text-cyan-300">catch_clause</code> e operadores lógicos booleanos, mapeando caminhos
          independentes de execução de forma determinística independente da linguagem utilizada.
        </p>
      </div>
    </div>
  );
}
