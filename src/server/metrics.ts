/**
 * Métricas no formato de exposição do Prometheus, sem dependências.
 *
 * Cardinalidade controlada: o rótulo `route` é o padrão do Express
 * (ex.: /api/projects/:name) ou "unmatched" — nunca o caminho cru do cliente.
 */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

interface Histogram {
  counts: number[]; // acumulado por bucket (le)
  sum: number;
  count: number;
}

const requests = new Map<string, number>();
const durations = new Map<string, Histogram>();
const SEP = '\u0000';

function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Registra uma requisição concluída. */
export function observeRequest(method: string, route: string, status: number, seconds: number): void {
  const reqKey = [method, route, `${Math.floor(status / 100)}xx`].join(SEP);
  requests.set(reqKey, (requests.get(reqKey) ?? 0) + 1);

  const durKey = [method, route].join(SEP);
  let h = durations.get(durKey);
  if (!h) {
    h = { counts: new Array(BUCKETS.length).fill(0), sum: 0, count: 0 };
    durations.set(durKey, h);
  }
  BUCKETS.forEach((b, i) => {
    if (seconds <= b) h!.counts[i]++;
  });
  h.sum += seconds;
  h.count++;
}

export interface MetricsSnapshot {
  sseClients: number;
  storeBytes: number;
  storeProjects: number;
  workerJobsCompleted: number;
  workerPoolEnabled: boolean;
}

function gauge(out: string[], name: string, help: string, value: number): void {
  out.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${value}`);
}

export function renderMetrics(snapshot: MetricsSnapshot): string {
  const out: string[] = [];

  out.push('# HELP mcp_http_requests_total Requisições HTTP por método, rota e classe de status.');
  out.push('# TYPE mcp_http_requests_total counter');
  for (const [key, n] of requests) {
    const [method, route, status] = key.split(SEP);
    out.push(`mcp_http_requests_total{method="${method}",route="${esc(route)}",status="${status}"} ${n}`);
  }

  out.push('# HELP mcp_http_request_duration_seconds Duração das requisições HTTP.');
  out.push('# TYPE mcp_http_request_duration_seconds histogram');
  for (const [key, h] of durations) {
    const [method, route] = key.split(SEP);
    const labels = `method="${method}",route="${esc(route)}"`;
    BUCKETS.forEach((b, i) => out.push(`mcp_http_request_duration_seconds_bucket{${labels},le="${b}"} ${h.counts[i]}`));
    out.push(`mcp_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${h.count}`);
    out.push(`mcp_http_request_duration_seconds_sum{${labels}} ${h.sum}`);
    out.push(`mcp_http_request_duration_seconds_count{${labels}} ${h.count}`);
  }

  const mem = process.memoryUsage();
  gauge(out, 'mcp_process_uptime_seconds', 'Tempo de atividade do processo.', Math.round(process.uptime()));
  gauge(out, 'mcp_process_resident_memory_bytes', 'Memória residente (RSS).', mem.rss);
  gauge(out, 'mcp_process_heap_used_bytes', 'Heap do V8 em uso.', mem.heapUsed);
  gauge(out, 'mcp_sse_clients', 'Clientes SSE conectados.', snapshot.sseClients);
  gauge(out, 'mcp_store_bytes', 'Bytes de conteúdo mantidos no store.', snapshot.storeBytes);
  gauge(out, 'mcp_store_projects', 'Projetos carregados em memória.', snapshot.storeProjects);
  gauge(out, 'mcp_parse_worker_jobs_completed', 'Parses concluídos em worker threads.', snapshot.workerJobsCompleted);
  gauge(out, 'mcp_parse_worker_pool_enabled', 'Pool de workers de parse ativo (1) ou não (0).', snapshot.workerPoolEnabled ? 1 : 0);

  return out.join('\n') + '\n';
}
