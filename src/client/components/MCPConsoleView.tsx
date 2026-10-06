import React, { useState } from 'react';
import { Terminal, Zap, Copy, Check, Server, RefreshCw, Layers, CheckCircle2, Code } from 'lucide-react';

interface MCPConsoleViewProps {
  mcpTools: any[];
  selectedTool: string;
  activeProject: string;
  activeFile: string;
  code: string;
  language: string;
  mcpOutput: any;
  mcpLoading: boolean;
  onSelectTool: (tool: string) => void;
  onExecuteTool: (toolName: string, args: Record<string, any>) => void;
}

export function MCPConsoleView({
  mcpTools,
  selectedTool,
  activeProject,
  activeFile,
  code,
  language,
  mcpOutput,
  mcpLoading,
  onSelectTool,
  onExecuteTool,
}: MCPConsoleViewProps) {
  const [mode, setMode] = useState<'guided' | 'raw'>('guided');
  const [rawArgs, setRawArgs] = useState<string>('{}');
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);

  // Guided form state
  const [formProject, setFormProject] = useState(activeProject);
  const [formPath, setFormPath] = useState(activeFile);
  const [formQuery, setFormQuery] = useState('(function_definition) @func');
  const [formRow, setFormRow] = useState(0);
  const [formCol, setFormCol] = useState(0);
  const [formThreshold, setFormThreshold] = useState(0.5);
  const [formRegisterName, setFormRegisterName] = useState('novo-projeto');
  const [formRegisterPath, setFormRegisterPath] = useState('/workspace/novo-projeto');
  const [formRegisterDesc, setFormRegisterDesc] = useState('Projeto isolado');

  const selectedToolObj = mcpTools.find((t) => t.name === selectedTool);

  const handleExecute = () => {
    if (mode === 'raw') {
      try {
        const parsed = JSON.parse(rawArgs);
        onExecuteTool(selectedTool, parsed);
      } catch (err: any) {
        alert('JSON inválido nos argumentos: ' + err.message);
      }
    } else {
      // Build arguments from guided form
      const args: Record<string, any> = {
        project: formProject || activeProject,
        file_path: formPath || activeFile,
        path: formPath || activeFile,
        code,
        language,
      };

      if (selectedTool === 'register_project_tool') {
        args.name = formRegisterName;
        args.path = formRegisterPath;
        args.description = formRegisterDesc;
      } else if (selectedTool === 'run_query') {
        args.query = formQuery;
      } else if (selectedTool === 'get_node_at_position') {
        args.row = Number(formRow);
        args.column = Number(formCol);
      } else if (selectedTool === 'find_similar_code') {
        args.snippet = code;
        args.threshold = Number(formThreshold);
      }

      onExecuteTool(selectedTool, args);
    }
  };

  const mcpConfigSnippet = JSON.stringify(
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
          url: `${window.location.origin}/api/mcp`,
        },
      },
    },
    null,
    2
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0f172a] overflow-hidden">
      {/* Top Header */}
      <div className="h-10 px-4 border-b border-slate-800 bg-[#11192e] flex items-center justify-between text-xs shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200">
            Console Interativo do Servidor Model Context Protocol (MCP)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-emerald-400 flex items-center gap-1.5 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Endpoint Ativo: /api/mcp
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Tool Configuration and Trigger */}
        <div className="w-full md:w-1/2 p-4 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col space-y-4 overflow-auto">
          {/* Tool selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Ferramenta MCP (Tool):
            </label>
            <select
              value={selectedTool}
              onChange={(e) => onSelectTool(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {mcpTools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name} — {tool.description}
                </option>
              ))}
            </select>
            {selectedToolObj && (
              <p className="text-[11px] text-slate-400 italic">{selectedToolObj.description}</p>
            )}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-medium text-slate-300">Modo de Configuração:</span>
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => setMode('guided')}
                className={`px-2.5 py-1 rounded text-xs transition ${
                  mode === 'guided'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Formulário Guiado
              </button>
              <button
                onClick={() => setMode('raw')}
                className={`px-2.5 py-1 rounded text-xs transition ${
                  mode === 'raw'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                JSON Bruto
              </button>
            </div>
          </div>

          {/* Form inputs */}
          {mode === 'guided' ? (
            <div className="space-y-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Projeto:</label>
                  <input
                    type="text"
                    value={formProject}
                    onChange={(e) => setFormProject(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Arquivo / Caminho:</label>
                  <input
                    type="text"
                    value={formPath}
                    onChange={(e) => setFormPath(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {selectedTool === 'run_query' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Consulta S-Expression:</label>
                  <textarea
                    value={formQuery}
                    onChange={(e) => setFormQuery(e.target.value)}
                    className="w-full h-20 bg-slate-950 font-mono border border-slate-800 rounded p-2 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {selectedTool === 'get_node_at_position' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Linha (0-index):</label>
                    <input
                      type="number"
                      value={formRow}
                      onChange={(e) => setFormRow(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Coluna (0-index):</label>
                    <input
                      type="number"
                      value={formCol}
                      onChange={(e) => setFormCol(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs"
                    />
                  </div>
                </div>
              )}

              {selectedTool === 'register_project_tool' && (
                <div className="space-y-2 border-t border-slate-800 pt-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nome do Projeto:</label>
                    <input
                      type="text"
                      value={formRegisterName}
                      onChange={(e) => {
                        setFormRegisterName(e.target.value);
                        setFormRegisterPath(`/workspace/${e.target.value.toLowerCase()}`);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Caminho Raiz Isolado (Path):</label>
                    <input
                      type="text"
                      value={formRegisterPath}
                      onChange={(e) => setFormRegisterPath(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Descrição:</label>
                    <input
                      type="text"
                      value={formRegisterDesc}
                      onChange={(e) => setFormRegisterDesc(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs"
                    />
                  </div>
                </div>
              )}

              {selectedTool === 'find_similar_code' && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Limiar de Similaridade (0.1 a 1.0):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    value={formThreshold}
                    onChange={(e) => setFormThreshold(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 text-xs"
                  />
                </div>
              )}

              <div className="text-[10px] text-slate-400 pt-1">
                O código atualmente em edição no editor é injetado automaticamente como contexto da chamada.
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Argumentos JSON:
              </label>
              <textarea
                value={rawArgs}
                onChange={(e) => setRawArgs(e.target.value)}
                placeholder="{}"
                className="w-full h-36 bg-slate-950 font-mono text-xs p-2.5 rounded-lg border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                spellCheck={false}
              />
            </div>
          )}

          {/* Trigger Button */}
          <button
            onClick={handleExecute}
            disabled={mcpLoading}
            className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md"
          >
            {mcpLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 fill-current" />
            )}
            Executar Chamada JSON-RPC ({selectedTool})
          </button>

          {/* Integration instructions snippet */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                Configuração para Claude Desktop & Cursor
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(mcpConfigSnippet);
                  setCopiedConfig(true);
                  setTimeout(() => setCopiedConfig(false), 2000);
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {copiedConfig ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedConfig ? 'Copiado!' : 'Copiar JSON'}
              </button>
            </div>
            <pre className="bg-slate-950 p-2.5 rounded-lg text-[10px] font-mono text-slate-300 overflow-x-auto border border-slate-850">
              {mcpConfigSnippet}
            </pre>
          </div>
        </div>

        {/* Right Side: JSON-RPC Response Output */}
        <div className="w-full md:w-1/2 p-4 flex flex-col bg-[#0b0f17] overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-200">
              Resposta MCP (tools/call response):
            </span>
            {mcpOutput && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(mcpOutput, null, 2));
                  setCopiedOutput(true);
                  setTimeout(() => setCopiedOutput(false), 2000);
                }}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
              >
                {copiedOutput ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedOutput ? 'Copiado!' : 'Copiar Resposta'}
              </button>
            )}
          </div>

          <pre className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-auto whitespace-pre leading-relaxed">
            {mcpOutput
              ? JSON.stringify(mcpOutput, null, 2)
              : '// Aguardando execução de ferramenta. Selecione a ferramenta à esquerda e clique em Executar.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
