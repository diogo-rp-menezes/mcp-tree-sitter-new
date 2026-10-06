import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  ChevronRight,
  GitBranch,
  Grid,
  Info,
  Sparkles,
  Layers,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { ASTNode } from '../types';

export type VisualizerMode = 'tree' | 'treemap';

interface ASTD3VisualizerProps {
  ast: ASTNode | null;
  selectedNode: ASTNode | null;
  maxDepth?: number;
  searchTerm?: string;
  mode: VisualizerMode;
  onSelectNode: (node: ASTNode) => void;
  onModeChange?: (mode: VisualizerMode) => void;
}

// Category palette mapping
export function getNodeCategory(type: string): {
  category: 'definition' | 'statement' | 'expression' | 'identifier' | 'comment' | 'other';
  color: string;
  fillColor: string;
  bgClass: string;
} {
  const lower = type.toLowerCase();
  if (
    lower.includes('definition') ||
    lower.includes('declaration') ||
    lower.includes('class') ||
    lower.includes('function') ||
    lower.includes('method') ||
    lower.includes('struct') ||
    lower.includes('interface')
  ) {
    return {
      category: 'definition',
      color: '#38bdf8', // Sky 400
      fillColor: 'rgba(56, 189, 248, 0.18)',
      bgClass: 'text-sky-400 bg-sky-950/40 border-sky-800/40',
    };
  }
  if (
    lower.includes('statement') ||
    lower.includes('block') ||
    lower.includes('return') ||
    lower.includes('if') ||
    lower.includes('for') ||
    lower.includes('while') ||
    lower.includes('try') ||
    lower.includes('clause') ||
    lower.includes('import') ||
    lower.includes('module') ||
    lower.includes('program') ||
    lower.includes('source_file')
  ) {
    return {
      category: 'statement',
      color: '#c084fc', // Purple 400
      fillColor: 'rgba(192, 132, 252, 0.18)',
      bgClass: 'text-purple-400 bg-purple-950/40 border-purple-800/40',
    };
  }
  if (
    lower.includes('expression') ||
    lower.includes('call') ||
    lower.includes('binary') ||
    lower.includes('operator') ||
    lower.includes('assignment') ||
    lower.includes('argument') ||
    lower.includes('parameter')
  ) {
    return {
      category: 'expression',
      color: '#34d399', // Emerald 400
      fillColor: 'rgba(52, 211, 153, 0.18)',
      bgClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40',
    };
  }
  if (
    lower.includes('identifier') ||
    lower.includes('string') ||
    lower.includes('integer') ||
    lower.includes('float') ||
    lower.includes('number') ||
    lower.includes('literal') ||
    lower.includes('name') ||
    lower.includes('pair')
  ) {
    return {
      category: 'identifier',
      color: '#fbbf24', // Amber 400
      fillColor: 'rgba(251, 191, 36, 0.18)',
      bgClass: 'text-amber-400 bg-amber-950/40 border-amber-800/40',
    };
  }
  if (lower.includes('comment')) {
    return {
      category: 'comment',
      color: '#94a3b8', // Slate 400
      fillColor: 'rgba(148, 163, 184, 0.15)',
      bgClass: 'text-slate-400 bg-slate-900 border-slate-800',
    };
  }
  return {
    category: 'other',
    color: '#818cf8', // Indigo 400
    fillColor: 'rgba(129, 140, 248, 0.18)',
    bgClass: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/40',
  };
}

export function ASTD3Visualizer({
  ast,
  selectedNode,
  maxDepth = 5,
  searchTerm = '',
  mode = 'tree',
  onSelectNode,
  onModeChange,
}: ASTD3VisualizerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef = useRef<SVGGElement | null>(null);

  // Collapsed node IDs in Tree mode
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  // Treemap drilldown root
  const [treemapRootNode, setTreemapRootNode] = useState<ASTNode | null>(null);
  // Hovered node for detailed tooltip card
  const [hoveredNode, setHoveredNode] = useState<{
    node: ASTNode;
    x: number;
    y: number;
  } | null>(null);

  // Sync drilldown root when ast changes
  useEffect(() => {
    setTreemapRootNode(ast);
    setCollapsedIds(new Set());
  }, [ast]);

  // Handle drilldown navigation path for Treemap
  const treemapBreadcrumb = useMemo(() => {
    if (!ast || !treemapRootNode) return [];
    if (ast.id === treemapRootNode.id) return [{ node: ast, label: ast.type }];

    const path: ASTNode[] = [];
    function findPath(current: ASTNode, targetId: string): boolean {
      path.push(current);
      if (current.id === targetId) return true;
      if (current.children) {
        for (const child of current.children) {
          if (findPath(child, targetId)) return true;
        }
      }
      path.pop();
      return false;
    }

    findPath(ast, treemapRootNode.id);
    return path.map((n) => ({
      node: n,
      label: n.field ? `${n.field}: ${n.type}` : n.type,
    }));
  }, [ast, treemapRootNode]);

  // Toggle collapse on tree node
  const handleToggleCollapse = useCallback((nodeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Collapse / Expand All
  const handleExpandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const handleCollapseToDepth = useCallback(
    (depthLimit: number) => {
      if (!ast) return;
      const idsToCollapse = new Set<string>();
      function traverse(n: ASTNode, currentDepth: number) {
        if (currentDepth >= depthLimit && n.children && n.children.length > 0) {
          idsToCollapse.add(n.id);
        }
        if (n.children) {
          for (const child of n.children) {
            traverse(child, currentDepth + 1);
          }
        }
      }
      traverse(ast, 0);
      setCollapsedIds(idsToCollapse);
    },
    [ast]
  );

  // Zoom controls
  const handleZoomIn = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomBehaviorRef.current) {
      d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.7);
    }
  };

  const handleResetZoom = () => {
    if (svgRef.current && zoomBehaviorRef.current && containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      d3.select(svgRef.current)
        .transition()
        .duration(350)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(mode === 'tree' ? 60 : 20, mode === 'tree' ? height / 2 : 20).scale(1)
        );
    }
  };

  const handleFitToScreen = () => {
    if (!svgRef.current || !gRef.current || !containerRef.current || !zoomBehaviorRef.current) return;
    const gEl = gRef.current;
    const bbox = gEl.getBBox();
    const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();

    if (bbox.width === 0 || bbox.height === 0) return;

    const padding = 40;
    const scale = Math.min(
      (containerWidth - padding * 2) / bbox.width,
      (containerHeight - padding * 2) / bbox.height,
      1.5
    );
    const clampedScale = Math.max(0.15, Math.min(scale, 1.2));

    const tx = (containerWidth - bbox.width * clampedScale) / 2 - bbox.x * clampedScale;
    const ty = (containerHeight - bbox.height * clampedScale) / 2 - bbox.y * clampedScale;

    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(clampedScale));
  };

  // --- RENDER D3 HIERARCHICAL TREE ---
  useEffect(() => {
    if (mode !== 'tree' || !ast || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create main container group
    const g = svg.append('g').attr('class', 'tree-viewport');
    gRef.current = g.node() as SVGGElement;

    // Setup zoom
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Initial transform: centered vertically with left margin
    svg.call(zoom.transform, d3.zoomIdentity.translate(60, height / 2).scale(0.85));

    // Build hierarchy with collapsing logic
    const root = d3.hierarchy<ASTNode>(ast, (d) => {
      if (collapsedIds.has(d.id)) return null;
      return d.children && d.children.length > 0 ? d.children : null;
    });

    // Compute dynamic tree layout spacing based on total visible nodes
    const visibleCount = root.descendants().length;
    const dx = Math.max(38, Math.min(60, height / (visibleCount || 1)));
    const dy = 210; // Horizontal spacing between levels

    const treeLayout = d3.tree<ASTNode>().nodeSize([dx, dy]);
    treeLayout(root);

    // Render links
    const linkGenerator = d3
      .linkHorizontal<any, d3.HierarchyPointNode<ASTNode>>()
      .x((d) => d.y)
      .y((d) => d.x);

    const linkGroup = g.append('g').attr('class', 'links').attr('fill', 'none');

    linkGroup
      .selectAll('path')
      .data(root.links())
      .join('path')
      .attr('d', linkGenerator)
      .attr('stroke', (d) => {
        if (selectedNode && (d.source.data.id === selectedNode.id || d.target.data.id === selectedNode.id)) {
          return '#38bdf8'; // Active branch highlight
        }
        return '#334155'; // Slate 700
      })
      .attr('stroke-width', (d) => {
        if (selectedNode && (d.source.data.id === selectedNode.id || d.target.data.id === selectedNode.id)) {
          return 2;
        }
        return 1.25;
      })
      .attr('stroke-opacity', 0.6)
      .attr('stroke-dasharray', (d) => (d.target.data.isNamed ? 'none' : '3,3'));

    // Render nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const nodes = nodeGroup
      .selectAll<SVGGElement, d3.HierarchyPointNode<ASTNode>>('g.node')
      .data(root.descendants(), (d) => (d as any).data.id)
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer');

    // Node interactive event handlers
    nodes
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelectNode(d.data);
      })
      .on('mouseenter', (event, d) => {
        const rect = container.getBoundingClientRect();
        setHoveredNode({
          node: d.data,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      });

    // Glowing selection ring
    nodes
      .filter((d) => selectedNode?.id === d.data.id)
      .append('circle')
      .attr('r', 16)
      .attr('fill', 'none')
      .attr('stroke', '#38bdf8')
      .attr('stroke-width', 2.5)
      .attr('stroke-opacity', 0.9)
      .attr('class', 'animate-pulse');

    // Search match highlight ring
    if (searchTerm.trim().length > 0) {
      const term = searchTerm.toLowerCase();
      nodes
        .filter(
          (d) =>
            d.data.type.toLowerCase().includes(term) ||
            (d.data.field && d.data.field.toLowerCase().includes(term)) ||
            (d.data.text && d.data.text.toLowerCase().includes(term))
        )
        .append('circle')
        .attr('r', 13)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '2,2');
    }

    // Node Circle
    nodes.each(function (d) {
      const nodeEl = d3.select(this);
      const { color } = getNodeCategory(d.data.type);
      const isSelected = selectedNode?.id === d.data.id;
      const hasChildren = d.data.children && d.data.children.length > 0;
      const isCollapsed = collapsedIds.has(d.data.id);

      // Main circle
      nodeEl
        .append('circle')
        .attr('r', hasChildren ? 7.5 : 5)
        .attr('fill', isCollapsed ? color : isSelected ? '#38bdf8' : '#0f172a')
        .attr('stroke', color)
        .attr('stroke-width', isSelected ? 2.5 : 1.75);

      // Child counter badge or collapse indicator
      if (hasChildren) {
        nodeEl
          .append('circle')
          .attr('r', 3)
          .attr('fill', isCollapsed ? '#0f172a' : color)
          .attr('pointer-events', 'all')
          .on('click', (event) => {
            event.stopPropagation();
            handleToggleCollapse(d.data.id);
          });
      }
    });

    // Node Labels
    nodes.each(function (d) {
      const nodeEl = d3.select(this);
      const { color } = getNodeCategory(d.data.type);
      const isSelected = selectedNode?.id === d.data.id;
      const hasChildren = d.data.children && d.data.children.length > 0;
      const isCollapsed = collapsedIds.has(d.data.id);

      const textGroup = nodeEl
        .append('text')
        .attr('dy', '0.35em')
        .attr('x', hasChildren && !isCollapsed ? -12 : 12)
        .attr('text-anchor', hasChildren && !isCollapsed ? 'end' : 'start')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '11px')
        .attr('fill', isSelected ? '#f8fafc' : '#e2e8f0');

      // Field label prefix if present
      if (d.data.field) {
        textGroup
          .append('tspan')
          .attr('fill', '#fbbf24')
          .attr('font-weight', '500')
          .text(`${d.data.field}: `);
      }

      // Type label
      textGroup
        .append('tspan')
        .attr('fill', color)
        .attr('font-weight', isSelected ? '700' : '600')
        .text(d.data.type);

      // Truncated text preview for leaf tokens or small expressions
      if (d.data.text && (!d.data.children || d.data.children.length === 0)) {
        const cleanSnippet = d.data.text.replace(/\s+/g, ' ').trim();
        const truncated = cleanSnippet.length > 24 ? `${cleanSnippet.slice(0, 24)}…` : cleanSnippet;
        textGroup
          .append('tspan')
          .attr('fill', '#34d399')
          .attr('font-size', '10px')
          .attr('dx', '6px')
          .text(`"${truncated}"`);
      }

      // Collapsed child count badge
      if (hasChildren && isCollapsed) {
        textGroup
          .append('tspan')
          .attr('fill', '#94a3b8')
          .attr('font-size', '9px')
          .attr('dx', '5px')
          .text(`[+${d.data.children.length}]`);
      }
    });
  }, [mode, ast, selectedNode, collapsedIds, searchTerm, onSelectNode, handleToggleCollapse]);

  // --- RENDER D3 TREEMAP ---
  useEffect(() => {
    if (mode !== 'treemap' || !ast || !svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const currentRoot = treemapRootNode || ast;

    // Build hierarchy with byte size weighting
    const root = d3
      .hierarchy<ASTNode>(currentRoot, (d) => (d.children && d.children.length > 0 ? d.children : null))
      .sum((d) => {
        // Use byte length or text length, minimum 1
        const byteLen = d.endByte - d.startByte;
        if (byteLen > 0) return byteLen;
        if (d.text) return Math.max(1, d.text.length);
        return 1;
      })
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const treemapLayout = d3
      .treemap<ASTNode>()
      .tile(d3.treemapSquarify)
      .size([width - 8, height - 8])
      .paddingOuter(4)
      .paddingTop(19)
      .paddingInner(3)
      .round(true);

    const rectRoot = treemapLayout(root);

    const g = svg.append('g').attr('transform', 'translate(4,4)');
    gRef.current = g.node() as SVGGElement;

    // Treemap does not use free zoom by default, but supports click to drilldown
    zoomBehaviorRef.current = null;

    // Cell groups
    const cells = g
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<ASTNode>>('g.cell')
      .data(rectRoot.descendants())
      .join('g')
      .attr('class', 'cell')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Rectangles
    cells
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', (d) => {
        const { color } = getNodeCategory(d.data.type);
        // Dim deeper levels slightly for depth perception
        const opacity = Math.max(0.12, 0.45 - d.depth * 0.06);
        return d.children ? `rgba(15, 23, 42, 0.7)` : d3.color(color)?.copy({ opacity }).toString() || color;
      })
      .attr('stroke', (d) => {
        if (selectedNode?.id === d.data.id) return '#38bdf8';
        const { color } = getNodeCategory(d.data.type);
        return d.children ? '#334155' : color;
      })
      .attr('stroke-width', (d) => {
        if (selectedNode?.id === d.data.id) return 2.5;
        return d.children ? 1.25 : 1;
      })
      .style('cursor', 'pointer');

    // Search match highlight on treemap cells
    if (searchTerm.trim().length > 0) {
      const term = searchTerm.toLowerCase();
      cells
        .filter(
          (d) =>
            d.data.type.toLowerCase().includes(term) ||
            (d.data.field && d.data.field.toLowerCase().includes(term)) ||
            (d.data.text && d.data.text.toLowerCase().includes(term))
        )
        .select('rect')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2.5);
    }

    // Cell Labels: Header for containers, centered or top text for leaves
    cells.each(function (d: d3.HierarchyRectangularNode<ASTNode>) {
      const cellW = d.x1 - d.x0;
      const cellH = d.y1 - d.y0;
      if (cellW < 28 || cellH < 18) return;

      const nodeEl = d3.select(this);
      const { color } = getNodeCategory(d.data.type);
      const isSelected = selectedNode?.id === d.data.id;

      const textEl = nodeEl
        .append('text')
        .attr('x', 5)
        .attr('y', d.children ? 12 : 14)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', d.children ? '10px' : '11px')
        .attr('fill', isSelected ? '#38bdf8' : d.children ? '#94a3b8' : '#f1f5f9')
        .attr('font-weight', d.children ? '600' : '500')
        .attr('pointer-events', 'none');

      let label = d.data.field ? `${d.data.field}: ${d.data.type}` : d.data.type;
      if (!d.children && d.data.text && cellW > 90) {
        const snippet = d.data.text.replace(/\s+/g, ' ').trim();
        if (snippet.length > 0) {
          label += ` ("${snippet.slice(0, 14)}")`;
        }
      }

      // Truncate based on cell width
      const maxChars = Math.floor((cellW - 10) / 7);
      if (label.length > maxChars && maxChars > 3) {
        label = `${label.slice(0, maxChars - 2)}…`;
      } else if (label.length > maxChars) {
        return; // Too narrow to display text cleanly
      }

      textEl.text(label);
    });

    // Interactivity
    cells
      .on('click', (event, d) => {
        event.stopPropagation();
        onSelectNode(d.data);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        if (d.data.children && d.data.children.length > 0) {
          setTreemapRootNode(d.data);
        }
      })
      .on('mouseenter', (event, d) => {
        const rect = container.getBoundingClientRect();
        setHoveredNode({
          node: d.data,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      });
  }, [mode, ast, treemapRootNode, selectedNode, searchTerm, onSelectNode]);

  // Window resize observer to trigger re-render smoothly
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      // Force trigger re-render on container resize
      if (mode === 'tree') {
        handleResetZoom();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mode]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full bg-[#090d16] overflow-hidden select-none"
    >
      {/* Visualizer Top Sub-Toolbar */}
      <div className="absolute top-2.5 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        {/* Left: View Mode Segmented Switcher & Breadcrumbs */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {onModeChange && (
            <div className="flex items-center gap-1 p-0.5 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg shadow-sm">
              <button
                onClick={() => onModeChange('tree')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${
                  mode === 'tree'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Árvore Hierárquica D3 com nós e links conectores"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Grafo D3</span>
              </button>

              <button
                onClick={() => onModeChange('treemap')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${
                  mode === 'treemap'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Treemap Retangular D3 ponderado pelo tamanho do código"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Treemap D3</span>
              </button>
            </div>
          )}

          {/* Treemap Breadcrumb Trail */}
          {mode === 'treemap' && treemapBreadcrumb.length > 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg text-xs font-mono text-slate-300 shadow-sm max-w-md overflow-x-auto">
              <button
                onClick={() => setTreemapRootNode(ast)}
                className="hover:text-cyan-300 text-slate-400 flex items-center gap-1 font-semibold"
                title="Voltar à raiz principal da AST"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Raiz</span>
              </button>
              <span className="text-slate-600">/</span>
              {treemapBreadcrumb.slice(1).map((b, idx, arr) => (
                <React.Fragment key={b.node.id}>
                  <button
                    onClick={() => setTreemapRootNode(b.node)}
                    className={`hover:text-cyan-300 truncate max-w-[120px] ${
                      idx === arr.length - 1 ? 'text-cyan-400 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {b.label}
                  </button>
                  {idx < arr.length - 1 && <span className="text-slate-600">/</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Right: Zoom & Layout Action Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {mode === 'tree' && (
            <>
              {/* Quick collapse/expand presets */}
              <div className="hidden sm:flex items-center gap-1 p-0.5 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg text-xs shadow-sm">
                <button
                  onClick={handleExpandAll}
                  className="px-2 py-0.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Expandir todos os ramos"
                >
                  Expandir
                </button>
                <button
                  onClick={() => handleCollapseToDepth(2)}
                  className="px-2 py-0.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Recolher para o 2º nível"
                >
                  Nível 2
                </button>
                <button
                  onClick={() => handleCollapseToDepth(3)}
                  className="px-2 py-0.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Recolher para o 3º nível"
                >
                  Nível 3
                </button>
              </div>

              {/* Zoom buttons */}
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg shadow-sm">
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Aproximar (Zoom In)"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Afastar (Zoom Out)"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleFitToScreen}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Ajustar à Tela (Fit to View)"
                >
                  <Maximize className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 rounded hover:bg-slate-800 transition"
                  title="Redefinir Zoom (1:1)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {mode === 'treemap' && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg text-slate-400 text-xs shadow-sm">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Clique duplo para detalhar subárvore</span>
            </div>
          )}
        </div>
      </div>

      {/* SVG Canvas for D3 Rendering */}
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Legend / Category Guide Footer */}
      <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-3 px-3 py-1 bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-lg text-[11px] text-slate-400 shadow-sm pointer-events-none">
        <span className="font-semibold text-slate-300">Categorias:</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
          <span>Definição</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc]" />
          <span>Instrução</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]" />
          <span>Expressão</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]" />
          <span>Identificador</span>
        </div>
      </div>

      {/* Interactive Tooltip Card on Hover */}
      {hoveredNode && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs max-w-xs transition-opacity duration-150"
          style={{
            left: Math.min(hoveredNode.x + 15, (containerRef.current?.clientWidth || 600) - 260),
            top: Math.min(hoveredNode.y + 15, (containerRef.current?.clientHeight || 400) - 160),
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
            <span className="font-mono font-bold text-cyan-300 text-xs">
              {hoveredNode.node.type}
            </span>
            <span className="text-[10px] text-slate-400">
              {hoveredNode.node.isNamed ? 'Sintático' : 'Literal'}
            </span>
          </div>

          {hoveredNode.node.field && (
            <div className="text-[11px] text-amber-300 font-mono mb-1">
              campo: <span className="font-semibold">{hoveredNode.node.field}</span>
            </div>
          )}

          <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
            <div>
              Posição: [{hoveredNode.node.startPoint.row + 1}:{hoveredNode.node.startPoint.column}] → [
              {hoveredNode.node.endPoint.row + 1}:{hoveredNode.node.endPoint.column}]
            </div>
            <div>
              Tamanho: {hoveredNode.node.endByte - hoveredNode.node.startByte} bytes
              {hoveredNode.node.children && hoveredNode.node.children.length > 0 && (
                <span> · {hoveredNode.node.children.length} filhos</span>
              )}
            </div>
          </div>

          {hoveredNode.node.text && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800">
              <pre className="font-mono text-[10px] text-emerald-300 bg-slate-950 p-1.5 rounded overflow-hidden text-ellipsis whitespace-pre max-h-16">
                {hoveredNode.node.text.trim()}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
