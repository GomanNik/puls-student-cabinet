FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM dependencies AS migrate
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src
RUN pnpm db:generate
USER node
CMD ["pnpm", "db:migrate"]

# Отдельный непубличный worker: исходники, Prisma Client и tsx.
# Для запуска TS со server-only импортами требуется условие react-server.
FROM dependencies AS worker
COPY . .
RUN pnpm db:generate
ENV NODE_ENV=production
USER node
CMD ["pnpm", "exec", "tsx", "--conditions=react-server", "scripts/administration-worker.ts"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
