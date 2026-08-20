# Repository Layout

## Docker

Shared Docker configuration lives under the root `docker/` directory. This
includes orchestration files, reusable scripts, local infrastructure
configuration, and other Docker assets that are not owned by one application.

Application-specific Dockerfiles stay colocated with the application they
build. A Dockerfile for `apps/web`, for example, belongs under `apps/web/`
because it changes with that app's runtime, build steps, and deployment
surface.

Use this split when adding Docker files:

| File type                                           | Location                   |
| --------------------------------------------------- | -------------------------- |
| Shared Compose files                                | `docker/`                  |
| Shared Docker helper scripts                        | `docker/`                  |
| Shared local infrastructure configuration           | `docker/`                  |
| App-specific Dockerfiles                            | app directory              |
| App-specific Docker build context files             | app directory              |
| Docker files coupled to one package's build/runtime | that package/app directory |

The rule of thumb: if changing the file affects repository-wide local
infrastructure, put it in `docker/`. If changing it is part of changing one
deployable app, keep it beside that app.

`.devcontainer/` is the one exception: VS Code's Dev Containers extension
only discovers `devcontainer.json` at that fixed root path, so it stays
there rather than under `docker/` even though it's shared infrastructure —
its own compose file, `docker/docker-compose.dev.yml`, follows the rule
above.
