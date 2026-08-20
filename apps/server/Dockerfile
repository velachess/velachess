# velachess api — build from the repo root (the monorepo is the context):
#   docker build -f apps/server/Dockerfile .
FROM node:22-bookworm-slim

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY libs ./libs
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Migrations run as a release step, not at boot:
#   pnpm --filter @velachess/db exec drizzle-kit migrate
ENV NODE_ENV=production
EXPOSE 3000
RUN chown -R 1000:1000 /app
USER 1000
CMD ["pnpm", "--filter", "@velachess/server", "start"]
