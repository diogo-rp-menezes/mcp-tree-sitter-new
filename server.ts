import express from 'express';
import { errorMessage } from './src/server/errors';
import { initTreeSitter } from './src/server/treeSitter';
import { parseMcpAuthConfig } from './src/server/auth';
import { parseCorsConfig } from './src/server/corsConfig';
import { parseWorkspaceRootsConfig } from './src/server/workspaceRoots';
import { createApp } from './src/server/app';
import { activeSseClients } from './src/server/routes/mcp';
import { parseWorkerPool } from './src/server/parseWorkerPool';
import { logger, serializeError } from './src/server/logger';

// Produção é o padrão seguro: modo dev (Vite embutido, auth opcional) exige --dev ou NODE_ENV=development.
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
process.env.NODE_ENV = isDev ? 'development' : 'production';

async function startServer() {
  try {
    await initTreeSitter();
  } catch (err) {
    logger.warn('tree_sitter_init_warning', { message: errorMessage(err) });
  }

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST?.trim() || '127.0.0.1';

  // Configuração de segurança (fail-fast: configuração inválida aborta a inicialização)
  const config = {
    cors: parseCorsConfig(process.env),
    auth: parseMcpAuthConfig(process.env),
    workspaceRoots: parseWorkspaceRootsConfig(process.env),
    dbConsoleWriteEnabled: process.env.MCP_DB_CONSOLE_WRITE === 'true',
  };
  if (!config.auth.enabled) {
    logger.warn('auth_disabled', { hint: 'defina MCP_AUTH_ENABLED=true ou rode sem --dev' });
  }

  const app = createApp(config);

  if (isDev) {
    // Import dinâmico: vite é devDependency e não existe na imagem/instalação de produção.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  const server = app.listen(port, host, () => {
    logger.info('server_listening', { url: `http://${host}:${port}`, mcp: `http://${host}:${port}/api/mcp`, sse: `http://${host}:${port}/mcp/sse` });
  });

  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('shutdown_signal', { signal });

    for (const client of activeSseClients) {
      try {
        client.write('event: shutdown\ndata: {"status":"shutting_down"}\n\n');
        client.end();
      } catch {}
    }
    activeSseClients.clear();

    void parseWorkerPool.shutdown();

    server.close(() => {
      logger.info('server_closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('shutdown_timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.error('startup_failed', { err: serializeError(err) });
  process.exit(1);
});
