/**
 * Zero-dependency static file server for the Playwright suite.
 *
 * Replaces `npx serve out`, which leaks a file descriptor per request and dies with
 * `EMFILE: too many open files` partway through a full run — the box's hard `ulimit -n` is 4096
 * and the suite now issues more requests than that. A dead web server fails every remaining
 * test with `ERR_CONNECTION_REFUSED`, which looks exactly like a product regression and isn't
 * one, so this is worth owning rather than working around.
 *
 * It serves the Next.js static export the same way GitHub Pages does:
 *   /            → out/index.html
 *   /today/      → out/today/index.html   (with or without the trailing slash)
 *   /favicon.svg → out/favicon.svg
 *   anything else→ out/404.html, status 404
 *
 * Usage: node tests/static-server.mjs <dir> <port>
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? 'out');
const PORT = Number(process.argv[3] ?? 4599);

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
    '.map': 'application/json; charset=utf-8',
  }),
);

/** Resolve a URL pathname to a file inside ROOT, or null if it escapes / does not exist. */
function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0] ?? '/');
  const candidate = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  // Directory traversal guard: everything served must stay under ROOT.
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;

  for (const file of [candidate, path.join(candidate, 'index.html'), `${candidate}.html`]) {
    try {
      if (fsSync.statSync(file).isFile()) return file;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

const server = http.createServer((req, res) => {
  // `readFile` (not `createReadStream`) so no descriptor can outlive the response — that leak is
  // the whole reason this file exists.
  const file = resolveFile(new URL(req.url ?? '/', 'http://localhost').pathname);
  const send = (status, body, type) => {
    res.writeHead(status, {
      'content-type': type,
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  if (!file) {
    fs.readFile(path.join(ROOT, '404.html'))
      .then((body) => send(404, body, 'text/html; charset=utf-8'))
      .catch(() => send(404, 'Not found', 'text/plain; charset=utf-8'));
    return;
  }

  fs.readFile(file)
    .then((body) => send(200, body, TYPES.get(path.extname(file)) ?? 'application/octet-stream'))
    .catch(() => send(500, 'Read error', 'text/plain; charset=utf-8'));
});

// Keep-alive sockets are the other half of the descriptor pressure; a short idle timeout keeps
// the live socket count bounded across a long run.
server.keepAliveTimeout = 5_000;
server.headersTimeout = 5_000;

server.listen(PORT, () => {
  process.stdout.write(`static-server: ${ROOT} on http://localhost:${PORT}\n`);
});
