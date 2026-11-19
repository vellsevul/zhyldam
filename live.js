// Живая связь пассажир ↔ райдер через room (все, у кого страница открыта сейчас).
// Если room недоступен (локальный файл, нет доступа) — приложение работает с симуляцией.
window.Live = (() => {
  let room = null, peers = [];
  const subs = new Set();
  const notify = () => subs.forEach(f => { try { f(peers); } catch (e) { console.error(e); } });
  const ready = (async () => {
    try {
      if (!window.claude || !window.claude.use) return null;
      const r = await window.claude.use('room');
      if (!r) return null;
      room = r;
      r.onPeers(ch => { peers = ch.peers; notify(); }, () => { room = null; peers = []; notify(); });
      return r;
    } catch { return null; }
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
    drivers: () => others().filter(p => p.presence.role === 'driver' && p.presence.online),
    passengers: () => others().filter(p => p.presence.role === 'passenger' && p.presence.ride),
  };
})();
// координаты в presence — коротко
window.LL = p => (p ? [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5] : null);
