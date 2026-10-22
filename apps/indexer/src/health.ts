import { createServer, type Server } from 'node:http';
import type { JetstreamStatus } from './jetstream';

/** GET /health: 200 while connected and recently active, otherwise 503. */
export function startHealthServer(port: number, status: () => JetstreamStatus): Server {
  return createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    const current = status();
    response
      .writeHead(current.connected ? 200 : 503, { 'content-type': 'application/json' })
      .end(JSON.stringify(current));
  }).listen(port);
}
