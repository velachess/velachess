import { createServer, type Server } from "node:http";

export function serveLiveness(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/health/live") {
      response.writeHead(200).end(JSON.stringify({ status: "ok" }));
      return;
    }
    response.writeHead(404).end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
