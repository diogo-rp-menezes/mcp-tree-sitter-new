/**
 * Worker thread: executa o parse Tree-sitter (WASM) fora da thread principal.
 * Cada worker tem sua própria instância do runtime e das gramáticas.
 */
import { parentPort } from 'worker_threads';
import { initTreeSitter, parseWithTreeSitter } from './treeSitter';

interface ParseRequest {
  id: number;
  source: string;
  language: string;
  options?: { maxDepth?: number; includeText?: boolean };
}

if (!parentPort) {
  throw new Error('parseWorker deve ser executado como worker_thread');
}

const port = parentPort;
const ready = initTreeSitter();

port.on('message', async (req: ParseRequest) => {
  try {
    await ready;
    const ast = await parseWithTreeSitter(req.source, req.language, req.options);
    port.postMessage({ id: req.id, ast });
  } catch (err) {
    port.postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
});
