// Executado via `node --import tsx` pelo teste workerPool.test.ts (fora do Vitest).
import { parseSourceToASTAsync } from '../parser';
import { parseWorkerPool } from '../parseWorkerPool';
import { initTreeSitter } from '../treeSitter';

await initTreeSitter();
const big = Array.from({ length: 3000 }, (_, i) => `def f${i}(x):\n    return x + ${i}\n`).join('\n');
// Mede o atraso do event loop enquanto o parse acontece.
let maxLag = 0;
let last = Date.now();
const t = setInterval(() => {
  const now = Date.now();
  maxLag = Math.max(maxLag, now - last - 10);
  last = now;
}, 10);
const viaWorker = await parseSourceToASTAsync(big, 'python');
clearInterval(t);
const workerJobs = parseWorkerPool.completed;
const disabled = parseWorkerPool.isDisabled;
process.env.MCP_TS_WORKERS = '0';
const inThread = await parseSourceToASTAsync(big, 'python');
const strip = (n: any): any => ({ type: n.type, c: n.children.map(strip) });
const same = JSON.stringify(strip(viaWorker)) === JSON.stringify(strip(inThread));
await parseWorkerPool.shutdown();
console.log(JSON.stringify({ workerJobs, disabled, chars: big.length, same, children: viaWorker.children.length, maxLag }));
