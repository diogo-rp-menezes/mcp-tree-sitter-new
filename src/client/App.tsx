import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { VSCodeTitleBar } from './components/VSCodeTitleBar';
import { VSCodeActivityBar } from './components/VSCodeActivityBar';
import { VSCodePrimarySideBar } from './components/VSCodePrimarySideBar';
import { VSCodeTabBar } from './components/VSCodeTabBar';
import { VSCodeStatusBar } from './components/VSCodeStatusBar';
import { CodeEditor } from './components/CodeEditor';
import { ASTExplorerView } from './components/ASTExplorerView';
import { QueryStudioView } from './components/QueryStudioView';
import { SymbolsView } from './components/SymbolsView';
import { ComplexityView } from './components/ComplexityView';
import { SimilarityView } from './components/SimilarityView';
import { MCPConsoleView } from './components/MCPConsoleView';
import { ProjectManagerView } from './components/ProjectManagerView';
import { DatabaseView } from './components/DatabaseView';
import { BreadcrumbBar } from './components/BreadcrumbBar';
import { MCPConnectModal } from './components/MCPConnectModal';
import { TreeSitterInspectorModal } from './components/TreeSitterInspectorModal';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { Toast } from './components/Toast';
import {
  ASTNode,
  SymbolItem,
  CodeComplexity,
  QueryMatch,
  ProjectInfo,
  PresetSnippet,
  PRESET_SNIPPETS,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const saved = localStorage.getItem('mcp_active_tab');
    return (saved as NavTab) || 'ast';
  });

  // Project state
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [activeProject, setActiveProject] = useState<string>(() => {
    return localStorage.getItem('mcp_active_project') || '';
  });
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>(() => {
    return localStorage.getItem('mcp_active_file') || '';
  });
  const [openFiles, setOpenFiles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mcp_open_files');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Open a file tab explicitly
  const handleOpenFile = useCallback((filePath: string) => {
    if (!filePath) return;
    setActiveFile(filePath);
    setOpenFiles((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
  }, []);

  // Close an open file tab
  const handleCloseFile = useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      const updated = prev.filter((f) => f !== filePath);
      if (activeFile === filePath) {
        if (updated.length > 0) {
          const nextFile = updated[updated.length - 1];
          setActiveFile(nextFile);
        } else {
          setActiveFile('');
          setCode('');
          setOriginalCode('');
          setAst(null);
        }
      }
      return updated;
    });
  }, [activeFile]);

  // Code editor state
  const [code, setCode] = useState<string>('');
  const [originalCode, setOriginalCode] = useState<string>('');
  const [language, setLanguage] = useState<string>('python');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCodeDirty = useMemo(() => code !== originalCode && originalCode !== '', [code, originalCode]);

  // AST state
  const [ast, setAst] = useState<ASTNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<ASTNode | null>(null);
  const [maxAstDepth, setMaxAstDepth] = useState<number>(5);

  // Query state
  const [queryInput, setQueryInput] = useState<string>(
    `(function_definition\n  name: (identifier) @function.name\n  parameters: (parameters) @function.params\n  body: (block) @function.body) @function.def`
  );
  const [queryMatches, setQueryMatches] = useState<QueryMatch[]>([]);
  const [templates, setTemplates] = useState<Record<string, Record<string, string>>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string>('functions');

  // Symbols state
  const [symbols, setSymbols] = useState<Record<string, SymbolItem[]>>({});

  // Complexity state
  const [complexity, setComplexity] = useState<CodeComplexity | null>(null);

  // Similarity state
  const [similaritySnippet, setSimilaritySnippet] = useState<string>(
    `def process_data(items):\n    result = []\n    for item in items:\n        result.append(item.upper())\n    return result`
  );
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.4);
  const [similarityResults, setSimilarityResults] = useState<any[]>([]);

  // MCP console state
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [selectedMcpTool, setSelectedMcpTool] = useState<string>('get_ast');
  const [mcpOutput, setMcpOutput] = useState<any>(null);
  const [mcpLoading, setMcpLoading] = useState<boolean>(false);

  // UI helpers
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMCPModalOpen, setIsMCPModalOpen] = useState<boolean>(false);
  const [treeSitterModalTool, setTreeSitterModalTool] = useState<NavTab | null>(null);
  const [lintErrorCount, setLintErrorCount] = useState<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  // Fetch initial project data, templates, and tools
  useEffect(() => {
    fetchProjects();
    fetchTemplates();
    fetchMCPTools();
  }, []);

  const isFirstRender = useRef(true);

  // Synchronize state changes to localStorage
  useEffect(() => {
    localStorage.setItem('mcp_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('mcp_active_project', activeProject);
  }, [activeProject]);

  useEffect(() => {
    localStorage.setItem('mcp_open_files', JSON.stringify(openFiles));
  }, [openFiles]);

  useEffect(() => {
    localStorage.setItem('mcp_active_file', activeFile);
  }, [activeFile]);

  // Load project files when active project changes
  useEffect(() => {
    if (activeProject) {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        fetchFiles(activeProject);
      } else {
        setOpenFiles([]);
        setActiveFile('');
        setCode('');
        setOriginalCode('');
        setAst(null);
        fetchFiles(activeProject);
      }
    }
  }, [activeProject]);

  // Load file content when file changes
  useEffect(() => {
    if (activeProject && activeFile) {
      loadFileContent(activeProject, activeFile);
    }
  }, [activeProject, activeFile]);

  // Real-time analysis whenever code or language changes with AbortController
  useEffect(() => {
    if (!code) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      analyzeCode(code, language, controller.signal);
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [code, language]);

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      const data: ProjectInfo[] = await res.json();
      setProjects(data);
      if (Array.isArray(data) && data.length > 0) {
        if (!activeProject || !data.some((p) => p.name === activeProject)) {
          setActiveProject(data[0].name);
        }
      } else {
        setActiveProject('');
        setProjectFiles([]);
        setActiveFile('');
        setCode('');
        setOriginalCode('');
        setAst(null);
      }
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates', err);
    }
  }

  async function fetchMCPTools() {
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });
      const data = await res.json();
      if (data?.result?.tools) {
        setMcpTools(data.result.tools);
      }
    } catch (err) {
      console.error('Failed to fetch MCP tools', err);
    }
  }

  async function fetchFiles(projName: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projName)}/files`);
      const files: string[] = await res.json();
      setProjectFiles(files);
    } catch (err) {
      console.error('Failed to load files', err);
    }
  }

  async function loadFileContent(projName: string, filePath: string) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projName)}/file?path=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) throw new Error('Could not load file');
      const fileData = await res.json();
      setCode(fileData.content || '');
      setOriginalCode(fileData.content || '');
      setLanguage(fileData.language || 'python');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveActiveFile() {
    if (!activeProject || !activeFile) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(activeProject)}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile, content: code }),
      });
      if (!res.ok) throw new Error('Falha ao salvar arquivo no banco SQLite');
      setOriginalCode(code);
      showToast(`Arquivo '${activeFile}' salvo com sucesso no banco de dados SQLite!`);
      fetchFiles(activeProject);
    } catch (err: any) {
      showToast(`Erro ao salvar: ${err.message}`);
    }
  }

  async function analyzeCode(src: string, lang: string, signal?: AbortSignal) {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: src, language: lang }),
        signal,
      });
      if (signal?.aborted) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      setAst(data.ast);
      setSymbols(data.symbols);
      setComplexity(data.complexity);
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        // Request intentionally aborted by newer keystroke
        return;
      }
      console.error('Analysis error:', err);
    }
  }

  async function handleRunQuery() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryInput,
          code,
          language,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setQueryMatches(data);
      showToast(`Consulta executada: ${data.length} nós correspondentes encontrados!`);
    } catch (err: any) {
      setErrorMsg('Erro na execução da query: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectTemplate(tplName: string) {
    setSelectedTemplate(tplName);
    const langTemplates = templates[language] || templates['python'] || {};
    if (langTemplates[tplName]) {
      setQueryInput(langTemplates[tplName]);
    }
  }

  async function handleFindSimilar() {
    setLoading(true);
    try {
      const res = await fetch('/api/similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippet: similaritySnippet,
          language,
          project: activeProject,
          threshold: similarityThreshold,
        }),
      });
      const data = await res.json();
      setSimilarityResults(data);
      showToast(`Comparação concluída: ${data.length} trechos similares localizados.`);
    } catch (err: any) {
      setErrorMsg('Erro na comparação: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteMCPTool(toolName: string, args: Record<string, any>) {
    setMcpLoading(true);
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        }),
      });
      const data = await res.json();
      setMcpOutput(data);
      showToast(`Ferramenta MCP '${toolName}' executada com sucesso!`);
    } catch (err: any) {
      setMcpOutput({ error: err.message });
      showToast('Erro ao invocar ferramenta MCP.');
    } finally {
      setMcpLoading(false);
    }
  }

  async function handleSaveCurrentFile() {
    try {
      await fetch(`/api/projects/${encodeURIComponent(activeProject)}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeFile, content: code }),
      });
      showToast(`Arquivo '${activeFile}' salvo com sucesso!`);
    } catch (e: any) {
      showToast('Falha ao salvar arquivo: ' + e.message);
    }
  }

  function handleLoadPreset(preset: PresetSnippet) {
    setCode(preset.code);
    setLanguage(preset.language);
    handleOpenFile(preset.filename);
    setSelectedNode(null);
    showToast(`Exemplo carregado: ${preset.name}`);
  }

  const totalSymbolsCount = useMemo(() => {
    return Object.values(symbols).reduce((acc, list) => acc + (list?.length || 0), 0);
  }, [symbols]);

  const totalDiagnosticsCount = useMemo(() => {
    if (ast?.errors && Array.isArray(ast.errors)) {
      return ast.errors.length;
    }
    return lintErrorCount;
  }, [ast, lintErrorCount]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#1e1e1e] text-slate-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. VS Code Top Title Bar */}
      <VSCodeTitleBar
        activeProject={activeProject}
        activeFile={activeFile}
        language={language}
        projects={projects}
        projectFiles={projectFiles}
        isDirty={isCodeDirty}
        onSelectProject={setActiveProject}
        onSelectFile={handleOpenFile}
        onSaveFile={handleSaveActiveFile}
        onLoadPreset={handleLoadPreset}
        onOpenMCPModal={() => setIsMCPModalOpen(true)}
      />

      {/* 2. Main Desktop Work Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar (Left narrow 48px strip) */}
        <VSCodeActivityBar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          symbolsCount={totalSymbolsCount}
          diagnosticsCount={totalDiagnosticsCount}
          onOpenMCPModal={() => setIsMCPModalOpen(true)}
        />

        {/* Primary Side Bar (Collapsible panel 240px) */}
        <VSCodePrimarySideBar
          activeTab={activeTab}
          projects={projects}
          activeProject={activeProject}
          projectFiles={projectFiles}
          activeFile={activeFile}
          language={language}
          ast={ast}
          symbols={symbols}
          templates={templates}
          mcpTools={mcpTools}
          onSelectProject={setActiveProject}
          onSelectFile={handleOpenFile}
          onSelectTab={setActiveTab}
          onRefreshProjects={fetchProjects}
          onOpenProjectManager={() => setActiveTab('projects')}
          onJumpToLine={(line) => showToast(`Navegando para linha ${line + 1}`)}
          onSelectNode={(node) => setSelectedNode(node as any)}
        />

        {/* Central Workspace Content Pane */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]">
          {/* Editor Tab Bar (File Documents Only) */}
          <VSCodeTabBar
            openFiles={openFiles}
            activeFile={activeFile}
            language={language}
            isDirty={isCodeDirty}
            onSelectFile={handleOpenFile}
            onCloseFile={handleCloseFile}
            onSaveFile={handleSaveActiveFile}
          />

          {/* Breadcrumbs Navigation Bar */}
          <BreadcrumbBar
            activeProject={activeProject}
            activeFile={activeFile}
            projectPath={projects.find((p) => p.name === activeProject)?.path}
            projectFiles={projectFiles}
            language={language}
            projects={projects}
            onSelectProject={setActiveProject}
            onSelectFile={handleOpenFile}
            onOpenProjectManager={() => setActiveTab('projects')}
            onToast={showToast}
          />

          {/* Main Editor & Full Workspace Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {activeTab === 'projects' ? (
              <ProjectManagerView
                projects={projects}
                activeProject={activeProject}
                projectFiles={projectFiles}
                activeFile={activeFile}
                onSelectProject={setActiveProject}
                onSelectFile={(file) => {
                  handleOpenFile(file);
                }}
                onRefreshProjects={fetchProjects}
                onNavigateToAST={() => setTreeSitterModalTool('ast')}
                onClose={() => setActiveTab('ast')}
              />
            ) : activeTab === 'mcp' ? (
              <MCPConsoleView
                mcpTools={mcpTools}
                selectedTool={selectedMcpTool}
                activeProject={activeProject}
                activeFile={activeFile}
                code={code}
                language={language}
                mcpOutput={mcpOutput}
                mcpLoading={mcpLoading}
                onSelectTool={setSelectedMcpTool}
                onExecuteTool={handleExecuteMCPTool}
              />
            ) : activeTab === 'database' ? (
              <DatabaseView />
            ) : activeTab === 'diagnostics' ? (
              <div className="w-full flex flex-col h-full overflow-hidden bg-[#1e1e1e]">
                <DiagnosticsPanel
                  ast={ast}
                  activeFile={activeFile}
                  filename={activeFile}
                  language={language}
                  onJumpToLine={(line) => {
                    setSelectedNode({
                      id: `jump_line_${line}`,
                      type: 'line_jump',
                      isNamed: true,
                      startPoint: { row: line, column: 0 },
                      endPoint: { row: line, column: 100 },
                      startByte: 0,
                      endByte: 0,
                      text: '',
                      children: [],
                    } as ASTNode);
                    showToast(`Navegando para linha ${line + 1}`);
                    setActiveTab('ast');
                  }}
                  onSelectNode={(node) => {
                    setSelectedNode(node as any);
                    setActiveTab('ast');
                  }}
                />
              </div>
            ) : (
              /* Full-Width Monaco Code Editor View */
              <div className="w-full flex flex-col h-full overflow-hidden bg-[#1e1e1e]">
                <CodeEditor
                  code={code}
                  language={language}
                  filename={activeFile}
                  ast={ast}
                  selectedNode={selectedNode}
                  symbols={symbols}
                  isDirty={isCodeDirty}
                  activeInspector={treeSitterModalTool || 'ast'}
                  symbolsCount={totalSymbolsCount}
                  onChangeCode={setCode}
                  onCopyCode={() => showToast('Código copiado!')}
                  onSaveCode={handleSaveActiveFile}
                  onSelectInspector={(tool) => setTreeSitterModalTool(tool)}
                  onDiagnosticsChange={setLintErrorCount}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Overlay for Tree-sitter Inspector Tools */}
      <TreeSitterInspectorModal
        isOpen={treeSitterModalTool !== null}
        activeTool={treeSitterModalTool}
        filename={activeFile}
        language={language}
        activeProject={activeProject}
        code={code}
        ast={ast}
        selectedNode={selectedNode}
        maxAstDepth={maxAstDepth}
        queryInput={queryInput}
        queryMatches={queryMatches}
        templates={templates}
        selectedTemplate={selectedTemplate}
        symbols={symbols}
        complexity={complexity}
        similaritySnippet={similaritySnippet}
        similarityResults={similarityResults}
        similarityThreshold={similarityThreshold}
        loading={loading}
        errorMsg={errorMsg}
        onClose={() => setTreeSitterModalTool(null)}
        onSelectTool={(tool) => setTreeSitterModalTool(tool)}
        onChangeMaxDepth={setMaxAstDepth}
        onSelectNode={(node) => setSelectedNode(node)}
        onChangeQuery={setQueryInput}
        onSelectTemplate={handleSelectTemplate}
        onRunQuery={handleRunQuery}
        onJumpToLine={(line) => showToast(`Linha ${line + 1} selecionada`)}
        onChangeSimilaritySnippet={setSimilaritySnippet}
        onChangeSimilarityThreshold={setSimilarityThreshold}
        onRunSimilarity={handleFindSimilar}
        onToast={showToast}
      />

      {/* 3. VS Code Bottom Status Bar */}
      <VSCodeStatusBar
        language={language}
        onOpenMCPModal={() => setIsMCPModalOpen(true)}
        onSelectDiagnostics={() => setActiveTab('diagnostics')}
        lintErrorCount={totalDiagnosticsCount}
        lineCount={code ? code.split('\n').length : 0}
      />

      {/* Modal: Connect Claude Desktop / Cursor */}
      <MCPConnectModal isOpen={isMCPModalOpen} onClose={() => setIsMCPModalOpen(false)} />

      {/* Toast Notification */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
}
