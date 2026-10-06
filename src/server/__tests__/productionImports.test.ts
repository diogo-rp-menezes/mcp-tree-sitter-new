import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// A imagem de produção instala só `dependencies`: o código de servidor não pode importar
// devDependencies de forma estática (vite, vitest, tailwind...).
const DEV_ONLY = ['vite', 'vitest', '@vitejs/plugin-react', '@tailwindcss/vite'];

function collect(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      collect(p, out);
    } else if (/\.(ts|mjs)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('imports do servidor em produção', () => {
  it('não importa estaticamente devDependencies', () => {
    const root = path.resolve(__dirname, '../../..');
    const files = [path.join(root, 'server.ts'), ...collect(path.join(root, 'src/server'))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const dep of DEV_ONLY) {
        const re = new RegExp(`^\\s*import[^;]*from\\s+['"]${dep.replace(/[/@-]/g, (c) => '\\' + c)}['"]`, 'm');
        if (re.test(src)) offenders.push(`${path.relative(root, f)} -> ${dep}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
