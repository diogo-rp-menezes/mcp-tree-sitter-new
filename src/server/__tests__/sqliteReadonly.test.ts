import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SQLiteWorkspaceStorage } from '../db';

describe('executeRawQuery em modo somente leitura', () => {
  let dir: string;
  let db: SQLiteWorkspaceStorage;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ro-'));
    db = new SQLiteWorkspaceStorage(path.join(dir, 't.db'));
    db.executeRawQuery("INSERT INTO projects (name, path, description) VALUES ('p', '/w/p', 'd')");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('permite SELECT', () => {
    const r = db.executeRawQuery('SELECT name FROM projects', { allowWrite: false });
    expect(r.rowCount).toBe(1);
  });

  it.each([
    "DELETE FROM projects",
    "DROP TABLE projects",
    "INSERT INTO projects (name, path) VALUES ('x','/y')",
    "PRAGMA query_only = OFF",
    "WITH x AS (SELECT 1) DELETE FROM projects",
  ])('bloqueia escrita: %s', (sql) => {
    expect(() => db.executeRawQuery(sql, { allowWrite: false })).toThrow();
    expect(db.executeRawQuery('SELECT count(*) AS n FROM projects').rows[0].n).toBe(1);
  });

  it('mantém escrita liberada quando allowWrite=true', () => {
    const r = db.executeRawQuery("DELETE FROM projects", { allowWrite: true });
    expect(r.changes).toBe(1);
  });
});
