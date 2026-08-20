import { api, parseResponse } from "./client.ts";

export async function checkBackendHealth() {
  await parseResponse(api.health.$get());
}
