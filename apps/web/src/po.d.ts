/** `@lingui/vite-plugin` compiles `.po` into modules at build time but ships no types — same reason `vite/client` covers `?url` imports. */
declare module "*.po" {
  import type { Messages } from "@lingui/core";

  export const messages: Messages;
}
