import path from "node:path";

export const aliases = {
  "@velachess/chess": path.resolve(import.meta.dirname, "./libs/chess"),
  "@velachess/infra-engine": path.resolve(import.meta.dirname, "./libs/infra/engine"),
  "@velachess/fixtures": path.resolve(import.meta.dirname, "./libs/fixtures"),
  "@velachess/infra-platforms": path.resolve(
    import.meta.dirname,
    "./libs/infra/platforms",
  ),
  "@velachess/infra-db": path.resolve(import.meta.dirname, "./libs/infra/db"),
  "@velachess/analysis": path.resolve(import.meta.dirname, "./libs/analysis"),
  "@velachess/infra-queue": path.resolve(import.meta.dirname, "./libs/infra/queue"),
  "@velachess/test-utils": path.resolve(import.meta.dirname, "./libs/test-utils"),
  "@velachess/ui": path.resolve(import.meta.dirname, "./libs/ui/src"),
  "@velachess/infra-logger": path.resolve(import.meta.dirname, "./libs/infra/logger/src"),
  "@velachess/infra-auth": path.resolve(import.meta.dirname, "./libs/infra/auth"),
  "@velachess/infra-email": path.resolve(import.meta.dirname, "./libs/infra/email"),
};

export const backendTest = {
  environment: "node" as const,
  globals: true,
  hookTimeout: 120_000,
  testTimeout: 120_000,
};
