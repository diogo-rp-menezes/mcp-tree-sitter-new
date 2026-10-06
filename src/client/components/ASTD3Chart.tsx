import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { BarChart3, PieChart, Info, Filter, Sparkles, X } from 'lucide-react';
import { ASTNode } from '../types';

interface NodeTypeStat {
  type: string;
  count: number;
  percentage: number;
  category: 'definition' | 'statement' | 'expression' | 'identifier' | 'other';
  color: string;
}

interface ASTD3ChartProps {
  ast: ASTNode | null;
  onSelectNodeType?: (type: string) => void;
  selectedType?: string | null;
  onClose?: () => void;
}

// Categorize AST node types into meaningful buckets with distinctive colors
function categorizeNodeType(type: string): { category: NodeTypeStat['category']; color: string } {
  const lower = type.toLowerCase();
  if (lower.includes('definition') || lower.includes('declaration') || lower.includes('class') || lower.includes('function')) {
    return { category: 'definition', color: '#38bdf8' }; // Sky blue
  }
  if (lower.includes('statement') || lower.includes('block') || lower.includes('return') || lower.includes('if') || lower.includes('for') || lower.includes('while') || lower.includes('try')) {
    return { category: 'statement', color: '#c084fc' }; // Purple
  }
  if (lower.includes('expression') || lower.includes('call') || lower.includes('binary') || lower.includes('operator') || lower.includes('assignment')) {
    return { category: 'expression', color: '#34d399' }; // Emerald
  }
  if (lower.includes('identifier') || lower.includes('string') || lower.includes('integer') || lower.includes('float') || lower.includes('literal') || lower.includes('name')) {
    return { category: 'identifier', color: '#fbbf24' }; // Amber
  }
  return { category: 'other', color: '#94a3b8' }; // Slate
}

export function ASTD3Chart({ ast, onSelectNodeType, selectedType, onClose }: ASTD3ChartProps) {
  const [chartMode, setChartMode] = useState<'bars' | 'donut'>('bars');
  const [hoveredType, setHoveredType] = useState<NodeTypeStat | null>(null);
  const [topCount, setTopCount] = useState<number>(10);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Traverse AST and calculate frequencies
  const { stats, totalNodes, uniqueTypesCount } = useMemo(() => {
    if (!ast) return { stats: [], totalNodes: 0, uniqueTypesCount: 0 };

    const counts = new Map<string, number>();
    let total = 0;

    function traverse(node: ASTNode) {
      total++;
      counts.set(node.type, (counts.get(node.type) || 0) + 1);
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }

    traverse(ast);

    const list: NodeTypeStat[] = Array.from(counts.entries())
      .map(([type, count]) => {
        const { category, color } = categorizeNodeType(type);
        return {
          type,
          count,
          percentage: (count / total) * 100,
          category,
          color,
        };
      })
      .sort((a, b) => b.count - a.count);

    return { stats: list, totalNodes: total, uniqueTypesCount: list.length };
  }, [ast]);

  const displayedStats = useMemo(() => {
    return stats.slice(0, topCount);
  }, [stats, topCount]);

  // Render D3 chart whenever displayedStats, chartMode, or selectedType changes
  useEffect(() => {
    if (!svgRef.current || displayedStats.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 580;
    const height = 230;

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', '100%');

    if (chartMode === 'bars') {
      // --- D3 HORIZONTAL BAR CHART ---
      const margin = { top: 12, right: 65, bottom: 20, left: 140 };
      const innerWidth = width - margin.left - margin.right;
      const innerHeight = height - margin.top - margin.bottom;

      const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

      const yScale = d3
        .scaleBand()
        .domain(displayedStats.map((d) => d.type))
        .range([0, innerHeight])
        .padding(0.24);

      const maxVal = d3.max(displayedStats, (d) => d.count) || 1;
      const xScale = d3.scaleLinear().domain([0, maxVal * 1.15]).range([0, innerWidth]);

      // Gridlines
      g.append('g')
        .attr('class', 'grid')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(
          d3
            .axisBottom(xScale)
            .ticks(5)
            .tickSize(-innerHeight)
            .tickFormat(() => '')
        )
        .selectAll('line')
        .attr('stroke', '#1e293b')
        .attr('stroke-dasharray', '2,2');

      // Bars
      const bars = g
        .selectAll('.bar')
        .data(displayedStats)
        .enter()
        .append('g')
        .attr('class', 'bar-group')
        .style('cursor', 'pointer')
        .on('mouseenter', (event, d) => setHoveredType(d))
        .on('mouseleave', () => setHoveredType(null))
        .on('click', (event, d) => onSelectNodeType && onSelectNodeType(d.type));

      // Bar rectangle with rounded corners
      bars
        .append('rect')
        .attr('y', (d) => yScale(d.type) || 0)
        .attr('height', yScale.bandwidth())
        .attr('x', 0)
        .attr('width', 0) // animate
        .attr('rx', 4)
        .attr('fill', (d) => (selectedType === d.type ? '#38bdf8' : d.color))
        .attr('fill-opacity', (d) => (selectedType && selectedType !== d.type ? 0.35 : 0.85))
        .attr('stroke', (d) => (selectedType === d.type ? '#e0f2fe' : 'none'))
        .attr('stroke-width', 1.5)
        .transition()
        .duration(400)
        .attr('width', (d) => xScale(d.count));

      // Bar count label
      bars
        .append('text')
        .attr('y', (d) => (yScale(d.type) || 0) + yScale.bandwidth() / 2)
        .attr('x', (d) => xScale(d.count) + 6)
        .attr('dy', '0.35em')
        .attr('fill', '#94a3b8')
        .attr('font-size', '10px')
        .attr('font-family', 'monospace')
        .text((d) => `${d.count} (${d.percentage.toFixed(0)}%)`);

      // Y Axis labels (Node Types)
      g.append('g')
        .call(d3.axisLeft(yScale))
        .call((axis) => axis.select('.domain').remove())
        .call((axis) => axis.selectAll('.tick line').remove())
        .selectAll('text')
        .attr('fill', (d) => (selectedType === d ? '#38bdf8' : '#cbd5e1'))
        .attr('font-family', 'monospace')
        .attr('font-size', '10px')
        .attr('font-weight', (d) => (selectedType === d ? 'bold' : 'normal'))
        .style('cursor', 'pointer')
        .on('click', (event, d) => onSelectNodeType && onSelectNodeType(d as string));
    } else {
      // --- D3 DONUT PIE CHART ---
      const radius = Math.min(width, height) / 2 - 16;
      const g = svg.append('g').attr('transform', `translate(${width / 2 - 40},${height / 2})`);

      const pie = d3
        .pie<NodeTypeStat>()
        .value((d) => d.count)
        .sort(null);

      const arc = d3
        .arc<d3.PieArcDatum<NodeTypeStat>>()
        .innerRadius(radius * 0.52)
        .outerRadius(radius);

      const hoverArc = d3
        .arc<d3.PieArcDatum<NodeTypeStat>>()
        .innerRadius(radius * 0.5)
        .outerRadius(radius * 1.08);

      const arcs = g
        .selectAll('.arc')
        .data(pie(displayedStats))
        .enter()
        .append('g')
        .attr('class', 'arc')
        .style('cursor', 'pointer')
        .on('mouseenter', (event, d) => setHoveredType(d.data))
        .on('mouseleave', () => setHoveredType(null))
        .on('click', (event, d) => onSelectNodeType && onSelectNodeType(d.data.type));

      arcs
        .append('path')
        .attr('d', arc)
        .attr('fill', (d) => (selectedType === d.data.type ? '#38bdf8' : d.data.color))
        .attr('fill-opacity', (d) => (selectedType && selectedType !== d.data.type ? 0.35 : 0.85))
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 2)
        .on('mouseover', function () {
          d3.select(this).transition().duration(150).attr('d', hoverArc as any);
        })
        .on('mouseout', function () {
          d3.select(this).transition().duration(150).attr('d', arc as any);
        });

      // Center summary text
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.3em')
        .attr('fill', '#f1f5f9')
        .attr('font-size', '16px')
        .attr('font-weight', 'bold')
        .attr('font-family', 'monospace')
        .text(totalNodes);

      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('fill', '#64748b')
        .attr('font-size', '10px')
        .text('Nós na AST');

      // Right Side Compact Legend
      const legendG = svg.append('g').attr('transform', `translate(${width - 150}, 20)`);

      displayedStats.slice(0, 7).forEach((item, idx) => {
        const row = legendG
          .append('g')
          .attr('transform', `translate(0, ${idx * 24})`)
          .style('cursor', 'pointer')
          .on('click', () => onSelectNodeType && onSelectNodeType(item.type));

        row
          .append('rect')
          .attr('width', 8)
          .attr('height', 8)
          .attr('rx', 2)
          .attr('fill', item.color);

        row
          .append('text')
          .attr('x', 14)
          .attr('y', 8)
          .attr('fill', selectedType === item.type ? '#38bdf8' : '#94a3b8')
          .attr('font-size', '9px')
          .attr('font-family', 'monospace')
          .text(`${item.type.slice(0, 14)} (${item.percentage.toFixed(0)}%)`);
      });
    }
  }, [displayedStats, chartMode, selectedType]);

  if (!ast) return null;

  return (
    <div
      ref={containerRef}
      className="bg-slate-900/95 border-b border-slate-800 p-4 space-y-3 relative text-xs animate-in fade-in duration-150"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-cyan-950/80 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-200 flex items-center gap-2">
              Distribuição de Tipos de Nós (Visualização D3)
            </h4>
            <p className="text-[11px] text-slate-400">
              {totalNodes} nós totais · {uniqueTypesCount} tipos sintáticos únicos identificados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chart mode toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setChartMode('bars')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition ${
                chartMode === 'bars'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Gráfico de Barras D3"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Barras</span>
            </button>
            <button
              onClick={() => setChartMode('donut')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition ${
                chartMode === 'donut'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Gráfico de Rosca D3"
            >
              <PieChart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rosca</span>
            </button>
          </div>

          {/* Top 5 / 10 / All selector */}
          <select
            value={topCount}
            onChange={(e) => setTopCount(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-cyan-500 font-mono"
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
            <option value={50}>Todos</option>
          </select>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
              title="Ocultar visualização D3"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* D3 Canvas Container */}
      <div className="bg-[#0b0f19] border border-slate-800/80 rounded-xl p-2 relative flex items-center justify-center min-h-[230px]">
        <svg ref={svgRef} className="w-full h-[230px]" />

        {/* Hover detail tooltip card */}
        {hoveredType && (
          <div className="absolute top-2 left-2 bg-slate-950/95 border border-cyan-500/40 rounded-lg p-2 text-xs font-mono shadow-xl pointer-events-none backdrop-blur-xs flex items-center gap-3 animate-in fade-in duration-100">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: hoveredType.color }}
            />
            <div>
              <div className="font-bold text-slate-100">{hoveredType.type}</div>
              <div className="text-[10px] text-slate-400">
                {hoveredType.count} ocorrência(s) · {hoveredType.percentage.toFixed(1)}% do código
              </div>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">
              {hoveredType.category}
            </span>
          </div>
        )}
      </div>

      {/* Interactive Helper / Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#38bdf8]" /> Definições
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#c084fc]" /> Comandos / Fluxo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#34d399]" /> Expressões
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#fbbf24]" /> Identificadores
          </span>
        </div>

        <span className="text-[10px] text-slate-500 italic">
          Dica: Clique em qualquer barra ou fatia para filtrar os nós correspondentes na árvore AST.
        </span>
      </div>
    </div>
  );
}
