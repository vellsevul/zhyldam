// Общие утилиты, своя векторная карта Алматы, граф улиц, маршруты с учётом пробок
window.Z = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const DEFAULT_HOME = [43.2405, 76.9125]; // Абая / Байзакова
  const PLACES = [
    { n: 'MEGA Alma-Ata', a: 'ул. Розыбакиева, 247', ic: '🛍️', c: [43.2027, 76.8925] },
    { n: 'Dostyk Plaza', a: 'мкр. Самал-2, 111', ic: '🏬', c: [43.2335, 76.9568] },
    { n: 'Кок-Тобе', a: 'ул. Омарова', ic: '🎡', c: [43.2316, 76.9762] },
    { n: 'Аэропорт Алматы', a: 'ул. Майлина, 2', ic: '✈️', c: [43.3521, 77.0405] },
    { n: 'Esentai Mall', a: 'пр. аль-Фараби, 77/8', ic: '💎', c: [43.2187, 76.9277] },
    { n: 'Медеу', a: 'ущелье Медеу', ic: '⛸️', c: [43.1575, 77.0590] },
    { n: 'Зелёный базар', a: 'ул. Жибек Жолы, 53', ic: '🍎', c: [43.2626, 76.9547] },
    { n: 'КазНУ им. аль-Фараби', a: 'пр. аль-Фараби, 71', ic: '🎓', c: [43.2245, 76.9180] },
    { n: 'Арбат', a: 'ул. Жибек Жолы', ic: '🎸', c: [43.2610, 76.9450] },
    { n: 'Центральный парк', a: 'ул. Гоголя, 1', ic: '🌳', c: [43.2620, 76.9660] },
    { n: 'ТРЦ Forum', a: 'ул. Сейфуллина, 617', ic: '🛒', c: [43.2340, 76.9350] },
    { n: 'Атакент', a: 'ул. Тимирязева, 42', ic: '🏟️', c: [43.2270, 76.9070] },
  ];
  const VEHICLES = [
    { id: 'moped', em: '🛵', n: 'Мопед', d: 'Скутер до 125 см³, по городу', base: 300, km: 90, speed: 34, badge: '' },
    { id: 'moto', em: '🏍️', n: 'Мото', d: 'Мотоцикл, быстрее мопеда', base: 450, km: 120, speed: 42, badge: 'ХИТ' },
    { id: 'turbo', em: '🏁', n: 'Turbo', d: 'Спортбайк для любителей скорости', base: 800, km: 180, speed: 50, badge: 'ТОП' },
  ];

  const hav = (a, b) => {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/[  ,]/g, ' ') + ' ₸';
  const round50 = n => Math.round(n / 50) * 50;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const vehBy = id => VEHICLES.find(v => v.id === id) || VEHICLES[1];
  const priceFor = (v, km, jam = 0) => round50((v.base + v.km * km) * (1 + jam * .25));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('zh_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('zh_' + k, JSON.stringify(v)); } catch {} },
  };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2400); };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- граф улиц ----------
  const LAT0 = 43.196, DLAT = .0055, NR = 33;   // ряды (с запада на восток)
  const LNG0 = 76.80, DLNG = .0075, NC = 41;    // колонки (с юга на север)
  const rowLat = i => LAT0 + i * DLAT, colLng = j => LNG0 + j * DLNG;
  const MAJOR_ROWS = { 12: 'пр. Райымбека', 10: 'ул. Толе би', 8: 'пр. Абая', 7: 'ул. Сатпаева', 4: 'пр. аль-Фараби', 16: 'ул. Суюнбая', 22: 'ул. Бекмаханова' };
  const MAJOR_COLS = { 12: 'ул. Розыбакиева', 15: 'ул. Байзакова', 19: 'пр. Назарбаева', 21: 'пр. Достык', 8: 'ул. Саина', 25: 'ул. Майлина', 5: 'ул. Momyшулы' };
  MAJOR_COLS[5] = 'ул. Момышулы';
  const nid = (i, j) => i * NC + j;
  const nodeLL = id => [rowLat(Math.floor(id / NC)), colLng(id % NC)];

  // детерминированный «шум» для пробок
  const hash = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  function rushFactor() {
    const h = (new Date().getUTCHours() + 5) % 24; // Алматы UTC+5
    if ((h >= 8 && h < 10) || (h >= 17 && h < 20)) return 1;
    if (h >= 23 || h < 6) return .2;
    return .65;
  }
  let RUSH = rushFactor();
  const edges = new Map(); // key -> {a,b,major,jam,len}
  const adj = Array.from({ length: NR * NC }, () => []);
  function addEdge(a, b, major, seed) {
    const len = hav(nodeLL(a), nodeLL(b));
    const base = major ? .45 + hash(a, b, 1) * .55 : hash(a, b, 2) * .45;
    const e = { a, b, major, len, base, jam: 0 };
    const key = a < b ? a + '-' + b : b + '-' + a;
    edges.set(key, e); adj[a].push([b, e]); adj[b].push([a, e]);
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NC; j++) {
    if (j + 1 < NC) addEdge(nid(i, j), nid(i, j + 1), i in MAJOR_ROWS);
    if (i + 1 < NR) addEdge(nid(i, j), nid(i + 1, j), j in MAJOR_COLS);
  }
  function updateJams() {
    RUSH = rushFactor();
    const t = Math.floor(Date.now() / 300000); // меняется каждые 5 минут
    for (const e of edges.values()) e.jam = Math.min(1, e.base * RUSH * (.75 + hash(e.a, e.b, t) * .5));
  }
  updateJams();

  const nearestNode = p => {
    const i = Math.max(0, Math.min(NR - 1, Math.round((p[0] - LAT0) / DLAT)));
    const j = Math.max(0, Math.min(NC - 1, Math.round((p[1] - LNG0) / DLNG)));
    return nid(i, j);
  };
  // время по ребру в часах: авто стоит в пробке, мото проезжает между рядами
  const edgeHours = (e, speed, kind) => e.len / (speed * (e.major ? 1 : .78)) * (1 + e.jam * (kind === 'car' ? 3.2 : .55));

  function route(from, to, kind = 'moto', speed = 42) {
    const s = nearestNode(from), g = nearestNode(to);
    const dist = new Float64Array(NR * NC).fill(Infinity), prev = new Int32Array(NR * NC).fill(-1), done = new Uint8Array(NR * NC);
    dist[s] = 0;
    const heap = [[0, s]];
    const push = x => { heap.push(x); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (done[u]) continue; done[u] = 1;
      if (u === g) break;
      for (const [v, e] of adj[u]) {
        const nd = d + edgeHours(e, speed, kind);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); }
      }
    }
    const ids = [];
    for (let u = g; u !== -1; u = prev[u]) ids.push(u);
    ids.reverse();
    const pts = [from, ...ids.map(nodeLL), to];
    // км и средняя загрузка по пути
    let km = hav(from, nodeLL(s)) + hav(nodeLL(g), to), jamSum = 0, jamLen = 0, hours = dist[g];
    const segs = [];
    for (let k = 1; k < ids.length; k++) {
      const e = edges.get(ids[k - 1] < ids[k] ? ids[k - 1] + '-' + ids[k] : ids[k] + '-' + ids[k - 1]);
      km += e.len; jamSum += e.jam * e.len; jamLen += e.len;
      segs.push({ a: nodeLL(ids[k - 1]), b: nodeLL(ids[k]), jam: e.jam });
    }
    hours += (hav(from, nodeLL(s)) + hav(nodeLL(g), to)) / (speed * .6);
    const jam = jamLen ? jamSum / jamLen : 0;
    return { pts, km, min: Math.max(2, Math.round(hours * 60)), jam, score: Math.max(1, Math.min(10, Math.round(jam * 10))), segs };
  }
  // поездка: время на мото и на авто
  function trip(from, to, v) {
    const m = route(from, to, 'moto', v.speed);
    const car = route(from, to, 'car', 40);
    return { ...m, carMin: car.min };
  }
  const cityScore = () => {
    let s = 0, n = 0;
    for (const e of edges.values()) if (e.major) { s += e.jam; n++; }
    return Math.max(1, Math.min(10, Math.round(s / n * 12)));
  };

  // адрес по координатам: ближайшие крупные улицы
  function addressOf(p) {
    const fi = (p[0] - LAT0) / DLAT, fj = (p[1] - LNG0) / DLNG;
    const near = (obj, f) => Object.keys(obj).map(Number).sort((a, b) => Math.abs(a - f) - Math.abs(b - f))[0];
    const i = near(MAJOR_ROWS, fi), j = near(MAJOR_COLS, fj);
    if (p[0] < LAT0 - .004) return 'предгорья, ' + MAJOR_COLS[j];
    const di = Math.abs(i - fi), dj = Math.abs(j - fj);
    if (di < .35 && dj < .35) return `${MAJOR_ROWS[i]} / ${MAJOR_COLS[j].replace(/^(ул|пр)\. /, '')}`;
    if (di <= dj) return `${MAJOR_ROWS[i]}, ${10 + Math.round(Math.abs(fj) * 7) % 190}`;
    return `${MAJOR_COLS[j]}, ${10 + Math.round(Math.abs(fi) * 9) % 210}`;
  }

  // ---------- карта ----------
  const map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 11, maxZoom: 18,
    maxBounds: [[43.08, 76.72], [43.45, 77.18]] }).setView(DEFAULT_HOME, 14);
  const icon = (html, cls, size = [32, 32]) => L.divIcon({ html, className: cls, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });

  // палитры карты: светлая и тёмная
  const PAL = {
    light: { land: '#f1f2f6', hills: '#dfe8d3', contour: '#c9d6ba', park: '#cfeac6', water: '#a9d3f2', minor: '#ffffff', casing: '#dcdfe7', major: '#ffffff' },
    dark: { land: '#1b1726', hills: '#1d2419', contour: '#2a3424', park: '#1f3324', water: '#1d3a57', minor: '#2c2739', casing: '#141019', major: '#3a3450' },
  };
  const base = L.layerGroup().addTo(map);
  const labels = L.layerGroup().addTo(map);
  const S = 43.10, N = rowLat(NR - 1), W = colLng(0), E = colLng(NC - 1);
  function drawBase() {
    const P = PAL[document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light'];
    base.clearLayers(); labels.clearLayers();
    map.getContainer().style.background = P.land;
    L.rectangle([[LAT0, W], [N, E]], { stroke: false, fillColor: P.land, fillOpacity: 1, interactive: false }).addTo(base);
    L.polygon([[S, W - .05], [LAT0 + .001, W - .05], [LAT0 + .001, E + .05], [S, E + .05]], { stroke: false, fillColor: P.hills, fillOpacity: 1, interactive: false }).addTo(base);
    for (let k = 1; k <= 7; k++) {
      const o = k * .0075, pts = [];
      for (let x = W - .05; x <= E + .05; x += .02) pts.push([LAT0 - o + Math.sin(x * 90 + k) * .0025, x]);
      L.polyline(pts, { color: P.contour, weight: 1.5, interactive: false }).addTo(base);
    }
    L.polyline([[LAT0, colLng(34)], [43.185, 77.035], [43.170, 77.050], [43.1575, 77.059]], { color: P.major, weight: 5, interactive: false, lineCap: 'round' }).addTo(base);
    [
      [[43.2655, 76.958], [43.2655, 76.975], [43.2585, 76.975], [43.2585, 76.958]],
      [[43.2595, 76.946], [43.2595, 76.955], [43.2545, 76.955], [43.2545, 76.946]],
      [[43.2265, 76.900], [43.2265, 76.920], [43.2195, 76.920], [43.2195, 76.900]],
      [[43.2335, 76.968], [43.236, 76.985], [43.226, 76.988], [43.224, 76.972]],
      [[43.300, 76.880], [43.300, 76.900], [43.290, 76.900], [43.290, 76.880]],
    ].forEach(p => L.polygon(p, { stroke: false, fillColor: P.park, fillOpacity: 1, interactive: false }).addTo(base));
    const river = pts => L.polyline(pts, { color: P.water, weight: 5, interactive: false, lineCap: 'round' }).addTo(base);
    river([[43.18, 76.903], [43.21, 76.906], [43.235, 76.902], [43.26, 76.905], [43.30, 76.902], [43.37, 76.91]]);
    river([[43.18, 76.950], [43.22, 76.953], [43.245, 76.958], [43.27, 76.962], [43.32, 76.98], [43.37, 76.99]]);
    for (let i = 0; i < NR; i++) if (!(i in MAJOR_ROWS)) L.polyline([[rowLat(i), W], [rowLat(i), E]], { color: P.minor, weight: 3, interactive: false }).addTo(base);
    for (let j = 0; j < NC; j++) if (!(j in MAJOR_COLS)) L.polyline([[LAT0, colLng(j)], [N, colLng(j)]], { color: P.minor, weight: 3, interactive: false }).addTo(base);
    const majorLine = (pts, name, at) => {
      L.polyline(pts, { color: P.casing, weight: 11, interactive: false, lineCap: 'round' }).addTo(base);
      L.polyline(pts, { color: P.major, weight: 8, interactive: false, lineCap: 'round' }).addTo(base);
      L.marker(at, { icon: L.divIcon({ html: name, className: 'st-label', iconSize: [150, 14] }), interactive: false }).addTo(labels);
    };
    Object.entries(MAJOR_ROWS).forEach(([i, n]) => majorLine([[rowLat(+i), W], [rowLat(+i), E]], n, [rowLat(+i) + .0007, colLng(13.5 + (+i % 3) * 4)]));
    Object.entries(MAJOR_COLS).forEach(([j, n]) => majorLine([[LAT0, colLng(+j)], [N, colLng(+j)]], n, [rowLat(14 + (+j % 4) * 2), colLng(+j)]));
  }
  drawBase();
  try { new MutationObserver(drawBase).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); } catch {}
  const syncLabels = () => map.getContainer().classList.toggle('zoom-far', map.getZoom() < 14);
  map.on('zoomend', syncLabels); syncLabels();

  // слой пробок
  const jamColor = j => (j < .33 ? '#2fbf71' : j < .62 ? '#f5b70a' : '#ef4444');
  const traffic = L.layerGroup();
  function drawTraffic() {
    traffic.clearLayers();
    for (const e of edges.values()) {
      if (!e.major && e.jam < .55) continue;
      L.polyline([nodeLL(e.a), nodeLL(e.b)], { color: jamColor(e.jam), weight: e.major ? 4 : 2, opacity: e.major ? .9 : .7, interactive: false, lineCap: 'butt' }).addTo(traffic);
    }
  }
  let trafficOn = store.get('traffic', true);
  function setTraffic(on) {
    trafficOn = on; store.set('traffic', on);
    if (on && !(typeof REAL !== 'undefined' && REAL.on)) { drawTraffic(); traffic.addTo(map); } else map.removeLayer(traffic);
    $('#trafficBtn').classList.toggle('on', on);
    paintScore();
  }
  function paintScore() {
    const s = cityScore(), b = $('#trafficBtn b');
    b.textContent = s; b.className = s < 4 ? 'g' : s < 7 ? 'y' : 'r';
  }
  setTimeout(() => setTraffic(trafficOn));
  $('#trafficBtn').onclick = () => { setTraffic(!trafficOn); toast(trafficOn ? `🚦 Пробки: ${cityScore()} баллов` : 'Пробки скрыты'); };
  setInterval(() => { updateJams(); if (trafficOn && !REAL.on) drawTraffic(); paintScore(); }, 300000);

  // маршрут на карте: цветной по пробкам
  function drawRoute(layer, r, { color = '#9333ea', dashed = false } = {}) {
    const g = L.layerGroup().addTo(layer);
    L.polyline(r.pts, { color: '#3b0764', weight: dashed ? 6 : 10, opacity: dashed ? .2 : .35, lineJoin: 'round', interactive: false }).addTo(g);
    L.polyline(r.pts, { color, weight: dashed ? 4 : 6, opacity: .95, dashArray: dashed ? '2 9' : null, lineJoin: 'round', lineCap: 'round', interactive: false }).addTo(g);
    return g;
  }

  function animate(marker, pts, ms, done, onStep) {
    const t0 = performance.now();
    let stop = false;
    // равномерно по длине
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + hav(pts[k - 1], pts[k]));
    const total = cum[cum.length - 1] || 1;
    const step = now => {
      if (stop) return;
      const t = Math.min(1, (now - t0) / ms), want = t * total;
      let k = 1; while (k < cum.length - 1 && cum[k] < want) k++;
      const a = pts[k - 1], b = pts[k] || a, seg = (cum[k] - cum[k - 1]) || 1, f = Math.min(1, (want - cum[k - 1]) / seg);
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      marker.setLatLng(p); onStep && onStep(p, t);
      if (t < 1) requestAnimationFrame(step); else done && done();
    };
    requestAnimationFrame(step);
    return () => { stop = true; };
  }

  const timers = () => {
    let list = [];
    return {
      later(fn, ms) { const t = setTimeout(fn, ms); list.push(t); return t; },
      every(fn, ms) { const t = setInterval(fn, ms); list.push(t); return t; },
      clear() { list.forEach(t => { clearTimeout(t); clearInterval(t); }); list = []; },
    };
  };

  // ---------- выбор точки центральным пином ----------
  // видимая часть карты над шторкой
  const visibleCenterY = () => {
    const sheet = [...document.querySelectorAll('.sheet')].find(s => s.offsetParent);
    const h = map.getContainer().clientHeight, sh = sheet ? sheet.offsetHeight : 0;
    return Math.max(80, (h - sh) / 2 + 30);
  };
  function centerOn(p, zoom) {
    const z = zoom || map.getZoom(), size = map.getSize();
    const pt = map.project(p, z).add([0, size.y / 2 - visibleCenterY()]);
    map.setView(map.unproject(pt, z), z, { animate: true });
  }
  const pickedLatLng = () => {
    const ll = map.containerPointToLatLng([map.getSize().x / 2, visibleCenterY()]);
    return [ll.lat, ll.lng];
  };
  function startPicker(kind, onMove) {
    const pin = $('#centerPin');
    pin.className = 'center-pin ' + kind;
    pin.hidden = false;
    const place = () => { pin.style.top = visibleCenterY() + 'px'; };
    place();
    const moving = () => pin.classList.add('lift');
    const moved = () => { pin.classList.remove('lift'); onMove && onMove(pickedLatLng()); };
    map.on('movestart', moving); map.on('moveend', moved);
    setTimeout(() => { place(); moved(); }, 50);
    return () => { pin.hidden = true; map.off('movestart', moving); map.off('moveend', moved); };
  }

  // ---------- геолокация: точный GPS ----------
  const GEO_OPTS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 };
  const fix = p => ({ ll: [p.coords.latitude, p.coords.longitude], acc: Math.round(p.coords.accuracy || 0), at: p.timestamp });
  function locate() {
    return new Promise(res => {
      try {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(p => res(fix(p).ll), () => res(null), GEO_OPTS);
      } catch { res(null); }
    });
  }
  // следить за GPS, пока страница открыта; onFix({ll, acc}), onFail(причина)
  function watch(onFix, onFail) {
    try {
      if (!navigator.geolocation) { onFail && onFail('unsupported'); return () => {}; }
      const id = navigator.geolocation.watchPosition(p => onFix(fix(p)), e => onFail && onFail(e && e.code === 1 ? 'denied' : 'unavailable'), GEO_OPTS);
      return () => { try { navigator.geolocation.clearWatch(id); } catch {} };
    } catch { onFail && onFail('unsupported'); return () => {}; }
  }
  const inCity = p => p[0] > 43.15 && p[0] < 43.40 && p[1] > 76.78 && p[1] < 77.12;

  // ---------- настоящая карта, маршруты и адреса (на своём хостинге) ----------
  // Включается сам, если браузеру доступны тайлы OpenStreetMap/CARTO (на claude.ai они закрыты).
  const REAL = { on: false };
  const realFns = new Set();
  let tiles = null;
  const tileUrl = () => document.documentElement.classList.contains('theme-dark')
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  function probeTiles() {
    return new Promise(res => {
      if (!/^https?:$/.test(location.protocol)) return res(false);
      const img = new Image(), t = setTimeout(() => res(false), 5000);
      img.onload = () => { clearTimeout(t); res(true); };
      img.onerror = () => { clearTimeout(t); res(false); };
      img.src = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/0/0/0.png';
    });
  }
  function enableReal() {
    REAL.on = true;
    map.removeLayer(base); map.removeLayer(labels); map.removeLayer(traffic);
    map.setMaxBounds(null); map.setMinZoom(3);
    tiles = L.tileLayer(tileUrl(), { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO · маршруты OSRM' }).addTo(map);
    tiles.bringToBack();
    L.control.attribution({ prefix: false, position: 'topright' }).addTo(map).addAttribution('© OpenStreetMap · © CARTO · OSRM');
    try { new MutationObserver(() => tiles.setUrl(tileUrl())).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); } catch {}
    document.documentElement.classList.add('real-map');
    realFns.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  }
  probeTiles().then(ok => ok && enableReal());

  const fetchJSON = async (url, ms = 7000) => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); }
  };
  // маршрут по настоящим дорогам (OSRM)
  const routeCache = new Map();
  async function osrm(from, to) {
    const key = [from, to].map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(';');
    if (routeCache.has(key)) return routeCache.get(key);
    const pr = fetchJSON(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`).then(j => {
      const r = j && j.routes && j.routes[0];
      if (!r) { routeCache.delete(key); return null; }
      return { pts: r.geometry.coordinates.map(c => [c[1], c[0]]), km: r.distance / 1000, carFree: r.duration / 60 };
    });
    routeCache.set(key, pr);
    return pr;
  }
  // оценка пробок по пути: настоящих данных о пробках нет, берём модель по часу пик
  const jamAlong = (from, to) => route(from, to, 'car', 40).jam;
  async function routeAsync(from, to, kind = 'moto', speed = 42) {
    if (!REAL.on) return route(from, to, kind, speed);
    const r = await osrm(from, to);
    if (!r) return route(from, to, kind, speed);
    const jam = jamAlong(from, to);
    const min = kind === 'car' ? r.carFree * (1 + jam * 1.8) : r.km / speed * 60 * 1.25 * (1 + jam * .3);
    return { pts: [from, ...r.pts, to], km: r.km, min: Math.max(1, Math.round(min)), jam, score: Math.max(1, Math.min(10, Math.round(jam * 10))), real: true };
  }
  async function tripAsync(from, to, v) {
    if (!REAL.on) return trip(from, to, v);
    const m = await routeAsync(from, to, 'moto', v.speed);
    if (!m.real) return trip(from, to, v);
    const r = await osrm(from, to);
    return { ...m, carMin: Math.max(1, Math.round(r.carFree * (1 + m.jam * 1.8))) };
  }

  // адреса (Nominatim): не чаще 1 запроса в секунду, с кэшем
  const addrCache = new Map(), addrWait = new Map();
  const akey = p => p[0].toFixed(4) + ',' + p[1].toFixed(4);
  let addrBusy = false; const addrQueue = [];
  function pumpAddr() {
    if (addrBusy || !addrQueue.length) return;
    addrBusy = true;
    const [k, p] = addrQueue.pop(); addrQueue.length = Math.min(addrQueue.length, 2);
    fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p[0]}&lon=${p[1]}&zoom=18&addressdetails=1&accept-language=ru`).then(j => {
      const a = j && j.address;
      const road = a && (a.road || a.pedestrian || a.footway || a.neighbourhood || a.suburb);
      const name = j && (j.name && j.name !== road ? j.name : '');
      const txt = road ? [road, a.house_number].filter(Boolean).join(', ') + (name ? ` (${name})` : '') : (j && j.display_name ? j.display_name.split(',').slice(0, 2).join(',') : null);
      addrCache.set(k, txt || null);
      (addrWait.get(k) || []).forEach(f => f(txt || null)); addrWait.delete(k);
    }).finally(() => setTimeout(() => { addrBusy = false; pumpAddr(); }, 1100));
  }
  function reverse(p) {
    if (!REAL.on) return Promise.resolve(addressOf(p));
    const k = akey(p);
    if (addrCache.has(k)) return Promise.resolve(addrCache.get(k) || addressOf(p));
    return new Promise(res => {
      if (!addrWait.has(k)) { addrWait.set(k, []); addrQueue.push([k, p]); pumpAddr(); }
      addrWait.get(k).push(txt => res(txt || `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`));
    });
  }
  // синхронно: настоящий адрес из кэша, если есть
  const addressSync = p => {
    if (!REAL.on) return addressOf(p);
    const c = addrCache.get(akey(p));
    if (c) return c;
    reverse(p);
    return `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`;
  };
  async function search(q, near) {
    if (!REAL.on || q.trim().length < 3) return [];
    const c = near || DEFAULT_HOME, d = .25;
    const j = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&accept-language=ru&limit=6&addressdetails=1&viewbox=${c[1] - d},${c[0] + d},${c[1] + d},${c[0] - d}&bounded=1`);
    return (j || []).map(x => {
      const a = x.address || {};
      const n = x.name || [a.road, a.house_number].filter(Boolean).join(', ') || x.display_name.split(',')[0];
      return { n, a: x.display_name.split(',').slice(1, 3).join(',').trim(), ic: '📍', c: [+x.lat, +x.lon] };
    });
  }

  return { $, $$, DEFAULT_HOME, PLACES, VEHICLES, hav, fmt, round50, rnd, pick, vehBy, priceFor, store, toast, esc,
    map, icon, animate, timers, route, routeAsync, trip, tripAsync, setTraffic: on => setTraffic(on), drawRoute,
    addressOf: addressSync, reverse, search, cityScore, centerOn, startPicker, pickedLatLng, locate, watch, inCity,
    real: REAL, onReal: f => { realFns.add(f); if (REAL.on) f(); } };
})();
