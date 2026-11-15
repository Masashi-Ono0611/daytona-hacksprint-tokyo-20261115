'use strict';

const http = require('node:http');
const { QUESTIONS } = require('./quiz');

// The real app stores rounds in Postgres. Without a connection string it refuses to start.
if (!process.env.DATABASE_URL) {
  console.error('quiz-bot: DATABASE_URL is not set (a Postgres connection string is required)');
  process.exit(1);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  if (url.pathname === '/quiz') return send(res, 200, QUESTIONS[0]);
  return send(res, 404, { error: 'not found' });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`quiz-bot listening on http://localhost:${port}`));
