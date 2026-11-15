'use strict';

const http = require('node:http');
const { FORECAST } = require('./forecast');

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  if (url.pathname === '/health') return send(res, 200, { ok: true });
  if (url.pathname === '/forecast') return send(res, 200, FORECAST);
  return send(res, 404, { error: 'not found' });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`weather-dash listening on http://localhost:${port}`));
