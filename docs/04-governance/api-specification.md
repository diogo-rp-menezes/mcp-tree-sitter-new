# API Specification

Formal contract for the MCP Tree-sitter Server HTTP API. This document is the
single source of truth for request/response shapes and error semantics. It is a
seed covering the endpoints touched by the SEC-01 remediation; expand it as
other endpoints are formalized.

## Conventions

- Base URL: `http://<host>:<port>`
- Content type: `application/json` for all request bodies and responses
- Error shape (all non-2xx responses): `{ "error": string }` — generic,
  client-safe messages; internal details are logged server-side only
- Exception: MCP endpoints (`POST /api/mcp`, `GET /mcp/sse`) use the JSON-RPC 2.0
  error envelope described in the "Authentication (MCP Endpoints)" section
- `404` for unknown project names; `400` for invalid input; `500` for
  unexpected server-side failures

## Authentication (MCP Endpoints)

Applies to `POST /api/mcp` (JSON-RPC 2.0) and `GET /mcp/sse` (SSE stream).
`GET /api/health` is public and never requires credentials.

### Configuration (environment variables)

| Variable | Required | Description |
|---|---|---|
| `MCP_AUTH_ENABLED` | no | `true`/`false`. Default: `true` when `NODE_ENV=production`, `false` otherwise. Any other value aborts startup. |
| `MCP_API_KEYS` | no | Comma-separated static API keys accepted as Bearer tokens. |
| `MCP_JWT_SECRET` | no | HS256 secret for JWT validation (min 32 chars, RFC 7518 section 3.2). Enables JWT auth when set. |

Fail-fast: enabling auth with neither `MCP_API_KEYS` nor `MCP_JWT_SECRET`
aborts startup (fail-closed — the server never runs with auth enabled but
nothing to validate against).

### Credential format

`Authorization: Bearer <token>` where the token is either:

1. An exact API key listed in `MCP_API_KEYS`, or
2. A JWT with `alg: HS256` signed with `MCP_JWT_SECRET`, carrying a
   **required** `exp` claim (optional `nbf` is honored; no clock-skew leeway).
   Only HS256 is accepted — `alg: none` and asymmetric algorithms are
   rejected (algorithm confusion prevention).

### Error semantics

Auth failures use the JSON-RPC 2.0 error envelope with the proper HTTP status:

| HTTP | JSON-RPC code | When |
|---|---|---|
| `401` | `-32000` | Missing, malformed, invalid, or expired credentials. Also sends `WWW-Authenticate: Bearer realm="mcp-server-tree-sitter"` |
| `403` | `-32001` | Reserved for future role/permission denials |
| `503` | `-32002` | Defensive: auth enabled with no validator configured |

Response body shape:

```json
{
  "jsonrpc": "2.0",
  "id": "<echoed JSON-RPC request id, or null>",
  "error": { "code": -32000, "message": "Unauthorized: missing Bearer credentials" }
}
```

The `id` field echoes the request `id` when the JSON body is parseable,
otherwise `null`. Client-facing messages are generic; detailed rejection
reasons (client IP, reason code) are logged server-side only. Credential
material is never logged.

### Example

Request without credentials:

```
POST /api/mcp
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

Response:

```
401 Unauthorized
WWW-Authenticate: Bearer realm="mcp-server-tree-sitter"
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32000, "message": "Unauthorized: missing Bearer credentials" } }
```

Authenticated clients see no protocol changes: valid credentials pass the
middleware and all JSON-RPC methods behave exactly as before.

## CORS (Cross-Origin Resource Sharing)

Applies to **all endpoints** via global middleware (SEC-04 remediation).
Replaces the previous wildcard configuration (`app.use(cors())`), which sent
`Access-Control-Allow-Origin: *` and let any website make requests to the
server.

### Configuration (environment variables)

| Variable | Required | Description |
|---|---|---|
| `MCP_CORS_ORIGINS` | no | Comma-separated allowed origins (e.g. `https://example.com,https://app.example.com`). Default: `http://localhost:3000`. |
| `MCP_CORS_ALLOW_WILDCARD` | no | `true`/`false`. Explicit opt-in required before `*` is accepted in `MCP_CORS_ORIGINS`. Default: `false`. Any other value aborts startup. |

Fail-fast: malformed values abort startup (fail-closed — the server never
runs with a broken allowlist):

- Origins must be absolute `http`/`https` URLs with a hostname and no path,
  query, fragment, or userinfo (an origin is scheme + host + port, RFC 6454).
- Origins are canonicalized (lowercase scheme/host, default port dropped,
  trailing `/` removed) and deduplicated, so configuration matches the
  `Origin` header browsers actually send.
- `*` is rejected unless `MCP_CORS_ALLOW_WILDCARD=true`; it cannot be
  combined with explicit origins and cannot appear inside an origin (e.g.
  `https://*.example.com`).
- Null bytes and empty lists abort startup.

### Response headers

| Header | Allowlist mode | Wildcard mode (opt-in) |
|---|---|---|
| `Access-Control-Allow-Origin` | Request origin, only when allowlisted | `*` |
| `Access-Control-Allow-Credentials` | `true` | omitted |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` | `GET, POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization` | `Content-Type, Authorization` |
| `Vary` | `Origin` | — |

Preflight (`OPTIONS`) requests are answered `204 No Content` with the
headers above. Requests whose `Origin` is not allowlisted receive **no**
CORS headers — the browser blocks the response client-side.

Notes:

- CORS is a browser-enforced mechanism, not server access control: a
  disallowed request still executes server-side. Endpoint authorization
  remains the job of the auth middleware (see "Authentication (MCP
  Endpoints)").
- `DELETE` is intentionally absent from `Access-Control-Allow-Methods`:
  REST endpoints do not require credentials yet, so refusing cross-origin
  `DELETE` preflight is CSRF hardening, not a regression. The bundled web
  UI is same-origin (Vite middleware in dev, static serving in prod) and
  unaffected.
- Non-browser clients (curl, MCP SDKs) send no `Origin` header and are
  unaffected.

## Git Endpoints

### GET /api/projects/:name/git-status

Returns the Git status of the project's root directory. Read-only.

**Auth:** none (auth currently covers MCP endpoints only — see "Authentication (MCP Endpoints)"; REST auth is a separate remediation).

**Response 200 — `GitRepoStatus`:**

| Field | Type | Description |
|---|---|---|
| `isGitRepo` | `boolean` | Whether the path is inside a Git worktree |
| `branch` | `string \| null` | Symbolic branch name; `null` when not a repo; `"HEAD"` when detached/unreadable |
| `uncommittedCount` | `number` | Total files with pending changes (staged + modified + untracked) |
| `stagedCount` | `number` | Files whose index state differs from HEAD |
| `modifiedCount` | `number` | Files whose worktree state differs from the index |
| `untrackedCount` | `number` | Files present in the worktree but absent from HEAD and index |
| `lastCommit` | `GitCommitInfo \| null` | Latest commit; `null` when the repo has no commits |
| `remoteUrl` | `string \| null` | URL of the `origin` remote, when configured |
| `statusText` | `string` | Human-readable pt-BR summary (display only) |
| `repoPath` | `string` | Absolute path that was inspected |

**`GitCommitInfo`:** `{ hash, author, relativeDate, date, message }` — `hash`
is the 7-char short SHA; `date` is ISO 8601; `relativeDate` is pt-BR display
text; `message` is the commit subject (first line).

**Error 404:** `{ "error": "Project not found" }`

**Notes:**
- Implemented with `isomorphic-git` (no child processes); the project path is
  never passed to a shell (SEC-01 remediation).
- Counters are derived from `git.statusMatrix()`; known display-only
  divergences from `git status --porcelain`: renames/copies count as separate
  files, and untracked directories count per file.
- Failures never produce a 5xx from this endpoint; they are reported as
  `isGitRepo: false` with a descriptive `statusText`.

### POST /api/projects/:name/git-init

Initializes a Git repository at the project's root directory (idempotent:
re-initializing an existing repository is a no-op that returns current status).

**Auth:** none (auth currently covers MCP endpoints only — see "Authentication (MCP Endpoints)"; REST auth is a separate remediation).

**Request body:** none.

**Response 200 — `GitRepoStatus`:** same shape as git-status. On failure,
returns `isGitRepo: false` with a descriptive `statusText` (e.g. invalid
branch name, unwritable directory) — never a 5xx.

**Side effects:** creates `.git/` when absent; appends a local `[user]`
identity (`AI Studio <dev@aistudio.local>`) to `.git/config` when initializing.
The default branch is `main`.

**Error 404:** `{ "error": "Project not found" }`

## Scan Directory Endpoint

### POST /api/scan-directory

Scans a host directory and imports its source files into an isolated
project. SEC-03 remediation: the requested path is validated against the
allowed workspace roots **before any filesystem access**, so the endpoint
cannot be used as a filesystem oracle for locations outside the roots.

**Auth:** none (auth currently covers MCP endpoints only — see "Authentication (MCP Endpoints)"; REST auth is a separate remediation).

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | yes | Directory to scan. Absolute, or relative to the server working directory. |
| `name` | `string` | no | Custom project name; defaults to the directory basename (sanitized to `[a-z0-9_-]`). |
| `maxFiles` | `number` | no | File discovery cap. Default: `150`. |

**Configuration (environment variables):**

| Variable | Required | Description |
|---|---|---|
| `MCP_ALLOWED_WORKSPACE_ROOTS` | no | Comma-separated allowed roots (absolute or cwd-relative, e.g. `/workspace,/projects,./src`). Default: `/workspace`. Duplicates are deduplicated. Malformed values (empty list, null bytes) abort startup — fail-fast, fail-closed. |

**Validation order (fail-closed):**

1. `path` missing, empty, non-string, or containing null bytes → `400`
2. Lexical boundary: `path.resolve(path)` must be an allowed root itself or
   located underneath one. Rejects absolute paths outside the roots and
   `..` traversal → `403`
3. Existence/type (only checked after the boundary passes): missing →
   `404`; exists but is not a directory → `400`
4. Symlink boundary: the canonical location (`realpath`) of the candidate
   must still be underneath the canonical location of a root → `403`

**Error semantics:**

| HTTP | When |
|---|---|
| `400` | Missing/invalid `path`; path exists but is not a directory |
| `403` | Path resolves outside the allowed workspace roots (absolute outside, `..` traversal, or symlink escape) |
| `404` | Directory does not exist (probed only after the boundary check passes) |
| `500` | Unexpected server-side failure |

Error messages echo only the client-supplied path — never the resolved
absolute path nor the configured roots (no filesystem-structure leak).
Detailed rejection reasons (supplied path, resolved path, roots) are
logged server-side only.

**Response 200:**

```json
{
  "status": "scanned",
  "project": "my-project",
  "path": "/workspace/my-project",
  "filesCount": 42,
  "detectedLanguages": ["typescript", "python"]
}
```

**Behavior notes:**
- Discovery rules are unchanged for valid paths: ignored directories
  (`node_modules`, `.git`, dot-directories, etc.), allowed extensions,
  1 MB per-file size cap.
- Path comparisons are case-insensitive on Windows (win32) and
  case-sensitive elsewhere.
