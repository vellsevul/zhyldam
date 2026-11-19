// Zhyldam: сервер для Railway (или любого хостинга с Node.js 18+). Без зависимостей.
// Раздаёт сайт и передаёт живые данные между пассажирами и райдерами:
//   GET  /rt/stream?peer=ID   поток событий (Server-Sent Events)
//   POST /rt/presence         {peer, presence} — текущее состояние участника
//   GET  /rt/health           проверка, что сервер жив
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_PEERS = 1000;
const MAX_BODY = 8 * 1024;
const GRACE_MS = 6000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};
const PUBLIC = new Set(['/index.html', '/style.css', '/map.js', '/live.js', '/account.js', '/app.js', '/driver.js', '/logo.svg', '/vendor/leaflet/leaflet.css', '/vendor/leaflet/leaflet.js']);

const peers = new Map(); // id -> { presence, conns:Set<res>, gone: Timeout|null, posts:number[] }
const validId = id => typeof id === 'string' && /^[a-z0-9]{6,24}$/i.test(id);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function send(res, obj) { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch {} }
function broadcast(obj, except) {
  for (const [id, p] of peers) if (id !== except) for (const c of p.conns) send(c, obj);
}
function snapshot(except) {
  const out = {};
  for (const [id, p] of peers) if (id !== except && p.presence) out[id] = p.presence;
  return out;
}
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function stream(req, res, id) {
  if (!validId(id)) return json(res, 400, { error: 'peer' });
  let p = peers.get(id);
  if (!p) {
    if (peers.size >= MAX_PEERS) return json(res, 503, { error: 'full' });
    p = { presence: null, conns: new Set(), gone: null, posts: [] };
    peers.set(id, p);
  }
  clearTimeout(p.gone); p.gone = null;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 2000\n\n');
  p.conns.add(res);
  send(res, { t: 'snap', peers: snapshot(id) });
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20000);
  req.on('close', () => {
    clearInterval(ping);
    p.conns.delete(res);
    if (!p.conns.size) p.gone = setTimeout(() => {
      if (p.conns.size) return;
      peers.delete(id);
      broadcast({ t: 'left', peer: id });
    }, GRACE_MS);
  });
}

function presence(req, res) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > MAX_BODY) { req.destroy(); } });
  req.on('end', () => {
    let msg;
    try { msg = JSON.parse(body); } catch { return json(res, 400, { error: 'json' }); }
    const { peer, presence } = msg || {};
    if (!validId(peer) || !presence || typeof presence !== 'object' || Array.isArray(presence)) return json(res, 400, { error: 'bad' });
    let p = peers.get(peer);
    if (!p) {
      if (peers.size >= MAX_PEERS) return json(res, 503, { error: 'full' });
      p = { presence: null, conns: new Set(), gone: setTimeout(() => peers.delete(peer), GRACE_MS), posts: [] };
      peers.set(peer, p);
    }
    // не чаще ~20 обновлений в секунду с одного участника
    const now = Date.now();
    p.posts = p.posts.filter(t => now - t < 1000); p.posts.push(now);
    if (p.posts.length > 20) return json(res, 429, { error: 'slow down' });
    const text = JSON.stringify(presence);
    if (p.presence && JSON.stringify(p.presence) === text) return json(res, 200, { ok: true });
    p.presence = presence;
    broadcast({ t: 'p', peer, presence }, peer);
    json(res, 200, { ok: true });
  });
}

function serveStatic(req, res, pathname) {
  let p = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  if (!PUBLIC.has(p)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не найдено'); }
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': p.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (url.pathname === '/rt/health') return json(res, 200, { ok: true, peers: peers.size });
  if (url.pathname === '/rt/stream' && req.method === 'GET') return stream(req, res, url.searchParams.get('peer'));
  if (url.pathname === '/rt/presence' && req.method === 'POST') return presence(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url.pathname);
}).listen(PORT, '0.0.0.0', () => console.log(`⚡ Zhyldam: http://localhost:${PORT}`));
