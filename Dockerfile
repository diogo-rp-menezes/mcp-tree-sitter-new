# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MCP_DB_PATH=/app/data/workspace.db \
    MCP_ALLOWED_WORKSPACE_ROOTS=/workspace
WORKDIR /app
# git é necessário para as rotas de Git do projeto
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# tsx é dependência de runtime (servidor e worker de parse são TypeScript)
RUN npm ci --omit=dev && npm cache clean --force
COPY server.ts tsconfig.json ./
COPY src/server ./src/server
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data /workspace && chown -R node:node /app /workspace
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server.ts"]
