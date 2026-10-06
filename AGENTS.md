# AGENTS.md

Instruções para agentes de IA neste repositório.

## Visão geral
MCP Tree-sitter Server/Studio: servidor Express (`server.ts`) + UI React/Vite (`src/client`) que expõe análise de código via Tree-sitter (WASM) como API REST e como servidor MCP (JSON-RPC em `POST /api/mcp`, SSE em `GET /mcp/sse`). TypeScript, Node >= 22.5 (usa `node:sqlite`).

## Comandos
```bash
npm ci
npm run dev      # servidor + Vite (modo dev, auth opcional)
npm run lint     # tsc --noEmit
npm test         # vitest run
npm run build    # bundle do frontend
```
O CI roda lint, test e build — todos devem passar antes de commitar.

## Arquitetura
- `server.ts`: bootstrap (Vite, listen, shutdown). `src/server/app.ts` monta CORS, auth e rotas; `src/server/routes/` tem `projects`, `database`, `analysis` e `mcp`.
- `src/server/`: `parser.ts`, `treeSitter.ts` (WASM), `queryEngine.ts`, `store.ts`/`db.ts` (SQLite), `git.ts`, `github.ts`, `complexity.ts`, `similarity.ts`.
- Segurança (todos ligados em `server.ts`): `auth.ts` (Bearer API key/JWT), `corsConfig.ts`, `workspaceRoots.ts` (scan-directory), `security.ts` (acesso a arquivos).
- Documentação Python antiga: `docs/legacy-python/` (apenas histórico).

## Regras
- Configuração de segurança é fail-fast: valores inválidos abortam a inicialização.
- Nunca reintroduza `execSync` com interpolação; use `execFileSync` com array de argumentos.
- Console SQL é somente leitura salvo `MCP_DB_CONSOLE_WRITE=true`.
- Não versione `.env*` nem `data/`.
- Testes ficam em `src/server/__tests__/` ou ao lado do módulo (`*.test.ts`).
- Parse síncrono (`parseSourceToAST`) só usa Tree-sitter se a gramática já estiver carregada; chame `await ensureLanguagesLoaded([...])` antes em rotas assíncronas.
- Ordem das rotas importa: rotas estáticas de `/api/projects/*` ficam antes de `/api/projects/:name` (teste em `httpIntegration.test.ts`).
- Logs: use `logger` (`src/server/logger.ts`), nunca `console.*`; nível via `MCP_TS_LOG_LEVEL`. Em handlers, trate erros com `sendRouteError(req, res, err)` (`httpErrors.ts`) para status coerente e sem vazar detalhes em produção.
- Parse pesado vai para `parseWorkerPool.ts` (worker threads; `tsx` é dependência de runtime porque o worker é TypeScript). Sob Vitest o pool fica desligado; o teste `workerPool.test.ts` roda em processo filho.
- Gravações no store passam por quota (`assertQuota`); trate `QuotaExceededError` (HTTP 413). Testes usam banco temporário via `MCP_DB_PATH` (`vitest.setup.ts`) — nunca toque `data/workspace.db`.
- Produção instala só `dependencies` (`npm ci --omit=dev`): nunca importe `vite`/`vitest` estaticamente em código de servidor (teste em `productionImports.test.ts`).
- Métricas: `observeRequest` roda em `requestContext`; use o padrão de rota (nunca o caminho bruto) como rótulo.
- Métricas: `GET /api/metrics` (Prometheus, autenticado) vem de `metrics.ts`; o rótulo `route` usa o padrão do Express para evitar alta cardinalidade. Em `catch`, use `unknown` + `errorMessage()` (`errors.ts`), não `any`.
- Docker: `docker compose up --build` exige `MCP_API_KEYS`; a imagem instala só `dependencies` (por isso `vite` é importado dinamicamente no modo dev — há teste que protege isso).
