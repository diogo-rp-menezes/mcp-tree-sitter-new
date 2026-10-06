/**
 * Pool de worker threads para parsing pesado (PRF-01).
 *
 * - Arquivos pequenos são parseados na thread principal (mais rápido que clonar a AST).
 * - Cada job tem timeout; ao estourar, o worker é encerrado e recriado (protege contra
 *   entradas patológicas) e o chamador recebe um erro.
 * - Se o worker não puder ser iniciado (ex.: TypeScript sem loader), o pool se desativa
 *   e o chamador usa o caminho in-thread.
 *
 * Configuração: MCP_TS_WORKERS (nº de workers; 0 desativa; padrão 2, 0 sob Vitest),
 * MCP_TS_WORKER_MIN_CHARS (padrão 20000), MCP_TS_WORKER_TIMEOUT_MS (padrão 30000).
 */
import { Worker } from 'worker_threads';
import type { ASTNode } from './types';
import { logger, serializeError } from './logger';

interface PendingJob {
  resolve: (ast: ASTNode) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  worker: Worker;
}

export interface WorkerParseOptions {
  maxDepth?: number;
  includeText?: boolean;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function getWorkerPoolConfig() {
  return {
    size: readInt('MCP_TS_WORKERS', process.env.VITEST ? 0 : 2),
    minChars: readInt('MCP_TS_WORKER_MIN_CHARS', 20000),
    timeoutMs: readInt('MCP_TS_WORKER_TIMEOUT_MS', 30000) || 30000,
  };
}

export class ParseTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseTimeoutError';
  }
}

class ParseWorkerPool {
  private workers: Worker[] = [];
  private inflight = new Map<Worker, number>();
  private pending = new Map<number, PendingJob>();
  private nextId = 1;
  private disabled = false;
  /** Jobs concluídos com sucesso em workers (diagnóstico e testes). */
  completed = 0;

  get isDisabled(): boolean {
    return this.disabled;
  }

  get enabled(): boolean {
    return !this.disabled && getWorkerPoolConfig().size > 0;
  }

  shouldUse(sourceLength: number): boolean {
    return this.enabled && sourceLength >= getWorkerPoolConfig().minChars;
  }

  private spawn(): Worker {
    // O worker é TypeScript (executado via tsx): o bootstrap .mjs registra o loader dentro da thread.
    const worker = new Worker(new URL('./parseWorkerBootstrap.mjs', import.meta.url));
    this.inflight.set(worker, 0);
    worker.on('message', (msg: { id: number; ast?: ASTNode; error?: string }) => {
      const job = this.pending.get(msg.id);
      if (!job) return;
      this.pending.delete(msg.id);
      clearTimeout(job.timer);
      this.inflight.set(job.worker, Math.max(0, (this.inflight.get(job.worker) ?? 1) - 1));
      if (msg.error !== undefined) job.reject(new Error(msg.error));
      else {
        this.completed++;
        job.resolve(msg.ast as ASTNode);
      }
    });
    worker.on('error', (err) => this.handleWorkerDeath(worker, err));
    worker.on('exit', (code) => {
      if (this.workers.includes(worker)) this.handleWorkerDeath(worker, new Error(`worker saiu com código ${code}`));
    });
    return worker;
  }

  private handleWorkerDeath(worker: Worker, err: Error): void {
    this.workers = this.workers.filter((w) => w !== worker);
    this.inflight.delete(worker);
    for (const [id, job] of this.pending) {
      if (job.worker === worker) {
        this.pending.delete(id);
        clearTimeout(job.timer);
        job.reject(err);
      }
    }
    // Falha repetida de inicialização: desativa o pool para usar o caminho in-thread.
    if (this.workers.length === 0) {
      logger.warn('parse_worker_pool_disabled', { err: serializeError(err) });
      this.disabled = true;
    }
  }

  private pick(): Worker {
    const size = getWorkerPoolConfig().size;
    while (this.workers.length < size) this.workers.push(this.spawn());
    return this.workers.reduce((best, w) => ((this.inflight.get(w) ?? 0) < (this.inflight.get(best) ?? 0) ? w : best));
  }

  parse(source: string, language: string, options?: WorkerParseOptions): Promise<ASTNode> {
    return new Promise<ASTNode>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.pick();
      } catch (err) {
        this.disabled = true;
        return reject(err instanceof Error ? err : new Error(String(err)));
      }
      const id = this.nextId++;
      const timeoutMs = getWorkerPoolConfig().timeoutMs;
      const timer = setTimeout(() => {
        // Worker preso em entrada patológica: encerra e deixa o próximo job recriar.
        this.pending.delete(id);
        logger.warn('parse_worker_timeout', { language, chars: source.length, timeoutMs });
        this.workers = this.workers.filter((w) => w !== worker);
        this.inflight.delete(worker);
        for (const [otherId, job] of this.pending) {
          if (job.worker === worker) {
            this.pending.delete(otherId);
            clearTimeout(job.timer);
            job.reject(new ParseTimeoutError('Parse cancelado: worker reiniciado por timeout'));
          }
        }
        void worker.terminate();
        reject(new ParseTimeoutError(`Parse excedeu o tempo limite de ${timeoutMs} ms`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer, worker });
      this.inflight.set(worker, (this.inflight.get(worker) ?? 0) + 1);
      worker.postMessage({ id, source, language, options });
    });
  }

  async shutdown(): Promise<void> {
    const workers = this.workers;
    this.workers = [];
    this.inflight.clear();
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

export const parseWorkerPool = new ParseWorkerPool();
