// Bootstrap em JS puro: registra o loader do tsx dentro do worker e só então carrega o worker em TypeScript.
import { register } from 'tsx/esm/api';

register();
await import('./parseWorker.ts');
