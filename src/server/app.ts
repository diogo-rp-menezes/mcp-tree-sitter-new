import express from 'express';
import cors from 'cors';
import { createMcpAuthMiddleware, type McpAuthConfig } from './auth';
import { createCorsOptions, type CorsConfig } from './corsConfig';
import type { WorkspaceRootsConfig } from './workspaceRoots';
import { createProjectsRouter } from './routes/projects';
import { createDatabaseRouter } from './routes/database';
import { createAnalysisRouter } from './routes/analysis';
import { createMcpRouter, activeSseClients } from './routes/mcp';
import { renderMetrics } from './metrics';
import { projectStore } from './store';
import { parseWorkerPool } from './parseWorkerPool';
import { requestContext, apiNotFound, errorMiddleware } from './httpErrors';

export interface AppConfig {
  cors: CorsConfig;
  auth: McpAuthConfig;
  workspaceRoots: WorkspaceRootsConfig;
  dbConsoleWriteEnabled: boolean;
}

/**
 * Monta o app Express (CORS, auth e rotas) sem abrir porta nem iniciar o Vite,
 * para que possa ser testado em isolamento. O server.ts cuida de listen/Vite/shutdown.
 */
export function createApp(config: AppConfig): express.Express {
  const app = express();

  app.use(requestContext);
  app.use(cors(createCorsOptions(config.cors)));
  app.use(express.json({ limit: '10mb' }));

  // Autenticação Bearer (API key / JWT HS256) para toda a API e o stream SSE.
  // /api/health permanece público.
  const auth = createMcpAuthMiddleware(config.auth);
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    if (req.path.startsWith('/api/') || req.path === '/mcp/sse') return auth(req, res, next);
    return next();
  });

  app.get('/api/health', (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
      status: 'ok',
      service: 'mcp-server-tree-sitter',
      version: process.env.npm_package_version || 'dev',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rssMB: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMB: Math.round(memory.heapUsed / (1024 * 1024)),
        heapTotalMB: Math.round(memory.heapTotal / (1024 * 1024)),
      },
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // Métricas Prometheus (protegidas pela autenticação de /api/*).
  app.get('/api/metrics', (_req, res) => {
    const store = projectStore.getMemoryStats();
    res.type('text/plain; version=0.0.4').send(
      renderMetrics({
        sseClients: activeSseClients.size,
        storeBytes: store.bytes,
        storeProjects: store.projects,
        workerJobsCompleted: parseWorkerPool.completed,
        workerPoolEnabled: parseWorkerPool.enabled,
      })
    );
  });

  // A ordem importa: rotas estáticas de /api/projects antes de /api/projects/:name.
  app.use(createProjectsRouter({ workspaceRoots: config.workspaceRoots }));
  app.use(createDatabaseRouter({ writeEnabled: config.dbConsoleWriteEnabled }));
  app.use(createAnalysisRouter());
  app.use(createMcpRouter());

  app.use(apiNotFound);
  app.use(errorMiddleware);

  return app;
}
