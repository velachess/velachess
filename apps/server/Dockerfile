# velachess api — build from the repo root (the monorepo is the context):
#   docker build -f apps/server/Dockerfile .
FROM node:22-bookworm-slim

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY libs ./libs
COPY apps ./apps
RUN pnpm install --frozen-lockfile
# A real global binary replaces the corepack shim, which would otherwise
# download pnpm from npmjs on first boot — a hard dependency on container
# DNS that has nothing to do with running an API.
RUN corepack disable pnpm && npm install -g pnpm@10.28.0

# Migrations run as a release step, not at boot:
#   pnpm --filter @velachess/infra-db exec drizzle-kit migrate
ENV NODE_ENV=production
EXPOSE 3000
RUN chown -R 1000:1000 /app
USER 1000
CMD ["pnpm", "--filter", "@velachess/server", "start"]
