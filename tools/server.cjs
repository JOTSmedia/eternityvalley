const http = require('http');
const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 5173;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
  const start = Date.now();

  // Set default CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const rawUrl = req.url.split('?')[0].split('#')[0];
    let cleanUrl = decodeURIComponent(rawUrl);
    let filePath = path.normalize(path.join(CLIENT_DIR, cleanUrl));

    // Security: Prevent directory traversal
    if (!filePath.startsWith(CLIENT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden: Access outside workspace root is not permitted.');
      return;
    }

    // Resolve directory index.html
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } else if (fs.existsSync(filePath + '.html')) {
      // Pretty URLs fallback (e.g., /admin -> /admin.html)
      filePath = filePath + '.html';
    }

    // Check if file exists
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${cleanUrl}`);
      console.log(`[HTTP 404] ${req.method} ${cleanUrl} (${Date.now() - start}ms)`);
      return;
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Handle Range Requests (HTTP 206 Partial Content)
    const rangeHeader = req.headers.range;
    if (rangeHeader && req.method === 'GET') {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const startByte = parseInt(parts[0], 10);
      const endByte = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (startByte >= totalSize || endByte >= totalSize || startByte > endByte) {
        res.writeHead(416, {
          'Content-Range': `bytes */${totalSize}`,
          'Content-Type': 'text/plain; charset=utf-8'
        });
        res.end('416 Range Not Satisfiable');
        return;
      }

      const chunkSize = (endByte - startByte) + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${startByte}-${endByte}/${totalSize}`,
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      const stream = fs.createReadStream(filePath, { start: startByte, end: endByte });
      stream.pipe(res);
      console.log(`[HTTP 206] ${req.method} ${cleanUrl} [${startByte}-${endByte}/${totalSize}] (${Date.now() - start}ms)`);
      return;
    }

    // Handle HEAD request
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': totalSize
      });
      res.end();
      console.log(`[HTTP 200 HEAD] ${cleanUrl} (${Date.now() - start}ms)`);
      return;
    }

    // Handle standard GET request
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': totalSize
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    console.log(`[HTTP 200] ${req.method} ${cleanUrl} (${totalSize} bytes, ${Date.now() - start}ms)`);
  } catch (e) {
    console.error(`[HTTP 500] Error serving ${req.url}:`, e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 Internal Server Error: ' + e.message);
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ETERNITY VALLEY HTTP SERVER] Live at http://localhost:${PORT}`);
  console.log(`[ETERNITY VALLEY HTTP SERVER] Serving: ${CLIENT_DIR}`);
});
