# Dev-only image. No native deps in this workspace need apt-get
# (pnpm-workspace.yaml's onlyBuiltDependencies all fetch prebuilt
# binaries in postinstall) — apps/*/Dockerfile stays the source of
# truth for production images.
FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

# Base image ships pnpm + eslint globally via npm, ahead of corepack on
# PATH — remove so pnpm resolves to the version pinned below, not that
# floating install. eslint is unused here (repo runs oxlint/oxfmt).
RUN npm uninstall -g pnpm eslint && corepack enable

WORKDIR /workspace

# docker-compose.dev.yml mounts a named volume over node_modules; a named
# volume inherits ownership from what it's laid over on first populate.
RUN mkdir -p node_modules && chown node:node node_modules

# corepack caches under the current user's home — must switch before
# `prepare`, or the cache lands somewhere `node` (the runtime user) can't
# read.
USER node

RUN corepack prepare pnpm@10.28.0 --activate
