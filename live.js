// Живая связь пассажир ↔ райдер.
// 1) На claude.ai: встроенная «комната» (room).
// 2) На своём хостинге (Railway): сервер server.js, поток событий /rt/stream.
//    Если сайт и сервер на разных адресах, задай window.ZHYLDAM_SERVER = 'https://твой-сервер.up.railway.app'.
// 3) Иначе (файл открыт локально) — приложение работает с симуляцией.
window.Live = (() => {
  let room = null, peers = [];
  const subs = new Set();
  const notify = () => subs.forEach(f => { try { f(peers); } catch (e) { console.error(e); } });

  async function claudeRoom() {
    try {
      if (!window.claude || !window.claude.use) return null;
      return await window.claude.use('room');
    } catch { return null; }
  }

  async function serverRoom() {
    const base = (window.ZHYLDAM_SERVER || '').replace(/\/$/, '');
    if (!base && !/^https?:$/.test(location.protocol)) return null;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(base + '/rt/health', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok || !(await r.json()).ok) return null;
    } catch { return null; }
    const me = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
    let mine = {}, others = new Map(), handlers = new Set(), connected = false, flushT = null, sending = false, dirty = false;
    const list = () => [{ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }, ...others.values()];
    const fire = () => { const p = list(); handlers.forEach(h => h({ peers: p, joined: [], left: [], updated: [] })); };
    async function flush() {
      flushT = null;
      if (sending) { dirty = true; return; }
      sending = true; dirty = false;
      try { await fetch(base + '/rt/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ peer: me, presence: mine }) }); } catch {}
      sending = false;
      if (dirty) schedule();
    }
    const schedule = () => { if (!flushT) flushT = setTimeout(flush, 150); };
    const es = new EventSource(base + '/rt/stream?peer=' + me);
    es.onopen = () => { connected = true; schedule(); };
    es.onerror = () => { connected = false; };
    es.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const mk = (id, p) => ({ peer: id, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: p && typeof p === 'object' ? p : {}, updatedAt: Date.now() });
      if (m.t === 'snap') { others = new Map(Object.entries(m.peers || {}).map(([id, p]) => [id, mk(id, p)])); }
      else if (m.t === 'p') { const old = others.get(m.peer); others.set(m.peer, old && JSON.stringify(old.presence) === JSON.stringify(m.presence) ? old : mk(m.peer, m.presence)); }
      else if (m.t === 'left') others.delete(m.peer);
      fire();
    };
    return {
      presence(patch) {
        mine = { ...mine };
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        schedule(); fire();
        return Promise.resolve();
      },
      onPeers(h) { handlers.add(h); setTimeout(fire); return () => handlers.delete(h); },
      peers: list,
      connected: () => connected,
      kind: 'server',
    };
  }

  const ready = (async () => {
    const r = (await claudeRoom()) || (await serverRoom());
    if (!r) return null;
    room = r;
    r.onPeers(ch => { peers = ch.peers; notify(); }, () => { room = null; peers = []; notify(); });
    return r;
  })();

  const others = () => peers.filter(p => !p.sameTab && p.kind === 'viewer' && p.presence);
  return {
    ready,
    on(fn) { subs.add(fn); fn(peers); return () => subs.delete(fn); },
    set(patch) { if (room) room.presence(patch).catch(() => {}); },
    available: () => !!room,
    others,
    peer: id => others().find(p => p.peer === id),
    myPeer: () => (peers.find(p => p.sameTab) || {}).peer || null,
    drivers: () => others().filter(p => p.presence.role === 'driver' && p.presence.online && p.presence.profile),
    passengers: () => others().filter(p => p.presence.role === 'passenger' && p.presence.ride),
  };
})();
// координаты в presence — коротко
window.LL = p => (p ? [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5] : null);
