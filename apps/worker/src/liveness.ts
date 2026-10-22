import { once } from "node:events";
import { createServer } from "node:http";

export async function serveLiveness(port: number) {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/health/live") {
      response.writeHead(200).end(JSON.stringify({ status: "ok" }));
      return;
    }
    response.writeHead(404).end(JSON.stringify({ error: "not found" }));
  });

  await once(server.listen(port), "listening");
  return server;
}
