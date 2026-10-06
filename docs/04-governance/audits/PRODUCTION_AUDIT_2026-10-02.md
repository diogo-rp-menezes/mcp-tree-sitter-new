# Relatório de Auditoria de Prontidão para Produção (Full-Spectrum Production Readiness Audit)

**Projeto:** MCP Tree-sitter Server / Studio  
**Data da Auditoria:** 2026-10-02  
**Auditor:** Roo Code — Production Readiness Auditor  
**Escopo:** Arquitetura, Segurança (OWASP Top 10), Performance, Qualidade de Código, Cobertura de Testes e Infraestrutura de Produção  
**Status Geral:** **REPROVADO PARA PRODUÇÃO (CRITICAL BLOCKED)**


> **Reavaliação em 2026-10-04.** O relatório abaixo é o original de 2026-10-02 e foi mantido sem alterações. Várias conclusões já estavam desatualizadas na data da revisão (por exemplo, TST-01: já existiam testes) ou foram tratadas depois. Status atual por achado:
>
> | ID | Status | Observação |
> |---|---|---|
> | SEC-01 | Resolvido | `/api/scan-directory` usa `workspaceRoots` (raízes configuráveis, checagem de symlink); testes em `workspaceRoots.test.ts` e `httpIntegration.test.ts`. |
> | SEC-02 | Resolvido | `git.ts` usa `execFileSync` com array de argumentos. A criação de repositórios segue restrita ao caminho normalizado do projeto. |
> | SEC-03 | Resolvido | Auth Bearer (API key/JWT) em `/api/*` e `/mcp/sse`; ligada por padrão fora do modo dev. O console SQL é somente leitura salvo `MCP_DB_CONSOLE_WRITE=true`. |
> | SEC-04 | Resolvido | CORS por allowlist (`corsConfig.ts`), com opt-in explícito para `*`. |
> | TST-01 | Resolvido | Vitest com testes unitários e de integração HTTP (`src/server/__tests__/`). |
> | INF-01 | Resolvido | CI e release em Node 22 (`npm ci`, `lint`, `test`, `build`). |
> | INF-02 | Resolvido | Logs JSON por linha (`logger.ts`, `MCP_TS_LOG_LEVEL`), `X-Request-Id` e log de acesso; métricas Prometheus em `GET /api/metrics` (autenticado, rota por padrão do Express). Sem OpenTelemetry/tracing distribuído. |
> | INF-03 | Resolvido | Shutdown gracioso para SIGTERM/SIGINT, com fechamento dos clientes SSE. |
> | PRF-01 | Resolvido | Parse de arquivos grandes (>= `MCP_TS_WORKER_MIN_CHARS`) roda em `worker_threads` (`parseWorkerPool.ts`) com timeout e reinício do worker; o pool se desativa e cai para a thread principal se não conseguir iniciar. Testado com medição de lag do event loop. |
> | PRF-02 | Resolvido (mitigado) | Quotas por projeto e totais no `store` (`MCP_MAX_PROJECT_MB`, `MCP_MAX_TOTAL_MB`), com erro 413. Não há evicção: o conteúdo continua inteiro em memória até o limite. |
> | PRF-03 | Resolvido | `/api/analyze` consolidado e `AbortController` no cliente (`App.tsx`). |
> | ARC-01 | Resolvido | `server.ts` reduzido a bootstrap; rotas em `src/server/routes/` e montagem em `app.ts`. |
> | ARC-02 | Corrigido | O parser usa Tree-sitter WASM; a variante síncrona só cai no parser estrutural se a gramática não estiver carregada, e as rotas agora chamam `ensureLanguagesLoaded` antes. |
> | COD-01 | Resolvido | `httpErrors.ts` mapeia `errors.ts` e erros do body-parser para status HTTP; em produção 5xx não vaza mensagens internas (REST e JSON-RPC). Não restam `catch (err: any)` no servidor; use `errorMessage()` para extrair mensagens. |

---

## 1. Sumário Executivo

A auditoria de prontidão para produção identificou **18 vulnerabilidades e fragilidades críticas**, categorizadas em 6 dimensões. A aplicação apresenta risco operacional e de segurança inaceitável para implantação em ambiente corporativo ou público no estado atual.

### Principais Fatores de Bloqueio:
1. **Segurança Crítica:** Leitura arbitrária do sistema de arquivos do host via [`server.ts:108-225`](server.ts:108) (`POST /api/scan-directory`), execução de comandos do sistema sem sanitização em [`src/server/git.ts:197`](src/server/git.ts:197), ausência total de autenticação/autorização em todas as rotas da API e CORS irrestrito em [`server.ts:21`](server.ts:21).
2. **Cobertura de Testes:** **0% de cobertura real**. Não existem testes unitários, testes de integração ou suíte de teste configurada no [`package.json:6-11`](package.json:6).
3. **Pipeline de CI/CD Desconectado:** Os fluxos em [`.github/workflows/ci.yml:1-60`](.github/workflows/ci.yml:1) e [`.github/workflows/release.yml:1-60`](.github/workflows/release.yml:1) executam ferramentas Python (`uv`, `pytest`, `ruff`, `mypy`) direcionadas a um repositório Python legado/inexistente, falhando em 100% das execuções para a base TypeScript/Node.js atual.
4. **Performance & Resiliência:** Bloqueio síncrono do Event Loop do Node.js por parsing de código na thread principal em [`server.ts:300`](server.ts:300), armazenamento em memória não paginado em [`src/server/store.ts:6`](src/server/store.ts:6) sujeito a OOM (*Out of Memory*), e reexecuções redundantes de parsing síncrono em cada requisição de agregação em [`src/server/store.ts:266`](src/server/store.ts:266).

---

## 2. Matriz de Priorização de Riscos (Impacto x Probabilidade)

| ID | Dimensão | Severidade | Achado Principal | Impacto | Probabilidade | Risco Combinado |
|---|---|---|---|---|---|---|
| **SEC-01** | Segurança | **CRÍTICA** | Leitura Arbitrária do Filesystem do Host | Alto | Alto | **P0 (Imediato)** |
| **SEC-02** | Segurança | **CRÍTICA** | Injeção de Comando / Criação de Diretório via Git | Alto | Médio | **P0 (Imediato)** |
| **SEC-03** | Segurança | **ALTA** | Ausência Total de Autenticação e Autorização | Alto | Alto | **P0 (Imediato)** |
| **TST-01** | Testes | **CRÍTICA** | Ausência Total de Testes Automatizados (0% Cobertura) | Alto | Alto | **P0 (Imediato)** |
| **INF-01** | Infra/CI | **ALTA** | Pipeline de CI/CD Desconectado (Configuração Python vs App Node) | Alto | Alto | **P1 (Urgente)** |
| **PRF-01** | Performance | **ALTA** | Bloqueio do Event Loop por Parsing AST Síncrono | Alto | Médio | **P1 (Urgente)** |
| **PRF-02** | Performance | **ALTA** | Esgotamento de Memória (Heap OOM) em Store In-Memory | Alto | Médio | **P1 (Urgente)** |
| **SEC-04** | Segurança | **MÉDIA** | Política de CORS Aberta Globalmente | Médio | Alto | **P1 (Urgente)** |
| **ARC-01** | Arquitetura | **MÉDIA** | Monólito God File em `server.ts` | Médio | Alto | **P2 (Importante)** |
| **INF-02** | Infra/Obs | **MÉDIA** | Ausência de Logs Estruturados e Métricas de Observabilidade | Médio | Alto | **P2 (Importante)** |
| **INF-03** | Infra/Res | **MÉDIA** | Ausência de Graceful Shutdown (Tratamento de SIGTERM/SIGINT) | Médio | Médio | **P2 (Importante)** |
| **PRF-03** | Performance | **MÉDIA** | Disparo de Requisições Concorrentes sem Cancelamento (`AbortController`) | Médio | Alto | **P2 (Importante)** |
| **COD-01** | Qualidade | **MÉDIA** | Tratamento Genérico de Exceções (`catch (err: any)`) | Médio | Alto | **P2 (Importante)** |

---

## 3. Achados Detalhados por Dimensão

### 3.1. Segurança (Security & OWASP Top 10)

#### [SEC-01] Leitura Arbitrária de Arquivos do Host (CWE-22 / OWASP A01:2021)
- **Localização:** [`server.ts:108-225`](server.ts:108)
- **Evidência:** O endpoint `POST /api/scan-directory` recebe um parâmetro `dirPath` fornecido pelo cliente e executa `path.resolve(dirPath)` sem verificar se o caminho pertence ao diretório da aplicação. Em seguida, a função `walk` lê recursivamente o conteúdo de até 150 arquivos do sistema operacional e os grava na memória via [`server.ts:209`](server.ts:209) (`fs.readFileSync(item.absolutePath, 'utf-8')`).
- **Impacto:** Um usuário malicioso ou atacante com acesso de rede à API pode inspecionar diretórios sensíveis do servidor, incluindo chaves privadas, arquivos `.env`, configurações de banco de dados e arquivos de sistema (`/etc/`, `C:\Users\`).
- **Recomendação:** Restringir o escopo do escaneamento exclusivamente a diretórios dentro de um sandbox pré-definido ou desabilitar o endpoint em ambientes de produção.

#### [SEC-02] Risco de Injeção de Comando e Manipulação de Disco via Git (CWE-78)
- **Localização:** [`src/server/git.ts:191-202`](src/server/git.ts:191) e [`server.ts:57-62`](server.ts:57)
- **Evidência:** O endpoint `POST /api/projects/:name/git-init` chama [`src/server/git.ts:191`](src/server/git.ts:191) (`initProjectGitRepo(proj.path)`). A função executa `fs.mkdirSync(normalizedPath, { recursive: true })` e invoca `execSync(\`git init -b ${branchName}\`, { cwd: normalizedPath })`. Como o campo `path` de um projeto pode ser customizado via [`server.ts:65`](server.ts:65), diretórios arbitrários no disco do host podem ser criados e manipulados.
- **Impacto:** Criação arbitrária de pastas no disco do host e potencial execução de comandos caso parâmetros futuros incluam entrada externa não sanitizada no `execSync`.
- **Recomendação:** Substituir comandos síncronos de shell por chamadas seguras com array de argumentos (`execFile` ou bibliotecas nativas de Git) e proibir a criação de repositórios fora do diretório de workspace isolado.

#### [SEC-03] Ausência Total de Autenticação e Autorização (OWASP A01:2021 / A07:2021)
- **Localização:** [`server.ts:35-325`](server.ts:35)
- **Evidência:** Nenhuma rota sob `/api/*`, `/mcp/*` ou `/mcp/sse` possui middleware de autenticação (JWT, Session, API Key). Métodos destrutivos como `DELETE /api/projects/:name` ([`server.ts:229`](server.ts:229)) e `DELETE /api/projects/:name/file` ([`server.ts:277`](server.ts:277)) estão completamente expostos.
- **Impacto:** Qualquer agente ou script na rede pode criar, alterar e deletar projetos e arquivos de código sem rastreabilidade.
- **Recomendação:** Implementar middleware de autenticação e RBAC (*Role-Based Access Control*) antes de liberar acesso aos endpoints.

#### [SEC-04] Política de CORS Irrestrita (CWE-942)
- **Localização:** [`server.ts:21`](server.ts:21)
- **Evidência:** `app.use(cors())` habilita `Access-Control-Allow-Origin: *` para todos os verbos HTTP e origens.
- **Impacto:** Qualquer site malicioso aberto no navegador do usuário pode enviar requisições à API local (`http://localhost:3000`), exfiltrando projetos e código-fonte.
- **Recomendação:** Configurar uma lista explícita de origens confiáveis (`allowedOrigins`).

---

### 3.2. Cobertura de Testes (Testing)

#### [TST-01] Ausência Completa de Testes Automatizados
- **Localização:** [`package.json:6-11`](package.json:6)
- **Evidência:** O arquivo [`package.json`](package.json) não define script de teste (`"test"`). Não existem diretórios `tests/`, `__tests__/` ou arquivos com terminação `.test.ts` / `.spec.ts` em toda a árvore de código.
- **Contradição Documental:** O arquivo [`AGENTS.md:23`](AGENTS.md:23) afirma `"pytest tests/ # 217+ tests, must all pass"`, demonstrando que a documentação foi herdada de um projeto upstream e não reflete a realidade do repositório.
- **Impacto:** Qualquer refatoração ou alteração em regras de parsing, queries sintáticas ou cálculo de complexidade pode introduzir regressões silenciosas sem aviso prévio.
- **Recomendação:** Configurar o Vitest como framework de testes e implementar testes unitários e de integração para [`src/server/parser.ts`](src/server/parser.ts), [`src/server/queryEngine.ts`](src/server/queryEngine.ts), [`src/server/complexity.ts`](src/server/complexity.ts) e [`src/server/isolation.ts`](src/server/isolation.ts).

---

### 3.3. Infraestrutura de Produção & CI/CD (Production Infrastructure)

#### [INF-01] Pipeline de Integração Contínua Falso/Desconectado
- **Localização:** [`.github/workflows/ci.yml:1-60`](.github/workflows/ci.yml:1) e [`.github/workflows/release.yml:1-60`](.github/workflows/release.yml:1)
- **Evidência:** As ações do GitHub configuradas no repositório executam setup de Python 3.12, instalação via `uv` e verificação com `ruff`, `mypy` e `pytest`. Como não existem arquivos Python no projeto, qualquer trigger em push ou PR falha imediatamente.
- **Impacto:** O repositório não valida TypeScript (`tsc --noEmit`), não valida build de frontend (`vite build`) e não executa linters relevantes em novos commits.
- **Recomendação:** Substituir os workflows por ações Node.js/TypeScript (Node 20/22, `npm ci`, `npm run lint`, `npm run build` e execução de testes automatizados).

#### [INF-02] Ausência de Logging Estruturado e Métricas
- **Localização:** [`server.ts:667-675`](server.ts:667)
- **Evidência:** A aplicação utiliza `console.log` e `console.error` sem formato JSON, sem níveis de log configuráveis (debug, info, warn, error) e sem IDs de correlação de requisição (`correlation-id`).
- **Impacto:** Impossibilidade de rastrear requisições em ferramentas de agregação de logs (Datadog, Loki, CloudWatch) e incapacidade de monitorar latência e taxas de erro.
- **Recomendação:** Adotar biblioteca de log estruturado (ex.: Pino) com injeção de `reqId` e exportador de métricas Prometheus/OpenTelemetry.

#### [INF-03] Ausência de Tratamento para Encerramento Gracioso (Graceful Shutdown)
- **Localização:** [`server.ts:666-671`](server.ts:666)
- **Evidência:** O servidor inicia o listener HTTP sem registrar ouvintes para os sinais `SIGTERM` e `SIGINT`. Conexões ativas de Server-Sent Events ([`server.ts:633-649`](server.ts:633)) e requisições HTTP em andamento são interrompidas abruptamente em caso de reinicialização ou escalonamento de contêiner.
- **Impacto:** Queda abrupta de conexões com clientes MCP, corrupção de estado transitório e falha em testes de carga.
- **Recomendação:** Capturar `SIGTERM` e `SIGINT`, encerrar os intervalos de keepalive das conexões SSE e aguardar o fechamento do servidor HTTP com timeout de drenagem.

---

### 3.4. Performance & Escalabilidade

#### [PRF-01] Bloqueio da Thread Principal por Parsing de Código Síncrono
- **Localização:** [`server.ts:300-324`](server.ts:300) e [`src/server/parser.ts:54`](src/server/parser.ts:54)
- **Evidência:** O endpoint `POST /api/ast` invoca [`src/server/parser.ts:54`](src/server/parser.ts:54) (`parseSourceToAST(source, lang)`). O parsing é executado de forma síncrona com múltiplas expressões regulares e loops extensos na thread única do Node.js.
- **Impacto:** Arquivos grandes (> 500 linhas) ou múltiplas requisições simultâneas bloqueiam o Event Loop, degradando severamente o tempo de resposta e causando congelamento para todos os usuários conectados.
- **Recomendação:** Delegar o parsing intensivo para Node.js Worker Threads (`worker_threads`) ou adotar o runtime WebAssembly do Tree-sitter (`web-tree-sitter`) com chamadas assíncronas.

#### [PRF-02] Esgotamento de Memória por Armazenamento Global Não Paginado
- **Localização:** [`src/server/store.ts:6`](src/server/store.ts:6)
- **Evidência:** `const projects = new Map<string, Project>()` armazena todos os projetos, metadados e conteúdos de arquivos como strings UTF-8 na memória do processo sem limite de tamanho ou política de expiração (LRU).
- **Impacto:** Projetos importados via `batch-create` ou `scan-directory` podem facilmente exceder o heap disponível do Node.js (V8 max old space), derrubando o processo com erro de OOM (*Out Of Memory*).
- **Recomendação:** Adotar persistência em disco ou banco relacional com paginação e streaming de arquivos sob demanda.

#### [PRF-03] Rajada de Requisições Concorrentes sem Cancelamento no Cliente
- **Localização:** [`src/client/App.tsx:182-205`](src/client/App.tsx:182)
- **Evidência:** A função [`src/client/App.tsx:182`](src/client/App.tsx:182) (`analyzeCode`) dispara três requisições sequenciais (`/api/ast`, `/api/symbols`, `/api/complexity`) a cada alteração de código com debounce de apenas 150ms ([`src/client/App.tsx:104`](src/client/App.tsx:104)), sem utilizar `AbortController`.
- **Impacto:** Digitação rápida acumula dezenas de requisições obsoletas na fila do servidor, gerando race conditions onde respostas antigas sobrescrevem o estado mais recente no editor.
- **Recomendação:** Consolidar a análise em um único endpoint (`POST /api/analyze`) e abortar requisições pendentes via `AbortController` a cada novo evento de digitação.

---

### 3.5. Arquitetura (Architecture)

#### [ARC-01] Violação de Responsabilidade Única (God File em `server.ts`)
- **Localização:** [`server.ts:1-677`](server.ts:1)
- **Evidência:** O arquivo [`server.ts`](server.ts) possui 677 linhas e concentra: inicialização do Express, montagem do middleware Vite, rotas de projetos, leitura do sistema de arquivos do host, integração com Git, endpoints de AST, rotas de similaridade, implementação do protocolo JSON-RPC 2.0 do MCP, streaming Server-Sent Events e tratamento global de erros.
- **Impacto:** Alto acoplamento, dificuldade de manutenção, baixa testabilidade de rotas isoladas e elevado risco de efeitos colaterais.
- **Recomendação:** Decompor `server.ts` em roteadores modulares (`src/server/routes/projects.ts`, `src/server/routes/mcp.ts`, `src/server/routes/analysis.ts`).

#### [ARC-02] Simulação Frágil de Tree-sitter via Expressões Regulares
- **Localização:** [`src/server/parser.ts:54-106`](src/server/parser.ts:54)
- **Evidência:** Em vez de utilizar as bibliotecas e gramáticas reais do Tree-sitter (como `web-tree-sitter` ou bindings C++), o servidor implementa parsers manuais baseados em regex para Python ([`src/server/parser.ts:108`](src/server/parser.ts:108)), JS/TS, Go e Rust.
- **Impacto:** Casos sintáticos comuns como strings multilinhas, lambdas aninhadas, macros e type annotations complexas não são interpretados corretamente, gerando nós AST incorretos e consultas S-expression falhas.
- **Recomendação:** Integrar o Tree-sitter oficial compilado para WebAssembly (`web-tree-sitter`).

---

### 3.6. Qualidade de Código (Code Quality)

#### [COD-01] Tratamento Genérico de Erros e Supressão de Tipagem
- **Localização:** [`server.ts:102`](server.ts:102), [`server.ts:224`](server.ts:224), [`server.ts:430`](server.ts:430), [`server.ts:623`](server.ts:623)
- **Evidência:** Uso generalizado de `catch (err: any) { res.status(500).json({ error: err.message }); }`. Erros operacionais (como arquivos não encontrados ou parâmetros inválidos) são indistintamente retornados com código HTTP 500 sem stack trace ou contexto.
- **Impacto:** Dificuldade de diagnóstico em produção e vazamento de mensagens internas de exceção para o cliente.
- **Recomendação:** Criar classes de erro customizadas com códigos de status HTTP apropriados (400, 404, 422) e um middleware centralizado de tratamento de erros.

#### [COD-02] Risco de ReDoS e Loop no Tokenizer de Query S-Expression
- **Localização:** [`src/server/queryEngine.ts:46-56`](src/server/queryEngine.ts:46)
- **Evidência:** O parser de strings de consulta percorre caracteres com `while (idx < working.length && working[idx] !== '"')`. Em caso de string com aspas sem fechamento, o índice atinge o limite e realiza `idx++`, provocando inconsistências no array de tokens.
- **Impacto:** Possibilidade de congelamento do parser ou geração de tokens corrompidos com entrada de usuário malformada.
- **Recomendação:** Validar o fechamento de literais de string antes da tokenização e impor limite de tamanho para consultas.

---

## 4. Plano de Ação Recomendado (Roadmap de Remediação)

### Fase 1: Bloqueios Críticos de Segurança e CI (Sprint 1)
1. **[SEC-01]** Isolar e restringir a rota `POST /api/scan-directory` para não ler diretórios externos do sistema operacional.
2. **[SEC-02]** Remover a execução direta de comandos shell via `execSync` em [`src/server/git.ts`](src/server/git.ts).
3. **[SEC-03]** Implementar autenticação básica ou token bearer nos endpoints da API.
4. **[INF-01]** Reconfigurar o workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) para ambiente Node.js/TypeScript.

### Fase 2: Confiabilidade e Testes (Sprint 2)
1. **[TST-01]** Configurar Vitest e criar suíte de testes com cobertura mínima de 80% nos módulos [`src/server/parser.ts`](src/server/parser.ts), [`src/server/queryEngine.ts`](src/server/queryEngine.ts) e [`src/server/isolation.ts`](src/server/isolation.ts).
2. **[PRF-01]** Mover a execução de parsing de código para Worker Threads ou WebAssembly para liberar o Event Loop.
3. **[PRF-03]** Unificar as requisições de análise do editor em [`src/client/App.tsx`](src/client/App.tsx) com `AbortController`.

### Fase 3: Arquitetura e Observabilidade (Sprint 3)
1. **[ARC-01]** Modularizar [`server.ts`](server.ts) em roteadores dedicados.
2. **[INF-02]** Integrar logger estruturado Pino com identificadores únicos de requisição.
3. **[INF-03]** Adicionar tratamento para os sinais `SIGTERM` e `SIGINT` no servidor.
4. **[PRF-02]** Implementar política de expiração de memória (LRU Cache) para o [`src/server/store.ts`](src/server/store.ts).

---

## 5. Parecer de Prontidão

> **PARECER FINAL: REPROVADO PARA PRODUÇÃO**  
> A aplicação **não atende** aos requisitos mínimos de segurança, qualidade, testabilidade e estabilidade para operação em produção. A liberação para deploy deve permanecer **bloqueada** até que todos os itens de severidade **CRÍTICA** e **ALTA** (P0 e P1) sejam devidamente remediados e validados por suíte de testes automatizada.
