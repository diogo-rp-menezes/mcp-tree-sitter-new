import { sendRouteError } from '../httpErrors';
import { QuotaExceededError } from '../errors';
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { projectStore } from '../store';
import { ensureLanguagesLoaded } from '../parser';

import { getProjectGitStatus, initProjectGitRepo, stageGitFiles, unstageGitFiles, commitGitChanges, switchGitBranch, syncProjectFilesToDisk } from '../git';
import { importGitHubRepository, parseGitHubRepo } from '../github';
import { validateScanDirectoryPath } from '../workspaceRoots';
import type { WorkspaceRootsConfig } from '../workspaceRoots';

export function createProjectsRouter(options: { workspaceRoots: WorkspaceRootsConfig }): Router {
  const router = Router();

  // Projects API
  router.get('/api/projects', (req, res) => {
    res.json(projectStore.listProjects());
  });

  router.get('/api/projects/overview', async (req, res) => {
    try {
      await ensureLanguagesLoaded(projectStore.listLanguages());
      res.json(projectStore.getProjectOverview());
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  router.get('/api/projects/:name/file-stats', async (req, res) => {
    try {
      await ensureLanguagesLoaded(projectStore.listLanguages(req.params.name));
      res.json(projectStore.getProjectFileStats(req.params.name));
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Git Status API for active project
  router.get('/api/projects/:name/git-status', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    const status = getProjectGitStatus(proj.path);
    res.json(status);
  });

  // Initialize Git in project directory
  router.post('/api/projects/:name/git-init', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    try {
      // Sync files to disk first so git tracks them
      const files = Array.from(proj.files.values()).map((f) => ({ path: f.path, content: f.content }));
      syncProjectFilesToDisk(proj.path, files);
      const status = initProjectGitRepo(proj.path);
      res.json(status);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Sync SQLite project files to disk directory
  router.post('/api/projects/:name/git-sync', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    try {
      const files = Array.from(proj.files.values()).map((f) => ({ path: f.path, content: f.content }));
      const result = syncProjectFilesToDisk(proj.path, files);
      const status = getProjectGitStatus(proj.path);
      res.json({ ...result, gitStatus: status });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Stage files for Git commit
  router.post('/api/projects/:name/git-stage', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    try {
      const { files } = req.body;
      const status = stageGitFiles(proj.path, files);
      res.json(status);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Unstage files
  router.post('/api/projects/:name/git-unstage', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    try {
      const { files } = req.body;
      const status = unstageGitFiles(proj.path, files);
      res.json(status);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Commit changes
  router.post('/api/projects/:name/git-commit', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'Mensagem de commit é obrigatória.' });
      const status = commitGitChanges(proj.path, message);
      res.json(status);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Switch or create branch
  router.post('/api/projects/:name/git-branch', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    try {
      const { branch, create } = req.body;
      if (!branch) return res.status(400).json({ error: 'Nome da branch é obrigatório.' });
      const status = switchGitBranch(proj.path, branch, Boolean(create));
      res.json(status);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Export full project bundle as JSON
  router.get('/api/projects/:name/export', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Project not found' });

    const bundle = {
      name: proj.name,
      path: proj.path,
      description: proj.description,
      exportedAt: new Date().toISOString(),
      filesCount: proj.files.size,
      files: Array.from(proj.files.values()).map((f) => ({
        path: f.path,
        language: f.language,
        sizeBytes: f.sizeBytes,
        lastModified: f.lastModified,
        content: f.content,
      })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${proj.name}-export.json"`);
    res.json(bundle);
  });

  router.post('/api/projects', (req, res) => {
    const { name, path, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });
    const proj = projectStore.createProject(name, path, description);
    res.json({ status: 'created', project: proj.name, path: proj.path });
  });

  // Batch Create Project with Files (e.g. from local directory picker)
  router.post('/api/projects/batch-create', (req, res) => {
    try {
      const { name, path: dirPath, description, files } = req.body;
      if (!name) return res.status(400).json({ error: 'Project name is required' });
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'files must be a non-empty array' });
      }

      const finalPath = dirPath || `/workspace/${name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
      const proj = projectStore.createProject(name, finalPath, description || `Imported project ${name}`);

      const detectedLangs = new Set<string>();
      for (const f of files) {
        if (f.path && typeof f.content === 'string') {
          try {
            const saved = projectStore.saveFile(proj.name, f.path, f.content);
            detectedLangs.add(saved.language);
          } catch (err) {
            if (err instanceof QuotaExceededError) throw err;
            // skip if path violates isolation
          }
        }
      }

      res.json({
        status: 'created',
        project: proj.name,
        path: proj.path,
        filesCount: proj.files.size,
        detectedLanguages: Array.from(detectedLangs),
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Scan Local Directory on Host System
  router.post('/api/scan-directory', (req, res) => {
    try {
      const { path: dirPath, name: customName, maxFiles = 150 } = req.body;
      if (!dirPath) {
        return res.status(400).json({ error: 'Directory path is required' });
      }

      const validation = validateScanDirectoryPath(dirPath, options.workspaceRoots);
      if (validation.ok === false) {
        const failure = validation as Extract<typeof validation, { ok: false }>;
        return res.status(failure.status).json({ error: failure.error });
      }
      const normalizedPath = validation.resolvedPath;

      const baseName = path.basename(normalizedPath) || 'scanned-project';
      const projectName = (customName || baseName).toLowerCase().replace(/[^a-z0-9_-]/g, '-');

      const IGNORE_DIRS = new Set([
        'node_modules',
        '.git',
        '.next',
        'dist',
        'build',
        '.venv',
        'venv',
        '__pycache__',
        '.turbo',
        '.cache',
        '.idea',
        '.vscode',
        '.ssh',
        '.aws',
        'coverage',
      ]);

      const ALLOWED_EXTS = new Set([
        '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
        '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
        '.json', '.yaml', '.yml', '.toml', '.md', '.sql', '.html', '.css'
      ]);

      const discoveredFiles: Array<{ relativePath: string; absolutePath: string; size: number }> = [];

      function walk(currentDir: string) {
        if (discoveredFiles.length >= maxFiles) return;
        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
          return;
        }

        for (const entry of entries) {
          if (discoveredFiles.length >= maxFiles) break;
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
              walk(fullPath);
            }
          } else if (entry.isFile()) {
            // Protect against reading secret/credential files
            if (
              entry.name.startsWith('.env') ||
              entry.name.includes('credential') ||
              entry.name.includes('id_rsa') ||
              entry.name.endsWith('.pem')
            ) {
              continue;
            }
            const ext = path.extname(entry.name).toLowerCase();
            if (ALLOWED_EXTS.has(ext)) {
              const rel = path.relative(normalizedPath, fullPath).replace(/\\/g, '/');
              try {
                const fileStat = fs.statSync(fullPath);
                if (fileStat.size <= 1024 * 1024) {
                  discoveredFiles.push({
                    relativePath: rel,
                    absolutePath: fullPath,
                    size: fileStat.size,
                  });
                }
              } catch {
                // skip
              }
            }
          }
        }
      }

      walk(normalizedPath);

      if (discoveredFiles.length === 0) {
        return res.status(400).json({
          error: `No supported source code files found in directory: ${normalizedPath}`,
        });
      }

      // Create isolated project
      const proj = projectStore.createProject(
        projectName,
        normalizedPath,
        `Project scanned from ${normalizedPath} (${discoveredFiles.length} files)`
      );

      // Save files into the isolated project
      const detectedLangs = new Set<string>();
      for (const item of discoveredFiles) {
        try {
          const content = fs.readFileSync(item.absolutePath, 'utf-8');
          const saved = projectStore.saveFile(proj.name, item.relativePath, content);
          detectedLangs.add(saved.language);
        } catch (err) {
          if (err instanceof QuotaExceededError) throw err;
          // ignore unreadable files
        }
      }

      res.json({
        status: 'scanned',
        project: proj.name,
        path: proj.path,
        filesCount: proj.files.size,
        detectedLanguages: Array.from(detectedLangs),
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Import Project directly from GitHub with streaming buffer system
  router.post('/api/projects/import-github', async (req, res) => {
    try {
      const { repoUrl, branch, subpath, projectName: customName, token, maxFiles } = req.body;
      if (!repoUrl) {
        return res.status(400).json({ error: 'A URL ou identificador do repositório (owner/repo) é obrigatório.' });
      }

      const parsed = parseGitHubRepo(repoUrl);
      if (!parsed) {
        return res.status(400).json({ error: 'Formato de repositório inválido. Utilize "owner/repo" ou "https://github.com/owner/repo".' });
      }

      const cleanProjName = (customName || parsed.repo)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/^-+|-+$/g, '') || 'github-project';

      const projPath = `/workspace/${cleanProjName}`;

      let createdProj = projectStore.getProject(cleanProjName);
      if (!createdProj) {
        createdProj = projectStore.createProject(
          cleanProjName,
          projPath,
          `Repositório importado do GitHub: ${parsed.owner}/${parsed.repo}`
        );
      }

      let savedCount = 0;
      const detectedLangs = new Set<string>();

      // Import with streaming buffer: files are persisted in batches as they stream in
      const result = await importGitHubRepository({
        repoUrl,
        branch,
        subpath,
        token,
        maxFiles: typeof maxFiles === 'number' && maxFiles > 0 ? maxFiles : 0, // 0 = unlimited
        batchSize: 25,
        onBatch: (batch) => {
          projectStore.saveFilesBatch(
            cleanProjName,
            batch.map((f) => ({ path: f.path, content: f.content }))
          );
          for (const f of batch) {
            detectedLangs.add(f.language);
          }
          savedCount += batch.length;
        },
      });

      // Update project description with stars and branch
      if (result.repo.description) {
        createdProj.description = `${result.repo.description} (GitHub: ${result.repo.owner}/${result.repo.repo}@${result.branch})`;
      }

      res.json({
        status: 'imported',
        project: cleanProjName,
        path: projPath,
        filesCount: savedCount,
        totalDiscovered: result.totalDiscovered,
        detectedLanguages: Array.from(detectedLangs),
        repoUrl: `https://github.com/${result.repo.owner}/${result.repo.repo}`,
        branch: result.branch,
        stars: result.repo.stars,
      });
    } catch (err) {
      return sendRouteError(req, res, err, 'Falha ao importar repositório do GitHub.');
    }
  });

  // Get single project details (Read)
  router.get('/api/projects/:name', (req, res) => {
    const proj = projectStore.getProject(req.params.name);
    if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({
      name: proj.name,
      path: proj.path,
      description: proj.description,
      filesCount: proj.files.size,
      files: Array.from(proj.files.keys()),
    });
  });

  // Update project metadata (Update)
  router.put('/api/projects/:name', (req, res) => {
    try {
      const { name, path: projPath, description } = req.body;
      const updated = projectStore.updateProject(req.params.name, {
        name,
        path: projPath,
        description,
      });
      res.json({
        status: 'updated',
        project: updated.name,
        path: updated.path,
        description: updated.description,
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  router.patch('/api/projects/:name', (req, res) => {
    try {
      const { name, path: projPath, description } = req.body;
      const updated = projectStore.updateProject(req.params.name, {
        name,
        path: projPath,
        description,
      });
      res.json({
        status: 'updated',
        project: updated.name,
        path: updated.path,
        description: updated.description,
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Clone project (Clone)
  router.post('/api/projects/:name/clone', (req, res) => {
    try {
      const { targetName, targetPath, targetDescription } = req.body;
      if (!targetName) {
        return res.status(400).json({ error: 'O nome do novo projeto (targetName) é obrigatório.' });
      }
      const cloned = projectStore.cloneProject(
        req.params.name,
        targetName,
        targetPath,
        targetDescription
      );
      res.json({
        status: 'cloned',
        project: cloned.name,
        path: cloned.path,
        description: cloned.description,
        filesCount: cloned.files.size,
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  router.delete('/api/projects/:name', (req, res) => {
    const ok = projectStore.removeProject(req.params.name);
    if (!ok) return res.status(404).json({ error: 'Project not found' });
    res.json({ status: 'deleted', project: req.params.name });
  });
  // Files API
  router.get('/api/projects/:name/files', (req, res) => {
    try {
      const files = projectStore.listFiles(req.params.name);
      res.json(files);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  router.get('/api/projects/:name/file', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
      const file = projectStore.getFile(req.params.name, filePath);
      if (!file) return res.status(404).json({ error: 'File not found' });
      res.json(file);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  router.post('/api/projects/:name/file', (req, res) => {
    try {
      const { path, content } = req.body;
      if (!path) return res.status(400).json({ error: 'path is required' });
      const saved = projectStore.saveFile(req.params.name, path, content ?? '');
      res.json(saved);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  router.delete('/api/projects/:name/file', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
      const ok = projectStore.deleteFile(req.params.name, filePath);
      if (!ok) return res.status(404).json({ error: 'File not found' });
      res.json({ status: 'deleted', file: filePath });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Project Isolation Audit Endpoint
  router.get('/api/projects/:name/isolation-audit', (req, res) => {
    const report = projectStore.auditIsolation(req.params.name);
    if (!report) return res.status(404).json({ error: 'Project not found' });
    res.json(report);
  });

  return router;
}
