import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ASTNode } from '../types';

interface CodeMiniMapProps {
  code: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  selectedNode: ASTNode | null;
  onScrollToLine?: (lineIndex: number) => void;
}

export function CodeMiniMap({
  code,
  textareaRef,
  selectedNode,
}: CodeMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverLine, setHoverLine] = useState<number | null>(null);

  // Viewport tracking state
  const [viewport, setViewport] = useState<{
    top: number;
    height: number;
    visible: boolean;
  }>({ top: 0, height: 40, visible: true });

  const lines = useMemo(() => code.split('\n'), [code]);
  const highlightStartRow = selectedNode ? selectedNode.startPoint.row : null;
  const highlightEndRow = selectedNode ? selectedNode.endPoint.row : null;

  // Update viewport box from textarea scroll
  const updateViewportFromTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const container = containerRef.current;
    if (!textarea || !container) return;

    const { scrollTop, scrollHeight, clientHeight } = textarea;
    const containerHeight = container.clientHeight;

    if (scrollHeight <= clientHeight) {
      setViewport({ top: 0, height: containerHeight, visible: false });
      return;
    }

    const ratio = containerHeight / scrollHeight;
    const boxHeight = Math.max(24, clientHeight * ratio);
    const boxTop = (scrollTop / (scrollHeight - clientHeight)) * (containerHeight - boxHeight);

    setViewport({
      top: Math.max(0, Math.min(boxTop, containerHeight - boxHeight)),
      height: boxHeight,
      visible: true,
    });
  }, [textareaRef]);

  // Hook textarea scroll event
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    updateViewportFromTextarea();

    const handleScroll = () => {
      updateViewportFromTextarea();
    };

    textarea.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateViewportFromTextarea);

    return () => {
      textarea.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateViewportFromTextarea);
    };
  }, [textareaRef, updateViewportFromTextarea, code]);

  // Draw code preview onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = container.clientWidth || 96;
    const height = container.clientHeight || 300;

    // Support High DPI
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const totalLines = lines.length;
    if (totalLines === 0) return;

    const linePitch = height / Math.max(totalLines, 30);
    const lineHeight = Math.max(1, Math.min(linePitch * 0.75, 3));

    // Render each line as micro-segments with indentation and syntax hints
    for (let i = 0; i < totalLines; i++) {
      const lineText = lines[i];
      const y = i * linePitch;

      if (!lineText || lineText.trim().length === 0) continue;

      // Calculate indent
      const trimmed = lineText.trimStart();
      const indentCount = lineText.length - trimmed.length;
      const xStart = Math.min(indentCount * 2.2 + 4, width - 20);
      const textLen = Math.min(trimmed.length * 1.3, width - xStart - 8);

      // Determine color
      const isSelected =
        highlightStartRow !== null &&
        highlightEndRow !== null &&
        i >= highlightStartRow &&
        i <= highlightEndRow;

      if (isSelected) {
        // Bright cyan for active AST node
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(2, y - 0.5, width - 4, Math.max(lineHeight + 1, 2.5));
      } else if (
        trimmed.startsWith('def ') ||
        trimmed.startsWith('class ') ||
        trimmed.startsWith('function ') ||
        trimmed.startsWith('fn ') ||
        trimmed.startsWith('func ')
      ) {
        ctx.fillStyle = '#38bdf8'; // Sky blue for definitions
        ctx.fillRect(xStart, y, textLen, lineHeight);
      } else if (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.startsWith('use ') ||
        trimmed.startsWith('package ')
      ) {
        ctx.fillStyle = '#94a3b8'; // Slate for imports
        ctx.fillRect(xStart, y, textLen, lineHeight);
      } else if (
        trimmed.startsWith('if ') ||
        trimmed.startsWith('for ') ||
        trimmed.startsWith('while ') ||
        trimmed.startsWith('return ') ||
        trimmed.startsWith('else')
      ) {
        ctx.fillStyle = '#c084fc'; // Purple for control flow
        ctx.fillRect(xStart, y, textLen, lineHeight);
      } else if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        ctx.fillStyle = '#475569'; // Muted dark for comments
        ctx.fillRect(xStart, y, textLen, lineHeight);
      } else {
        ctx.fillStyle = '#64748b'; // Normal code token
        ctx.fillRect(xStart, y, textLen, lineHeight);
      }
    }
  }, [lines, highlightStartRow, highlightEndRow]);

  // Scroll textarea to the requested mini-map Y coordinate
  const scrollToY = (clientY: number) => {
    const textarea = textareaRef.current;
    const container = containerRef.current;
    if (!textarea || !container) return;

    const rect = container.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(clientY - rect.top, rect.height));
    const targetRatio = relativeY / rect.height;

    const targetScrollTop = targetRatio * (textarea.scrollHeight - textarea.clientHeight);
    textarea.scrollTop = targetScrollTop;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    scrollToY(e.clientY);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      scrollToY(e.clientY);
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || lines.length === 0) return;
    const rect = container.getBoundingClientRect();
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    const lineIndex = Math.min(
      lines.length - 1,
      Math.max(0, Math.floor((y / rect.height) * lines.length))
    );
    setHoverLine(lineIndex + 1);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseLeave={() => setHoverLine(null)}
      className="w-24 bg-[#080c14] border-l border-slate-850 h-full relative select-none shrink-0 overflow-hidden cursor-pointer group"
      title="Mini-mapa de código: clique ou arraste para navegar rapidamente"
    >
      {/* Background Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Selected Node Glow Marker in Mini-map */}
      {highlightStartRow !== null && highlightEndRow !== null && (
        <div
          style={{
            top: `${(highlightStartRow / Math.max(lines.length, 1)) * 100}%`,
            height: `${Math.max(
              2,
              ((highlightEndRow - highlightStartRow + 1) / Math.max(lines.length, 1)) * 100
            )}%`,
          }}
          className="absolute left-0 right-0 bg-cyan-500/30 border-y border-cyan-400 pointer-events-none shadow-sm"
        />
      )}

      {/* Viewport Lens / Slider */}
      {viewport.visible && (
        <div
          style={{
            top: `${viewport.top}px`,
            height: `${viewport.height}px`,
          }}
          className={`absolute left-0 right-0 bg-cyan-500/15 border-y border-cyan-400/60 pointer-events-none transition-opacity duration-75 ${
            isDragging ? 'bg-cyan-500/25 border-cyan-400' : 'group-hover:bg-cyan-500/20'
          }`}
        >
          {/* Subtle drag bar indicator */}
          <div className="absolute right-1 top-1 bottom-1 w-1 rounded-full bg-cyan-400/60" />
        </div>
      )}

      {/* Hover Line Tooltip */}
      {hoverLine !== null && (
        <div
          className="absolute right-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-[9px] pointer-events-none shadow-lg -translate-y-1/2"
          style={{
            top: `${((hoverLine - 1) / Math.max(lines.length, 1)) * 100}%`,
          }}
        >
          L{hoverLine}
        </div>
      )}
    </div>
  );
}
