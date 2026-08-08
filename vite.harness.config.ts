import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = new URL('./', import.meta.url).pathname;
const fixturesDir = normalize(join(root, 'tests/fixtures'));

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const serveFixtures = (): Plugin => ({
  name: 'harness-serve-fixtures',
  configureServer(server) {
    server.middlewares.use('/fixtures', async (req, res, next) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url ?? '', 'http://localhost').pathname);
        const filePath = normalize(join(fixturesDir, pathname));
        if (!filePath.startsWith(fixturesDir)) {
          res.statusCode = 403;
          res.end('forbidden');
          return;
        }
        const info = await stat(filePath);
        if (!info.isFile()) {
          next();
          return;
        }
        const body = await readFile(filePath);
        res.setHeader('Content-Type', mimeTypes[extname(filePath)] ?? 'application/octet-stream');
        res.end(body);
      } catch {
        next();
      }
    });
  },
});

export default defineConfig({
  root: `${root}tests/harness`,
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [root] },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: { alias: { '@': `${root}src` } },
  plugins: [serveFixtures()],
});
