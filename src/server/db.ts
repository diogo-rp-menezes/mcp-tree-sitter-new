import { createRequire } from 'node:module';
import path from 'path';
import fs from 'fs';
import { Project, ProjectFile } from './types';

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite');

// Caminho do banco: MCP_DB_PATH (ex.: testes usam um arquivo temporário) ou ./data/workspace.db
const DB_PATH = process.env.MCP_DB_PATH
  ? path.resolve(process.env.MCP_DB_PATH)
  : path.join(path.resolve(process.cwd(), 'data'), 'workspace.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export class SQLiteWorkspaceStorage {
  private db: any;

  constructor(dbPath: string = DB_PATH) {
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS projects (
        name TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS files (
        project_name TEXT NOT NULL,
        path TEXT NOT NULL,
        language TEXT NOT NULL,
        content TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_name, path),
        FOREIGN KEY (project_name) REFERENCES projects(name) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_name);
      CREATE INDEX IF NOT EXISTS idx_files_lang ON files(language);
    `);
  }

  /**
   * Loads all projects and their files into memory on server start.
   */
  loadAllProjects(): Map<string, Project> {
    const projectsMap = new Map<string, Project>();

    const projectStmt = this.db.prepare('SELECT name, path, description FROM projects');
    const projectRows = projectStmt.all() as Array<{ name: string; path: string; description: string | null }>;

    const fileStmt = this.db.prepare('SELECT project_name, path, language, content, size_bytes, updated_at FROM files WHERE project_name = ?');

    for (const p of projectRows) {
      const filesMap = new Map<string, ProjectFile>();
      const fileRows = fileStmt.all(p.name) as Array<{
        project_name: string;
        path: string;
        language: string;
        content: string;
        size_bytes: number;
        updated_at: string;
      }>;

      for (const f of fileRows) {
        filesMap.set(f.path, {
          path: f.path,
          language: f.language,
          content: f.content,
          sizeBytes: Number(f.size_bytes),
          lastModified: f.updated_at || new Date().toISOString(),
        });
      }

      projectsMap.set(p.name, {
        name: p.name,
        path: p.path,
        description: p.description || '',
        files: filesMap,
      });
    }

    return projectsMap;
  }

  /**
   * Saves or updates a project in SQLite.
   */
  saveProject(name: string, projectPath: string, description: string) {
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, path, description, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(name) DO UPDATE SET
        path = excluded.path,
        description = excluded.description,
        updated_at = datetime('now')
    `);
    stmt.run(name, projectPath, description);
  }

  /**
   * Saves or updates a file in SQLite.
   */
  saveFile(projectName: string, filePath: string, language: string, content: string, sizeBytes: number) {
    const stmt = this.db.prepare(`
      INSERT INTO files (project_name, path, language, content, size_bytes, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(project_name, path) DO UPDATE SET
        language = excluded.language,
        content = excluded.content,
        size_bytes = excluded.size_bytes,
        updated_at = datetime('now')
    `);
    stmt.run(projectName, filePath, language, content, sizeBytes);
  }

  /**
   * Batch saves multiple files in a single transaction for maximum performance.
   */
  saveFilesBatch(projectName: string, files: Array<{ path: string; language: string; content: string; sizeBytes: number }>) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO files (project_name, path, language, content, size_bytes, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(project_name, path) DO UPDATE SET
          language = excluded.language,
          content = excluded.content,
          size_bytes = excluded.size_bytes,
          updated_at = datetime('now')
      `);

      for (const f of files) {
        stmt.run(projectName, f.path, f.language, f.content, f.sizeBytes);
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Deletes a file from SQLite.
   */
  deleteFile(projectName: string, filePath: string): boolean {
    const stmt = this.db.prepare('DELETE FROM files WHERE project_name = ? AND path = ?');
    const result = stmt.run(projectName, filePath);
    return (result as any)?.changes > 0;
  }

  /**
   * Introspects database schema, returning table metadata, column definitions, and row counts.
   */
  getDatabaseSchema(): Array<{
    name: string;
    rowCount: number;
    columns: Array<{ cid: number; name: string; type: string; notnull: boolean; pk: boolean }>;
  }> {
    const tableStmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC");
    const tables = tableStmt.all() as Array<{ name: string }>;

    const result: Array<{
      name: string;
      rowCount: number;
      columns: Array<{ cid: number; name: string; type: string; notnull: boolean; pk: boolean }>;
    }> = [];

    for (const t of tables) {
      const colStmt = this.db.prepare(`PRAGMA table_info("${t.name}")`);
      const cols = colStmt.all() as Array<{ cid: number; name: string; type: string; notnull: number; pk: number }>;

      let rowCount = 0;
      try {
        const countStmt = this.db.prepare(`SELECT count(*) as count FROM "${t.name}"`);
        const countRow = countStmt.get() as { count: number };
        rowCount = Number(countRow?.count || 0);
      } catch {
        rowCount = 0;
      }

      result.push({
        name: t.name,
        rowCount,
        columns: cols.map((c) => ({
          cid: c.cid,
          name: c.name,
          type: c.type || 'TEXT',
          notnull: Boolean(c.notnull),
          pk: Boolean(c.pk),
        })),
      });
    }

    return result;
  }

  /**
   * Fetches paginated records from a table.
   */
  getTableRecords(tableName: string, limit = 50, offset = 0): { columns: string[]; rows: any[]; total: number } {
    // Validate table name to avoid injection
    const validTables = this.getDatabaseSchema().map((t) => t.name);
    if (!validTables.includes(tableName)) {
      throw new Error(`Tabela '${tableName}' não existe no banco de dados SQLite.`);
    }

    const countStmt = this.db.prepare(`SELECT count(*) as count FROM "${tableName}"`);
    const countRow = countStmt.get() as { count: number };
    const total = Number(countRow?.count || 0);

    const safeLimit = Math.max(1, Math.min(limit, 500));
    const safeOffset = Math.max(0, offset);

    const stmt = this.db.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`);
    const rows = stmt.all(safeLimit, safeOffset) as any[];

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { columns, rows, total };
  }

  /**
   * Executes an ad-hoc SQL query and measures execution time.
   */
  executeRawQuery(
    sql: string,
    options: { allowWrite?: boolean } = {}
  ): {
    columns: string[];
    rows: any[];
    rowCount: number;
    durationMs: number;
    isReadonly: boolean;
    changes?: number;
  } {
    const trimmed = sql.trim();
    if (!trimmed) {
      throw new Error('A consulta SQL não pode estar vazia.');
    }

    const allowWrite = options.allowWrite ?? true;
    const startTime = performance.now();
    const isReadonly = /^(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(trimmed);

    if (!allowWrite) {
      if (!isReadonly) {
        throw new Error('Somente consultas de leitura (SELECT/WITH/EXPLAIN/PRAGMA) são permitidas neste console.');
      }
      if (/^PRAGMA\b[^;]*=/i.test(trimmed)) {
        throw new Error('PRAGMA com atribuição não é permitido no modo somente leitura.');
      }
    }

    if (isReadonly) {
      // Defense in depth: WITH ... DELETE e PRAGMAs mutáveis falham sob query_only.
      if (!allowWrite) this.db.exec('PRAGMA query_only = ON;');
      let rows: any[];
      try {
        rows = this.db.prepare(trimmed).all() as any[];
      } finally {
        if (!allowWrite) this.db.exec('PRAGMA query_only = OFF;');
      }
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        columns,
        rows,
        rowCount: rows.length,
        durationMs,
        isReadonly: true,
      };
    } else {
      const stmt = this.db.prepare(trimmed);
      const result = stmt.run() as any;
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const changes = result?.changes || 0;

      return {
        columns: ['affected_rows', 'last_insert_rowid'],
        rows: [{ affected_rows: changes, last_insert_rowid: result?.lastInsertRowid ?? null }],
        rowCount: changes,
        durationMs,
        isReadonly: false,
        changes,
      };
    }
  }

  /**
  * Updates an existing project's metadata (name, path, description).
  * Handles safe primary key renaming across child files in a single transaction.
  */
  updateProject(
    oldName: string,
    updates: { name?: string; path?: string; description?: string }
  ): { name: string; path: string; description: string } {
    const getStmt = this.db.prepare('SELECT name, path, description FROM projects WHERE name = ?');
    const existing = getStmt.get(oldName) as { name: string; path: string; description: string | null } | undefined;
    if (!existing) {
      throw new Error(`Projeto '${oldName}' não encontrado no banco SQLite.`);
    }

    const newName = updates.name ? updates.name.trim() : existing.name;
    const newPath = updates.path ? updates.path.trim() : existing.path;
    const newDesc = updates.description !== undefined ? updates.description : (existing.description || '');

    if (newName !== oldName) {
      // Renaming primary key: run in transaction
      this.db.exec('BEGIN TRANSACTION;');
      try {
        // Create new project entry
        const insertStmt = this.db.prepare(`
          INSERT INTO projects (name, path, description, updated_at)
          VALUES (?, ?, ?, datetime('now'))
        `);
        insertStmt.run(newName, newPath, newDesc);

        // Copy/relink all files to new project name
        const copyFilesStmt = this.db.prepare(`
          INSERT INTO files (project_name, path, language, content, size_bytes, updated_at)
          SELECT ?, path, language, content, size_bytes, updated_at FROM files WHERE project_name = ?
        `);
        copyFilesStmt.run(newName, oldName);

        // Delete old project and its files
        const delStmt = this.db.prepare('DELETE FROM projects WHERE name = ?');
        delStmt.run(oldName);

        this.db.exec('COMMIT;');
      } catch (err) {
        this.db.exec('ROLLBACK;');
        throw err;
      }
    } else {
      const updateStmt = this.db.prepare(`
        UPDATE projects SET path = ?, description = ?, updated_at = datetime('now') WHERE name = ?
      `);
      updateStmt.run(newPath, newDesc, oldName);
    }

    return { name: newName, path: newPath, description: newDesc };
  }

  /**
   * Clones a project and all its files into a new project name in SQLite.
   */
  cloneProject(
    sourceName: string,
    targetName: string,
    targetPath?: string,
    targetDescription?: string
  ): { name: string; path: string; description: string; filesCount: number } {
    const getStmt = this.db.prepare('SELECT name, path, description FROM projects WHERE name = ?');
    const source = getStmt.get(sourceName) as { name: string; path: string; description: string | null } | undefined;
    if (!source) {
      throw new Error(`Projeto de origem '${sourceName}' não encontrado.`);
    }

    const finalPath = targetPath ? targetPath.trim() : `/projects/${targetName.trim()}`;
    const finalDesc = targetDescription !== undefined ? targetDescription : `Clone de ${sourceName}`;

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const insertProj = this.db.prepare(`
        INSERT INTO projects (name, path, description, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      `);
      insertProj.run(targetName.trim(), finalPath, finalDesc);

      const copyFiles = this.db.prepare(`
        INSERT INTO files (project_name, path, language, content, size_bytes, updated_at)
        SELECT ?, path, language, content, size_bytes, datetime('now') FROM files WHERE project_name = ?
      `);
      const res = copyFiles.run(targetName.trim(), sourceName);

      this.db.exec('COMMIT;');
      return {
        name: targetName.trim(),
        path: finalPath,
        description: finalDesc,
        filesCount: Number((res as any)?.changes || 0),
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Deletes a project and all its files (via CASCADE) from SQLite.
   */
  deleteProject(projectName: string): boolean {
    const stmt = this.db.prepare('DELETE FROM projects WHERE name = ?');
    const result = stmt.run(projectName);
    return (result as any)?.changes > 0;
  }

  /**
   * Close database connection.
   */
  close() {
    this.db.close();
  }
}

export const sqliteStorage = new SQLiteWorkspaceStorage();
