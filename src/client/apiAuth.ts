/**
 * Injeta o Bearer token em chamadas same-origin para /api/* e /mcp/*.
 *
 * O token NUNCA é embutido no bundle: é informado pelo usuário quando o servidor
 * responde 401 e fica apenas em sessionStorage (aba atual). Com a autenticação
 * desabilitada (desenvolvimento), nenhuma requisição retorna 401 e nada é pedido.
 */
const TOKEN_KEY = 'mcp_api_token';

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sessionStorage indisponível: o token vale só para esta chamada */
  }
}

function isProtectedUrl(input: RequestInfo | URL): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.origin);
    return (
      url.origin === window.location.origin &&
      (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mcp/')) &&
      url.pathname !== '/api/health'
    );
  } catch {
    return false;
  }
}

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit | undefined {
  if (!token) return init;
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

export function installApiAuth(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isProtectedUrl(input)) return originalFetch(input, init);

    const response = await originalFetch(input, withAuth(init, readToken()));
    if (response.status !== 401) return response;

    const entered = window.prompt('Este servidor exige autenticação. Informe a API key ou o token JWT:');
    if (!entered) return response;
    const token = entered.trim();
    const retry = await originalFetch(input, withAuth(init, token));
    writeToken(retry.status === 401 ? null : token);
    return retry;
  };
}
