import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Only `db:generate`/`db:migrate`/`studio` read `url`, and each loads
    // `.env`/`.env.local` first — static introspection (e.g. `knip`) parses
    // this file without a database and must not throw just for lacking one.
    url: process.env["DATABASE_URL"] ?? "",
  },
});
