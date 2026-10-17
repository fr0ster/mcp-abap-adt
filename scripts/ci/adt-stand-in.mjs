#!/usr/bin/env node
// An ADT stand-in for the image checks (scripts/ci/check-images.mjs). It runs
// in a container beside the image under check, on their own Docker network:
// every request is answered 200 with a CSRF token and a session cookie, and
// recorded — its method, path and Authorization header. GET /__requests
// answers the record as JSON; nothing else of the record is served.
//
//   node adt-stand-in.mjs [port]     (default 8080)
import * as http from 'node:http';

const port = Number(process.argv[2] ?? 8080);
const requests = [];

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/__requests') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(requests));
      return;
    }
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization ?? null,
    });
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'application/xml',
        'x-csrf-token': 'stand-in-csrf',
        'set-cookie': ['SAP_SESSIONID_CHK_100=stand-in; path=/'],
      });
      res.end('');
    });
  })
  .listen(port, '0.0.0.0', () => {
    process.stdout.write(`ADT stand-in listening on ${port}\n`);
  });

process.on('SIGTERM', () => process.exit(0));
