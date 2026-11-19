// Общие утилиты + своя векторная карта Алматы (без внешних тайлов)
window.Z = (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const HOME = [43.2389, 76.9097];
  const PLACES = [
    { n: 'MEGA Alma-Ata', a: 'ул. Розыбакиева, 247', ic: '🛍️', c: [43.2027, 76.8925] },
    { n: 'Dostyk Plaza', a: 'мкр. Самал-2, 111', ic: '🏬', c: [43.2335, 76.9568] },
    { n: 'Кок-Тобе', a: 'ул. Омарова', ic: '🎡', c: [43.2316, 76.9762] },
    { n: 'Аэропорт Алматы', a: 'ул. Майлина, 2', ic: '✈️', c: [43.3521, 77.0405] },
    { n: 'Esentai Mall', a: 'пр. Аль-Фараби, 77/8', ic: '💎', c: [43.2187, 76.9277] },
    { n: 'Медеу', a: 'ущелье Медеу', ic: '⛸️', c: [43.1575, 77.0590] },
    { n: 'Зелёный базар', a: 'ул. Жибек Жолы, 53', ic: '🍎', c: [43.2626, 76.9547] },
    { n: 'КазНУ им. аль-Фараби', a: 'пр. аль-Фараби, 71', ic: '🎓', c: [43.2245, 76.9180] },
    { n: 'Арбат', a: 'ул. Жибек Жолы', ic: '🎸', c: [43.2610, 76.9450] },
    { n: 'Центральный парк', a: 'ул. Гоголя, 1', ic: '🌳', c: [43.2620, 76.9660] },
  ];
  const VEHICLES = [
    { id: 'moped', em: '🛵', n: 'Мопед', d: 'Скутер до 125 см³ · по городу', base: 300, km: 90, speed: 32, badge: '' },
    { id: 'moto', em: '🏍️', n: 'Мото', d: 'Мотоцикл · быстрее мопеда', base: 450, km: 120, speed: 40, badge: 'ХИТ' },
    { id: 'turbo', em: '🏁', n: 'Turbo', d: 'Спортбайк · для тех, кто любит скорость', base: 800, km: 180, speed: 48, badge: 'ТОП' },
  ];

  const hav = (a, b) => {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/[ ,]/g, ' ') + ' ₸';
  const round50 = n => Math.round(n / 50) * 50;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const vehBy = id => VEHICLES.find(v => v.id === id);
  const priceFor = (v, km) => round50(v.base + v.km * km);
  const minsFor = (v, km) => Math.max(3, Math.round(km / v.speed * 60));
  const curve = (a, b, n = 40) => {
    const mid = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * .15, (a[1] + b[1]) / 2 - (b[0] - a[0]) * .15];
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n, u = 1 - t;
      return [u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1]];
    });
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('zh_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('zh_' + k, JSON.stringify(v)); } catch {} },
  };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200); };

  // ---------- карта ----------
  const map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: 11, maxZoom: 18,
    maxBounds: [[43.08, 76.75], [43.42, 77.15]] }).setView(HOME, 14);
  const icon = (html, cls, size = [32, 32]) => L.divIcon({ html, className: cls, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });

  // рисуем город
  const base = L.layerGroup().addTo(map);
  const S = 43.12, N = 43.40, W = 76.78, E = 77.12;
  // горы на юге
  L.polygon([[S, W], [43.195, W], [43.188, 76.86], [43.192, 76.93], [43.185, 76.99], [43.205, 77.03], [43.22, 77.08], [43.23, E], [S, E]],
    { stroke: false, fillColor: '#dfe8d3', fillOpacity: 1, interactive: false }).addTo(base);
  for (let i = 1; i <= 5; i++) {
    const o = i * .009;
    L.polyline([[43.195 - o, W], [43.188 - o, 76.86], [43.192 - o, 76.93], [43.185 - o, 76.99], [43.205 - o, 77.03], [43.22 - o, 77.08], [43.23 - o, E]],
      { color: '#c9d6ba', weight: 1.5, interactive: false }).addTo(base);
  }
  // парки
  [
    [[43.2655, 76.958], [43.2655, 76.975], [43.2585, 76.975], [43.2585, 76.958]],          // Центральный парк
    [[43.2605, 76.951], [43.2605, 76.9585], [43.2555, 76.9585], [43.2555, 76.951]],        // Панфиловцев
    [[43.2265, 76.905], [43.2265, 76.922], [43.2175, 76.922], [43.2175, 76.905]],          // Ботанический сад
    [[43.2385, 76.948], [43.2385, 76.955], [43.2335, 76.955], [43.2335, 76.948]],          // парк Первого Президента? (сквер)
    [[43.2335, 76.968], [43.236, 76.985], [43.226, 76.988], [43.224, 76.972]],             // Кок-Тобе склон
  ].forEach(p => L.polygon(p, { stroke: false, fillColor: '#cfeac6', fillOpacity: 1, interactive: false }).addTo(base));
  // реки
  const river = (pts) => L.polyline(pts, { color: '#a9d3f2', weight: 5, interactive: false, lineCap: 'round' }).addTo(base);
  river([[43.19, 76.903], [43.21, 76.905], [43.235, 76.902], [43.26, 76.905], [43.30, 76.902], [43.36, 76.91]]);
  river([[43.20, 76.948], [43.22, 76.952], [43.245, 76.957], [43.27, 76.962], [43.32, 76.98]]);
  // сетка улиц
  const minor = { color: '#ffffff', weight: 3, interactive: false };
  for (let la = 43.196; la < 43.37; la += .0055) L.polyline([[la, W], [la, E]], minor).addTo(base);
  for (let lo = 76.80; lo < 77.10; lo += .0075) L.polyline([[43.19, lo], [N, lo]], minor).addTo(base);
  // главные улицы
  const labels = L.layerGroup().addTo(map);
  const major = (pts, name, at) => {
    L.polyline(pts, { color: '#d9dce3', weight: 10, interactive: false, lineCap: 'round' }).addTo(base);
    L.polyline(pts, { color: '#ffffff', weight: 7, interactive: false, lineCap: 'round' }).addTo(base);
    if (name) L.marker(at || pts[Math.floor(pts.length / 2)], { icon: L.divIcon({ html: name, className: 'st-label', iconSize: [140, 14] }), interactive: false }).addTo(labels);
  };
  major([[43.262, W], [43.262, E]], 'пр. Райымбека', [43.262, 76.925]);
  major([[43.252, W], [43.252, 77.02]], 'ул. Толе би', [43.252, 76.89]);
  major([[43.2405, W], [43.2405, 77.0]], 'пр. Абая', [43.2405, 76.925]);
  major([[43.232, 76.82], [43.232, 76.96]], 'ул. Сатпаева', [43.232, 76.875]);
  major([[43.198, 76.82], [43.203, 76.87], [43.212, 76.905], [43.218, 76.93], [43.219, 76.96], [43.225, 76.99], [43.235, 77.03]], 'пр. аль-Фараби', [43.212, 76.89]);
  major([[43.19, 76.8925], [N, 76.8925]], 'ул. Розыбакиева', [43.282, 76.8925]);
  major([[43.19, 76.912], [N, 76.912]], 'ул. Байзакова', [43.285, 76.912]);
  major([[43.205, 76.9455], [N, 76.9455]], 'пр. Назарбаева', [43.279, 76.9455]);
  major([[43.195, 76.957], [43.27, 76.957]], 'пр. Достык', [43.226, 76.9575]);
  major([[43.225, 76.862], [N, 76.862]], 'ул. Саина', [43.28, 76.862]);
  major([[43.262, 76.985], [43.30, 77.0], [43.352, 77.04]], 'ул. Майлина', [43.31, 77.005]);
  major([[43.2405, 77.0], [43.20, 77.06], [43.158, 77.059]], 'Медеу', [43.19, 77.06]);
  const syncLabels = () => map.getContainer().classList.toggle('zoom-far', map.getZoom() < 14);
  map.on('zoomend', syncLabels); syncLabels();

  function animate(marker, pts, ms, done, onStep) {
    const t0 = performance.now();
    let stop = false;
    const step = now => {
      if (stop) return;
      const t = Math.min(1, (now - t0) / ms);
      const f = t * (pts.length - 1), i = Math.floor(f), k = f - i;
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      const p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      marker.setLatLng(p); onStep && onStep(p, t);
      if (t < 1) requestAnimationFrame(step); else done && done();
    };
    requestAnimationFrame(step);
    return () => { stop = true; };
  }

  // таймеры, которые чистятся при смене режима/шага
  const timers = () => {
    let list = [];
    return {
      later(fn, ms) { const t = setTimeout(fn, ms); list.push(t); return t; },
      every(fn, ms) { const t = setInterval(fn, ms); list.push(t); return t; },
      clear() { list.forEach(t => { clearTimeout(t); clearInterval(t); }); list = []; },
    };
  };

  return { $, $$, HOME, PLACES, VEHICLES, hav, fmt, round50, rnd, pick, vehBy, priceFor, minsFor, curve, store, toast, map, icon, animate, timers };
})();
