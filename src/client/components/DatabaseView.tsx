import React, { useState, useEffect } from 'react';
import {
  Database,
  Table2,
  Play,
  RotateCcw,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  Rows,
  Columns,
  Search,
  Key,
  ChevronRight,
  HardDrive,
  Copy,
  Check,
  Code2,
} from 'lucide-react';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

interface TableSchema {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
}

interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  durationMs: number;
  isReadonly: boolean;
  changes?: number;
}

const PRESET_QUERIES = [
  {
    title: 'Visão Geral dos Projetos',
    desc: 'Lista todos os projetos cadastrados no SQLite',
    sql: 'SELECT name, path, description, created_at, updated_at FROM projects ORDER BY name ASC;',
  },
  {
    title: 'Arquivos por Linguagem',
    desc: 'Agrupa arquivos por linguagem com contagem e bytes',
    sql: 'SELECT language, COUNT(*) as file_count, SUM(size_bytes) as total_bytes, ROUND(AVG(size_bytes), 1) as avg_bytes FROM files GROUP BY language ORDER BY file_count DESC;',
  },
  {
    title: 'Top 20 Maiores Arquivos',
    desc: 'Identifica os maiores arquivos armazenados no banco',
    sql: 'SELECT project_name, path, language, size_bytes, updated_at FROM files ORDER BY size_bytes DESC LIMIT 20;',
  },
  {
    title: 'Distribuição por Projeto',
    desc: 'Contagem de arquivos e soma de bytes por projeto',
    sql: 'SELECT p.name AS project, p.path AS root_path, COUNT(f.path) AS total_files, COALESCE(SUM(f.size_bytes), 0) AS total_bytes FROM projects p LEFT JOIN files f ON p.name = f.project_name GROUP BY p.name ORDER BY total_files DESC;',
  },
  {
    title: 'Verificação de Integridade',
    desc: 'Executa PRAGMA integrity_check no arquivo SQLite',
    sql: 'PRAGMA integrity_check;',
  },
];

export function DatabaseView() {
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [loadingSchema, setLoadingSchema] = useState<boolean>(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Query state
  const [sqlInput, setSqlInput] = useState<string>(
    'SELECT name, path, description, updated_at FROM projects ORDER BY name ASC;'
  );
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Result table filtering & pagination
  const [filterText, setFilterText] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);

  // Load database schema on mount
  useEffect(() => {
    fetchSchema();
  }, []);

  const fetchSchema = async () => {
    setLoadingSchema(true);
    try {
      const res = await fetch('/api/database/schema');
      if (!res.ok) throw new Error('Falha ao carregar esquema do SQLite.');
      const data: TableSchema[] = await res.json();
      setTables(data);
      if (data.length > 0 && !selectedTable) {
        setSelectedTable(data[0].name);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoadingSchema(false);
    }
  };

  const executeSql = async (queryToRun?: string) => {
    const sql = (queryToRun || sqlInput).trim();
    if (!sql) return;

    setExecuting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/database/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro na execução da consulta SQL.');
      }

      setQueryResult(data);
      setCurrentPage(1);
    } catch (err: any) {
      setErrorMsg(err.message);
      setQueryResult(null);
    } finally {
      setExecuting(false);
    }
  };

  const handleSelectTable = (tableName: string) => {
    setSelectedTable(tableName);
    const sql = `SELECT * FROM "${tableName}" LIMIT 50;`;
    setSqlInput(sql);
    executeSql(sql);
  };

  const handleExportJSON = () => {
    if (!queryResult || queryResult.rows.length === 0) return;
    const blob = new Blob([JSON.stringify(queryResult.rows, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_result_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!queryResult || queryResult.rows.length === 0) return;
    const cols = queryResult.columns;
    const header = cols.join(',');
    const rows = queryResult.rows.map((row) =>
      cols
        .map((col) => {
          const val = row[col] === null || row[col] === undefined ? '' : String(row[col]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlInput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Filtered rows for result table
  const filteredRows = React.useMemo(() => {
    if (!queryResult?.rows) return [];
    if (!filterText.trim()) return queryResult.rows;

    const lower = filterText.toLowerCase();
    return queryResult.rows.filter((row) =>
      queryResult.columns.some((col) => {
        const val = row[col];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(lower);
      })
    );
  }, [queryResult, filterText]);

  // Paginated rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const paginatedRows = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const activeTableSchema = tables.find((t) => t.name === selectedTable);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080d1a] overflow-hidden text-slate-200">
      {/* Top Banner / Status Bar */}
      <div className="border-b border-slate-800 bg-[#0c1222] px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">SQLite Workspace Database</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                Online &bull; WAL Mode
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span>Arquivo: data/workspace.db</span>
              <span>&bull;</span>
              <span>{tables.length} tabelas no catálogo</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSchema}
            disabled={loadingSchema}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
            title="Recarregar esquema do banco"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${loadingSchema ? 'animate-spin' : ''}`} />
            <span>Atualizar Catálogo</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout: 2-Columns */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Tables & Columns Navigation */}
        <div className="w-72 border-r border-slate-800 bg-[#0a0f1d] flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Table2 className="w-3.5 h-3.5 text-emerald-400" />
              Tabelas ({tables.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {tables.map((table) => {
              const isSelected = selectedTable === table.name;
              return (
                <div
                  key={table.name}
                  onClick={() => handleSelectTable(table.name)}
                  className={`p-2.5 rounded-xl cursor-pointer transition border ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-slate-900/50 hover:bg-slate-800/60 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold flex items-center gap-1.5">
                      <Table2 className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                      {table.name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                      {table.rowCount} linhas
                    </span>
                  </div>

                  {/* Schema Preview for Selected Table */}
                  {isSelected && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Colunas ({table.columns.length}):
                      </span>
                      {table.columns.map((c) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between py-0.5 px-1.5 rounded bg-slate-950/60 font-mono text-[10px]"
                        >
                          <span className="flex items-center gap-1 text-slate-200">
                            {c.pk && (
                              <span title="Chave Primária">
                                <Key className="w-2.5 h-2.5 text-amber-400" />
                              </span>
                            )}
                            {c.name}
                          </span>
                          <span className="text-slate-400 text-[9px]">{c.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick Presets Section */}
          <div className="p-3 border-t border-slate-800 bg-[#070b16]">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              Consultas Rápidas
            </span>
            <div className="space-y-1">
              {PRESET_QUERIES.map((preset) => (
                <button
                  key={preset.title}
                  onClick={() => {
                    setSqlInput(preset.sql);
                    executeSql(preset.sql);
                  }}
                  className="w-full text-left p-1.5 rounded hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition flex items-center justify-between group"
                >
                  <span className="truncate text-[11px]">{preset.title}</span>
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: SQL Editor & Results */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#080d1a]">
          {/* SQL Editor Area */}
          <div className="p-4 border-b border-slate-800 bg-[#0b1120] space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span>Consulta SQL Ad-hoc (SQLite)</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySQL}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1 transition"
                  title="Copiar SQL para a área de transferência"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>

                <button
                  onClick={() => setSqlInput('')}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                >
                  Limpar
                </button>

                <button
                  onClick={() => executeSql()}
                  disabled={executing || !sqlInput.trim()}
                  className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${executing ? 'animate-pulse' : ''}`} />
                  <span>{executing ? 'Executando...' : 'Executar Query'}</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                value={sqlInput}
                onChange={(e) => setSqlInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    executeSql();
                  }
                }}
                rows={3}
                placeholder="Ex: SELECT * FROM files WHERE language = 'typescript' LIMIT 20;"
                className="w-full bg-[#050811] border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-emerald-500 leading-relaxed resize-y"
              />
              <span className="absolute right-3 bottom-2 text-[10px] text-slate-500 pointer-events-none">
                Pressione Ctrl + Enter para executar
              </span>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-red-200 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-mono">{errorMsg}</div>
              </div>
            )}
          </div>

          {/* Results Toolbar */}
          {queryResult && (
            <div className="px-4 py-2 border-b border-slate-800 bg-[#090e1c] flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Resultados:</span>
                </span>
                <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
                  <Rows className="w-3.5 h-3.5 text-slate-500" />
                  {queryResult.rowCount} linhas
                </span>
                <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
                  <Columns className="w-3.5 h-3.5 text-slate-500" />
                  {queryResult.columns.length} colunas
                </span>
                <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  {queryResult.durationMs} ms
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filtrar nesta visualização..."
                    value={filterText}
                    onChange={(e) => {
                      setFilterText(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-7 pr-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-emerald-500 w-48"
                  />
                </div>

                <button
                  onClick={handleExportCSV}
                  disabled={queryResult.rows.length === 0}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded text-xs flex items-center gap-1 transition"
                  title="Exportar como CSV"
                >
                  <Download className="w-3 h-3" />
                  <span>CSV</span>
                </button>

                <button
                  onClick={handleExportJSON}
                  disabled={queryResult.rows.length === 0}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded text-xs flex items-center gap-1 transition"
                  title="Exportar como JSON"
                >
                  <Download className="w-3 h-3" />
                  <span>JSON</span>
                </button>
              </div>
            </div>
          )}

          {/* Results Grid View */}
          <div className="flex-1 overflow-auto bg-[#070b16]">
            {queryResult && queryResult.columns.length > 0 ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0e1628] text-slate-300 font-mono text-[11px] sticky top-0 border-b border-slate-800 shadow-sm z-10">
                  <tr>
                    <th className="py-2 px-3 border-r border-slate-800 text-slate-500 w-12 text-center">#</th>
                    {queryResult.columns.map((col) => (
                      <th key={col} className="py-2 px-3 border-r border-slate-800 font-semibold truncate max-w-xs">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {paginatedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition">
                      <td className="py-1.5 px-3 border-r border-slate-800 text-slate-600 text-center select-none">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      {queryResult.columns.map((col) => {
                        const cellVal = row[col];
                        const isNull = cellVal === null || cellVal === undefined;
                        const strVal = isNull ? 'NULL' : String(cellVal);
                        const isTruncated = strVal.length > 100;
                        return (
                          <td
                            key={col}
                            className={`py-1.5 px-3 border-r border-slate-800/80 truncate max-w-sm ${
                              isNull ? 'text-slate-600 italic' : 'text-slate-300'
                            }`}
                            title={strVal}
                          >
                            {isTruncated ? `${strVal.slice(0, 100)}...` : strVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : queryResult ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mb-2" />
                <p className="text-sm font-semibold text-slate-300">Comando SQL executado com sucesso</p>
                <p className="text-xs text-slate-400 mt-1">
                  Linhas afetadas: {queryResult.rowCount} &bull; Tempo: {queryResult.durationMs}ms
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-600">
                <Database className="w-12 h-12 text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-400">Nenhuma consulta executada ainda</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Selecione uma tabela à esquerda ou escreva uma instrução SQL personalizada no editor acima para
                  inspecionar os registros do workspace.
                </p>
              </div>
            )}
          </div>

          {/* Results Pagination Bar */}
          {queryResult && queryResult.columns.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-800 bg-[#090e1c] flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400 text-[11px]">
                Mostrando {paginatedRows.length} de {filteredRows.length} registros
              </span>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 text-[11px]">Por página:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded text-xs transition"
                  >
                    Anterior
                  </button>
                  <span className="px-2 font-mono text-[11px] text-slate-400">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded text-xs transition"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
