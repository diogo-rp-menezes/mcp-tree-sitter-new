import React, { useState } from 'react';
import { X, Copy, Check, Terminal, ExternalLink, ShieldCheck } from 'lucide-react';

interface MCPConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MCPConnectModal({ isOpen, onClose }: MCPConnectModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const configJSON = JSON.stringify(
    {
      mcpServers: {
        'tree-sitter': {
          command: 'npx',
          args: ['-y', 'mcp-server-tree-sitter'],
          env: {
            MCP_TS_CONFIG_PATH: '~/.config/tree-sitter/config.yaml',
          },
        },
        'tree-sitter-studio-http': {
          url: `${currentOrigin}/api/mcp`,
        },
      },
    },
    null,
    2
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(configJSON);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#0e1422] border border-slate-700/80 rounded-2xl max-w-xl w-full p-5 shadow-2xl text-xs space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-100">
                Conectar ao Claude Desktop, Cursor ou IDE
              </h3>
              <p className="text-[11px] text-slate-400">
                Protocolo MCP (Model Context Protocol) versão 2024-11-05
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Instructions */}
        <div className="space-y-2.5">
          <p className="text-slate-300 leading-relaxed text-xs">
            Para permitir que assistentes de IA (Claude Desktop, Cursor, Continue.dev, Zed) usem as ferramentas de
            análise de código e Tree-sitter deste servidor, adicione a configuração abaixo ao seu arquivo{' '}
            <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-300 font-mono">claude_desktop_config.json</code>:
          </p>

          <div className="relative">
            <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto">
              {configJSON}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2.5 right-2.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[11px] flex items-center gap-1 transition shadow"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Copiar Config'}
            </button>
          </div>
        </div>

        {/* Features Supported */}
        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            Recursos MCP Habilitados Neste Servidor:
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong className="text-slate-300">15 Ferramentas (tools/call):</strong> get_ast, run_query, get_symbols, analyze_complexity, etc.</li>
            <li><strong className="text-slate-300">5 Prompts predefinidos (prompts/get):</strong> code_review, explain_code, etc.</li>
            <li><strong className="text-slate-300">Suporte a SSE (Server-Sent Events):</strong> endpoint /mcp/sse ativo.</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
