var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

var PORT = Number(process.env.PORT || 3000);
var FHIR_TARGET = process.env.FHIR_TARGET || 'http://192.168.40.24:8081';
var ROOT = __dirname;

var MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function safeFilePath(urlPath) {
  var cleanPath = urlPath === '/' ? '/index.html' : urlPath;
  var resolvedPath = path.normalize(path.join(ROOT, cleanPath));
  if (!resolvedPath.startsWith(ROOT)) {
    return null;
  }
  return resolvedPath;
}

function serveStatic(req, res) {
  var filePath = safeFilePath(req.url.split('?')[0]);
  if (!filePath) {
    send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Forbidden');
    return;
  }

  fs.readFile(filePath, function(error, content) {
    if (error) {
      send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not found');
      return;
    }

    var ext = path.extname(filePath).toLowerCase();
    send(res, 200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' }, content);
  });
}

function proxyFhir(req, res) {
  var upstreamUrl = new URL(req.url, FHIR_TARGET);
  var transport = upstreamUrl.protocol === 'https:' ? https : http;

  var proxyReq = transport.request({
    protocol: upstreamUrl.protocol,
    hostname: upstreamUrl.hostname,
    port: upstreamUrl.port,
    path: upstreamUrl.pathname + upstreamUrl.search,
    method: req.method,
    headers: {
      Accept: req.headers.accept || '*/*',
    },
  }, function(proxyRes) {
    var headers = Object.assign({}, proxyRes.headers, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
    });
    res.writeHead(proxyRes.statusCode || 502, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', function(error) {
    send(
      res,
      502,
      { 'Content-Type': 'application/json; charset=utf-8' },
      JSON.stringify({ error: 'FHIR proxy failed', detail: error.message })
    );
  });

  req.pipe(proxyReq);
}

var server = http.createServer(function(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }, '');
    return;
  }

  if (req.url.indexOf('/fhir') === 0) {
    proxyFhir(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, function() {
  console.log('Patient dashboard running at http://localhost:' + PORT);
  console.log('Proxying /fhir to ' + FHIR_TARGET);
});