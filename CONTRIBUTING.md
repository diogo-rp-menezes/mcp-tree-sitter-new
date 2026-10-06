# Contribuindo

1. `npm ci` (Node >= 22.5).
2. Crie uma branch e faça mudanças pequenas e testadas.
3. Antes do PR: `npm run lint && npm test && npm run build`.
4. Mudanças em autenticação, CORS, acesso a arquivos ou SQL exigem teste correspondente em `src/server/`.
5. Squash merge em `main`; descreva o motivo da mudança no PR.

Veja `AGENTS.md` para a arquitetura e as regras de segurança.
