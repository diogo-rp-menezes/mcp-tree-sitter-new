/**
 * Logger estruturado (JSON por linha) sem dependências externas.
 *
 * - Nível via MCP_TS_LOG_LEVEL (DEBUG | INFO | WARN | ERROR | SILENT); padrão INFO.
 * - Silencioso sob Vitest, salvo se MCP_TS_LOG_LEVEL estiver definido.
 * - Sempre escreve em stderr: stdout fica livre para protocolos que o usem.
 * - Nunca registre credenciais; passe apenas campos de diagnóstico em `fields`.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function currentThreshold(): number {
  const raw = process.env.MCP_TS_LOG_LEVEL?.trim().toLowerCase();
  if (raw && raw in ORDER) return ORDER[raw as LogLevel | 'silent'];
  if (process.env.VITEST) return ORDER.silent;
  return ORDER.info;
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack } : {}),
    };
  }
  return { message: String(err) };
}

function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < currentThreshold()) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  process.stderr.write(line + '\n');
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
