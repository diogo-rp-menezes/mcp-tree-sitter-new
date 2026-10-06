# MCP Tree-sitter Server / Studio

Servidor [Model Context Protocol](https://modelcontextprotocol.io) para análise de código com Tree-sitter (WASM), com uma UI web (editor Monaco, explorador de AST, consultas, complexidade, similaridade, Git e console SQLite).

- **Backend:** Node.js (>= 22.5) + Express, `web-tree-sitter` + `tree-sitter-wasms`, SQLite (`node:sqlite`).
- **Frontend:** React 18 + Vite + Tailwind.
- **MCP:** JSON-RPC 2.0 em `POST /api/mcp`; stream SSE em `GET /mcp/sse`.

## Instalação e execução

```bash
npm ci
cp .env.example .env      # ajuste os valores
npm run dev               # modo desenvolvimento (auth opcional, Vite embutido) em http://127.0.0.1:3000
```

Produção:

```bash
npm run build
MCP_API_KEYS=troque-esta-chave npm start
```

Com Docker (auth ligada, usuário não-root, sistema de arquivos somente leitura, volume para o SQLite):

```bash
MCP_API_KEYS=troque-esta-chave docker compose up --build
```

Métricas Prometheus em `GET /api/metrics` (exige o mesmo Bearer). Logs JSON em stderr; `X-Request-Id` em todas as respostas.

Fora do modo dev (`--dev` / `NODE_ENV=development`) a autenticação é **obrigatória** e o servidor não sobe sem `MCP_API_KEYS` ou `MCP_JWT_SECRET`.

## Segurança

| Controle | Variável | Padrão |
|---|---|---|
| Autenticação Bearer (API key / JWT HS256) em `/api/*` e `/mcp/sse` | `MCP_AUTH_ENABLED`, `MCP_API_KEYS`, `MCP_JWT_SECRET` | ligada fora do modo dev |
| Origens CORS permitidas | `MCP_CORS_ORIGINS`, `MCP_CORS_ALLOW_WILDCARD` | `http://localhost:3000` |
| Raízes permitidas para `/api/scan-directory` (com checagem de symlink) | `MCP_ALLOWED_WORKSPACE_ROOTS` | `/workspace` |
| Console SQL com escrita | `MCP_DB_CONSOLE_WRITE` | `false` (somente leitura) |
| Interface de rede | `HOST` | `127.0.0.1` |

`/api/health` é público. A UI pede o token quando o servidor responde 401 e o guarda apenas em `sessionStorage`. Detalhes dos contratos em `docs/04-governance/api-specification.md`.

## Usando com um cliente MCP

Aponte o cliente para `http://127.0.0.1:3000/api/mcp` enviando `Authorization: Bearer <chave>`. Ferramentas principais: `register_project_tool`, `list_files`, `get_ast`, `get_symbols`, `run_query`, `find_references`, `analyze_complexity`, `find_similar_code`, `search_text`, `find_dependencies`, `audit_project_isolation`. A lista completa vem de `tools/list`.

## Desenvolvimento

```bash
npm run lint     # tsc --noEmit
npm test         # vitest
npm run build
```

Veja `AGENTS.md` (arquitetura e regras) e `CONTRIBUTING.md`. A documentação da implementação Python original está em `docs/legacy-python/` apenas como histórico.

## Licença

Veja `LICENSE` e `NOTICE`.
