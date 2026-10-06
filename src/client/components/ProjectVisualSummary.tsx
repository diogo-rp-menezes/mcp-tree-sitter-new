import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { PieChart as PieIcon, BarChart3, Activity, ShieldCheck, FileCode } from 'lucide-react';
import { ProjectOverview } from '../types';

export interface FileStat {
  fileName: string;
  language: string;
  lines: number;
  codeLines: number;
  commentLines: number;
  complexity: number;
  functions: number;
  classes: number;
}

interface ProjectVisualSummaryProps {
  projectOverviews: ProjectOverview[];
  activeProject: string;
}

const LANGUAGE_COLORS: Record<string, string> = {
  python: '#0284c7', // Sky
  typescript: '#06b6d4', // Cyan
  javascript: '#38bdf8', // Light Cyan
  go: '#10b981', // Emerald
  rust: '#f97316', // Orange
  java: '#ef4444', // Red
  cpp: '#a855f7', // Purple
  c: '#8b5cf6', // Violet
  markdown: '#64748b', // Slate
  json: '#eab308', // Amber
  unknown: '#475569',
};

export function ProjectVisualSummary({
  projectOverviews,
  activeProject,
}: ProjectVisualSummaryProps) {
  const [activeChart, setActiveChart] = useState<'languages' | 'complexity'>('languages');
  const [fileStats, setFileStats] = useState<FileStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  // Fetch detailed per-file stats for the active workspace
  useEffect(() => {
    if (!activeProject) return;

    let isMounted = true;
    setLoadingStats(true);

    fetch(`/api/projects/${encodeURIComponent(activeProject)}/file-stats`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FileStat[]) => {
        if (isMounted) {
          setFileStats(data);
          setLoadingStats(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoadingStats(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeProject]);

  // Aggregate language distribution across all projects or active project
  const currentProjectOverview = projectOverviews.find((p) => p.name === activeProject);

  const languagePieData = React.useMemo(() => {
    if (!currentProjectOverview || !currentProjectOverview.languages) return [];
    return currentProjectOverview.languages.map((l) => ({
      name: l.language.toUpperCase(),
      value: l.count,
      percentage: l.percentage,
      color: LANGUAGE_COLORS[l.language.toLowerCase()] || '#06b6d4',
    }));
  }, [currentProjectOverview]);

  // Format data for complexity and line volume bar chart
  const barChartData = React.useMemo(() => {
    return fileStats.map((f) => ({
      name: f.fileName.length > 18 ? `...${f.fileName.slice(-15)}` : f.fileName,
      fullName: f.fileName,
      language: f.language,
      codeLines: f.codeLines,
      commentLines: f.commentLines,
      complexity: f.complexity,
      functions: f.functions,
    }));
  }, [fileStats]);

  // Custom Dark Tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0b0f19] border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 mb-1">
            {payload[0]?.payload?.fullName || label || payload[0]?.name}
          </div>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 text-[11px]">
              <span className="flex items-center gap-1.5" style={{ color: entry.color || entry.fill }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                {entry.name}:
              </span>
              <span className="font-bold text-slate-200 tabular-nums">
                {entry.value} {entry.payload?.percentage ? `(${entry.payload.percentage}%)` : ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
      {/* Top Header with Chart View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h4 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Resumo Visual do Workspace: <span className="text-cyan-400 font-mono">{activeProject}</span>
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Métricas de distribuição de arquivos e complexidade sintática (Tree-sitter)
          </p>
        </div>

        {/* Chart View Toggle Controls */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveChart('languages')}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
              activeChart === 'languages'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>Tipos & Linguagens</span>
          </button>

          <button
            onClick={() => setActiveChart('complexity')}
            className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
              activeChart === 'complexity'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Complexidade & LOC</span>
          </button>
        </div>
      </div>

      {/* Chart 1: Language & File Type Distribution */}
      {activeChart === 'languages' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="h-64 w-full flex items-center justify-center">
            {languagePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomTooltip />} />
                  <Pie
                    data={languagePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {languagePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span className="text-slate-300 font-mono text-xs uppercase">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-500 text-xs italic text-center">
                Nenhum arquivo cadastrado neste projeto para gerar gráfico de distribuição.
              </div>
            )}
          </div>

          {/* Mini KPI row for languages */}
          {languagePieData.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80">
              {languagePieData.map((l) => (
                <div key={l.name} className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="font-mono text-xs text-slate-300">{l.name}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-100 tabular-nums">
                    {l.percentage}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart 2: Code Complexity & Lines per File */}
      {activeChart === 'complexity' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="h-64 w-full">
            {loadingStats ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                Calculando complexidade ciclomática e linhas de código...
              </div>
            ) : barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={11}
                    fontFamily="JetBrains Mono"
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    fontFamily="JetBrains Mono"
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '10px' }}
                    formatter={(value) => {
                      if (value === 'codeLines') return <span className="text-slate-300 text-xs">Linhas de Código</span>;
                      if (value === 'complexity') return <span className="text-slate-300 text-xs">Complexidade Ciclomática</span>;
                      if (value === 'commentLines') return <span className="text-slate-300 text-xs">Comentários</span>;
                      return value;
                    }}
                  />
                  <Bar dataKey="codeLines" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="complexity" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="commentLines" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">
                Nenhum arquivo analisado para compor métricas de complexidade.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
            <span>Valores calculados em tempo real pela árvore sintática do Tree-sitter.</span>
            <span className="font-mono text-cyan-400">Score &le; 10: Baixo Risco · 11-20: Moderado · &gt;20: Atenção</span>
          </div>
        </div>
      )}
    </div>
  );
}
