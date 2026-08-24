# Build and run VelaChess locally

In this tutorial, you will start VelaChess on your computer using host
development processes and a PostgreSQL container. When you finish, the web
application, API, worker, and database will be running and ready for development.

## Before you begin

Install these tools:

- Node.js 22 or later
- pnpm 10.28.0, the version declared by this repository
- Git
- Docker with Docker Compose

The repository does not pin versions of Git or Docker. Confirm that the tools are
available before continuing:

```bash
node --version
pnpm --version
git --version
docker --version
docker compose version
```

## 1. Clone the repository

Clone VelaChess and enter its directory:

```bash
git clone https://github.com/velachess/velachess.git
cd velachess
```

Run every command that follows from this directory.

## 2. Install the dependencies

Install all workspace dependencies:

```bash
pnpm install
```

**Checkpoint:** The command completes successfully and creates `node_modules`.

## 3. Configure the local environment

Copy the development environment template:

```bash
cp .env.example .env
```

The copied file points the application at the development database and includes
credentials for the first local user. `.env` is ignored by Git.

For this local tutorial, keep the supplied values. Deployment configuration has
a different security lifecycle; follow [Self-host VelaChess](../docs/how-to/self-host.md)
when you need a persistent installation.

## 4. Start PostgreSQL

Start the development PostgreSQL service:

```bash
pnpm infra:dev:up
```

This command waits for PostgreSQL to become healthy. You can confirm its status:

```bash
docker compose -f docker/docker-compose.dev.yml ps postgres
```

**Checkpoint:** The `postgres` service is running and reports a healthy status.

## 5. Run the database migrations

Apply every migration to the development database:

```bash
pnpm db:migrate
```

**Checkpoint:** The migration command returns to the prompt without an error.

## 6. Start the application processes

Open three terminals in the repository root. Keep each process running.

In the first terminal, start the API server:

```bash
pnpm dev:server
```

On an empty database, this process also creates the first local user from `.env`.

**Checkpoint:** The server output contains `first-user bootstrap` followed by
`api listening`, with the API listening on port 3000.

In the second terminal, start the background worker:

```bash
pnpm dev:worker
```

**Checkpoint:** The worker output contains `worker consuming`.

In the third terminal, start the web application:

```bash
pnpm dev:web
```

**Checkpoint:** Vite reports the local web address as `http://localhost:5173`.

## 7. Sign in locally

Open <http://localhost:5173> in a browser. VelaChess redirects you to its sign-in
screen.

Use the bootstrap credentials copied into `.env`:

- Email: `user@velachess.local`
- Password: `dev-password`

Select **Sign in**.

**Checkpoint:** The browser leaves the sign-in screen and shows the VelaChess
onboarding flow. This confirms that the local session was created successfully.

## 8. Verify the running environment

In another terminal, call the API health endpoint:

```bash
curl -fsS http://localhost:3000/health
```

It returns:

```text
{"ok":true}
```

You now have evidence that the main services are working:

- PostgreSQL reports healthy in Docker Compose.
- The API health endpoint returns `{"ok":true}`.
- The worker reports that it is consuming jobs.
- The web application opens and accepts the local bootstrap credentials.

For other ways to run the processes, including the Dev Container, see
[Run VelaChess locally](../docs/how-to/run-locally.md).

## What you just did

You cloned VelaChess, installed its dependencies, started PostgreSQL, migrated the
database, ran the web application, API server, and worker, authenticated locally,
and verified that the development environment works.

Continue with:

- [Repository layout](../docs/reference/repository-layout.md)
- [Architecture](../docs/explanation/architecture.md)
- [Verify a change](../docs/how-to/verify-a-change.md)
- [Contribution workflow](../CONTRIBUTING.md)
