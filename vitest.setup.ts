import fs from 'fs';
import os from 'os';
import path from 'path';

// Cada worker de teste usa seu próprio banco temporário: os testes nunca tocam data/workspace.db.
if (!process.env.MCP_DB_PATH) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpts-test-db-'));
  process.env.MCP_DB_PATH = path.join(dir, 'workspace.db');
}
