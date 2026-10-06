import { sendRouteError } from '../httpErrors';
import { Router } from 'express';
import path from 'path';
import { projectStore } from '../store';
import { parseSourceToASTAsync, ensureLanguagesLoaded, extractSymbolsFromAST, findNodeAtPosition } from '../parser';
import { executeQueryOnSource } from '../queryEngine';
import { calculateComplexity } from '../complexity';
import { findSimilarCodeBlocks } from '../similarity';
import { TEMPLATES, COMMON_NODE_DESCRIPTIONS } from '../templates';
import { languageRegistry } from '../languageRegistry';
import { treeCache } from '../treeCache';
import { analyzeProjectStructure, findDependencies, searchText } from '../operations';
import { adaptQuery, buildCompoundQuery } from '../queryBuilder';
import { LanguageNotFoundError } from '../errors';


export function createAnalysisRouter(): Router {
  const router = Router();

  // AST endpoint
  router.post('/api/ast', async (req, res) => {
    try {
      const { code, language, project, path } = req.body;
      let source = code;
      let lang = language;

      if (!source && project && path) {
        const f = projectStore.getFile(project, path);
        if (!f) return res.status(404).json({ error: 'File not found' });
        source = f.content;
        lang = f.language;
      }

      if (!source) source = '';
      if (!lang) lang = 'python';

      const ast = await parseSourceToASTAsync(source, lang);
      res.json(ast);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Export AST as downloadable JSON for external tools
  router.get('/api/projects/:name/ast-export', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
      const file = projectStore.getFile(req.params.name, filePath);
      if (!file) return res.status(404).json({ error: 'File not found' });

      const ast = await parseSourceToASTAsync(file.content, file.language);
      const filename = filePath.split('/').pop() || 'file';
      const cleanFilename = `${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.ast.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFilename}"`);
      res.json({
        $schema: 'https://tree-sitter.github.io/schema/ast.json',
        project: req.params.name,
        filePath,
        language: file.language,
        exportedAt: new Date().toISOString(),
        version: '0.7.0',
        ast,
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Query endpoint
  router.post('/api/query', async (req, res) => {
    try {
      const { query, code, language, captureFilter, maxResults, project, path } = req.body;
      if (!query) return res.status(400).json({ error: 'Query is required' });

      let source = code;
      let lang = language;

      if (!source && project && path) {
        const f = projectStore.getFile(project, path);
        if (!f) return res.status(404).json({ error: 'File not found' });
        source = f.content;
        lang = f.language;
      }

      const matches = await executeQueryOnSource(source || '', lang || 'python', query, {
        captureFilter,
        maxResults: maxResults ? Number(maxResults) : 100,
      });
      res.json(matches);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Symbols endpoint
  router.post('/api/symbols', async (req, res) => {
    try {
      const { code, language, project, path } = req.body;
      let source = code;
      let lang = language;

      if (!source && project && path) {
        const f = projectStore.getFile(project, path);
        if (!f) return res.status(404).json({ error: 'File not found' });
        source = f.content;
        lang = languageRegistry.resolveFileLanguageOrThrow(path, f.language);
      } else if (path) {
        lang = languageRegistry.resolveFileLanguageOrThrow(path, language);
      } else if (!lang) {
        throw new LanguageNotFoundError('undefined', { message: 'Language is required for raw code snippet' });
      }

      const ast = await parseSourceToASTAsync(source || '', lang);
      const symbols = extractSymbolsFromAST(ast, lang);
      res.json(symbols);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Complexity endpoint
  router.post('/api/complexity', async (req, res) => {
    try {
      const { code, language, project, path } = req.body;
      let source = code;
      let lang = language;

      if (!source && project && path) {
        const f = projectStore.getFile(project, path);
        if (!f) return res.status(404).json({ error: 'File not found' });
        source = f.content;
        lang = languageRegistry.resolveFileLanguageOrThrow(path, f.language);
      } else if (path) {
        lang = languageRegistry.resolveFileLanguageOrThrow(path, language);
      } else if (!lang) {
        throw new LanguageNotFoundError('undefined', { message: 'Language is required for raw code snippet' });
      }

      const ast = await parseSourceToASTAsync(source || '', lang);
      const metrics = calculateComplexity(source || '', ast, lang);
      res.json(metrics);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Consolidated real-time analysis endpoint to minimize network overhead and avoid throttling
  router.post('/api/analyze', async (req, res) => {
    try {
      const { code, language, project, path } = req.body;
      let source = code;
      let lang = language;

      if (!source && project && path) {
        const f = projectStore.getFile(project, path);
        if (!f) return res.status(404).json({ error: 'File not found' });
        source = f.content;
        lang = languageRegistry.resolveFileLanguageOrThrow(path, f.language);
      } else if (path) {
        lang = languageRegistry.resolveFileLanguageOrThrow(path, language);
      } else if (!lang) {
        throw new LanguageNotFoundError('undefined', { message: 'Language is required for raw code snippet' });
      }

      const ast = await parseSourceToASTAsync(source || '', lang);
      const symbols = extractSymbolsFromAST(ast, lang);
      const complexity = calculateComplexity(source || '', ast, lang);

      res.json({
        ast,
        symbols,
        complexity,
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Node at position
  router.post('/api/node-at-pos', async (req, res) => {
    try {
      const { code, language, row, column, project, path } = req.body;
      let source = code;
      let lang = language;

      if (!source && project && path) {
        const f = projectStore.getFile(project, path);
        if (!f) return res.status(404).json({ error: 'File not found' });
        source = f.content;
        lang = languageRegistry.resolveFileLanguageOrThrow(path, f.language);
      } else if (path) {
        lang = languageRegistry.resolveFileLanguageOrThrow(path, language);
      } else if (!lang) {
        throw new LanguageNotFoundError('undefined', { message: 'Language is required for raw code snippet' });
      }

      const ast = await parseSourceToASTAsync(source || '', lang);
      const node = findNodeAtPosition(ast, Number(row), Number(column));
      res.json(node || null);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Similarity endpoint
  router.post('/api/similarity', async (req, res) => {
    try {
      const { snippet, language, project, threshold, maxResults } = req.body;
      const proj = projectStore.getProject(project || 'tree-sitter-core');
      const candidates = proj
        ? Array.from(proj.files.values()).map((f) => ({
            path: f.path,
            content: f.content,
            language: f.language,
          }))
        : [];

      await ensureLanguagesLoaded([language || 'python', ...candidates.map((c) => c.language)]);
      const results = findSimilarCodeBlocks(
        snippet || '',
        language || 'python',
        candidates,
        Number(threshold || 0.5),
        Number(maxResults || 10)
      );
      res.json(results);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Query templates endpoint
  router.get('/api/templates', (req, res) => {
    const lang = req.query.language as string;
    if (lang && TEMPLATES[lang]) {
      return res.json(TEMPLATES[lang]);
    }
    res.json(TEMPLATES);
  });

  // Languages endpoint
  router.get('/api/languages', (req, res) => {
    res.json({
      available: languageRegistry.listAvailableLanguages(),
      installable: languageRegistry.listInstallableLanguages(),
      descriptions: COMMON_NODE_DESCRIPTIONS,
    });
  });

  // Project structure endpoint
  router.get('/api/projects/:name/structure', (req, res) => {
    try {
      const proj = projectStore.getProject(req.params.name);
      if (!proj) return res.status(404).json({ error: 'Project not found' });
      const analysis = analyzeProjectStructure(proj, languageRegistry, Number(req.query.scan_depth || 3));
      res.json(analysis);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Dependencies endpoint
  router.get('/api/projects/:name/dependencies', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
      const proj = projectStore.getProject(req.params.name);
      if (!proj) return res.status(404).json({ error: 'Project not found' });
      const deps = await findDependencies(proj, filePath, languageRegistry);
      res.json(deps);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Text search endpoint
  router.post('/api/projects/:name/search-text', (req, res) => {
    try {
      const { pattern, filePattern, maxResults, caseSensitive, wholeWord, useRegex, contextLines } = req.body;
      if (!pattern) return res.status(400).json({ error: 'pattern is required' });
      const proj = projectStore.getProject(req.params.name);
      if (!proj) return res.status(404).json({ error: 'Project not found' });
      const results = searchText(
        proj,
        pattern,
        filePattern || '**/*',
        maxResults ? Number(maxResults) : 100,
        Boolean(caseSensitive),
        Boolean(wholeWord),
        Boolean(useRegex),
        contextLines ? Number(contextLines) : 0
      );
      res.json(results);
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Query adaptation endpoint
  router.post('/api/query/adapt', (req, res) => {
    try {
      const { query, fromLanguage, toLanguage } = req.body;
      if (!query || !fromLanguage || !toLanguage) {
        return res.status(400).json({ error: 'query, fromLanguage and toLanguage are required' });
      }
      res.json(adaptQuery(query, fromLanguage, toLanguage));
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Compound query endpoint
  router.post('/api/query/compound', (req, res) => {
    try {
      const { language, patterns, combine } = req.body;
      if (!language || !patterns || !Array.isArray(patterns)) {
        return res.status(400).json({ error: 'language and patterns array are required' });
      }
      res.json({
        query: buildCompoundQuery(language, patterns, combine || 'or'),
      });
    } catch (err) {
      return sendRouteError(req, res, err);
    }
  });

  // Cache stats endpoint
  router.get('/api/cache/stats', (req, res) => {
    res.json(treeCache.getStats());
  });

  return router;
}
