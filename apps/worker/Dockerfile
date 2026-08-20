# velachess worker — build from the repo root (the monorepo is the context):
#   docker build -f apps/worker/Dockerfile .
# Same base recipe as the api image; only the command differs — the worker
# consumes pg-boss queues instead of serving HTTP.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*
ENV ENGINE_CMD=/usr/games/stockfish

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY libs ./libs
COPY apps ./apps
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
RUN chown -R 1000:1000 /app
USER 1000
CMD ["pnpm", "--filter", "@velachess/worker", "start"]
