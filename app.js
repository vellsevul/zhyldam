// Zhyldam — мото-такси (демо-прототип, всё работает на клиенте)
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  // ---------- данные ----------
  const HOME = [43.2389, 76.8897]; // Алматы
  const PLACES = [
    { n: 'MEGA Alma-Ata', a: 'ул. Розыбакиева, 247', ic: '🛍️', c: [43.2027, 76.8925] },
    { n: 'Dostyk Plaza', a: 'мкр. Самал-2, 111', ic: '🏬', c: [43.2335, 76.9568] },
    { n: 'Кок-Тобе', a: 'ул. Омарова', ic: '🎡', c: [43.2316, 76.9762] },
    { n: 'Аэропорт Алматы', a: 'ул. Майлина, 2', ic: '✈️', c: [43.3521, 77.0405] },
    { n: 'Esentai Mall', a: 'пр. Аль-Фараби, 77/8', ic: '💎', c: [43.2187, 76.9277] },
    { n: 'Медеу', a: 'ущелье Медеу', ic: '⛸️', c: [43.1575, 77.0590] },
    { n: 'Зелёный базар', a: 'ул. Жибек Жолы, 53', ic: '🍎', c: [43.2626, 76.9547] },
    { n: 'КазНУ им. аль-Фараби', a: 'пр. аль-Фараби, 71', ic: '🎓', c: [43.2245, 76.9180] },
  ];
  const VEHICLES = [
    { id: 'moped', em: '🛵', n: 'Мопед', d: 'Скутер до 125 см³ · по городу', base: 300, km: 90, speed: 32, badge: '' },
    { id: 'moto', em: '🏍️', n: 'Мото', d: 'Мотоцикл · быстрее мопеда', base: 450, km: 120, speed: 40, badge: 'ХИТ' },
    { id: 'turbo', em: '🏁', n: 'Turbo', d: 'Спортбайк · для тех, кто любит скорость', base: 800, km: 180, speed: 48, badge: 'ТОП' },
  ];
  const DRIVERS = [
    ['Ерлан', 'Honda PCX', '🛵'], ['Айдос', 'Yamaha NMAX', '🛵'], ['Нурлан', 'Honda CB500F', '🏍️'],
    ['Тимур', 'Kawasaki Z650', '🏍️'], ['Данияр', 'Yamaha R6', '🏁'], ['Асель', 'Vespa GTS', '🛵'],
    ['Бауыржан', 'BMW S1000RR', '🏁'], ['Арман', 'Suzuki GSX-S750', '🏍️'], ['Мадина', 'Honda Forza', '🛵'],
  ];

  // ---------- состояние ----------
  const st = { mode: 'fast', veh: 'moto', dest: null, km: 0, offer: 0, pay: 'cash', timers: [], drv: null };

  // ---------- карта ----------
  const map = L.map('map', { zoomControl: false, attributionControl: true }).setView(HOME, 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap, © CARTO'
  }).addTo(map);

  const icon = (html, cls, size = [32, 32]) => L.divIcon({ html, className: cls, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
  const meMarker = L.marker(HOME, { icon: icon('', 'mk-me', [20, 20]) }).addTo(map);
  let destMarker = null, routeLine = null, drvMarker = null;

  // райдеры вокруг, которые катаются
  const ambient = Array.from({ length: 9 }, (_, i) => {
    const em = ['🛵', '🏍️', '🛵', '🏁', '🏍️', '🛵', '🏍️', '🛵', '🏍️'][i];
    const p = [HOME[0] + (Math.random() - .5) * .03, HOME[1] + (Math.random() - .5) * .04];
    const m = L.marker(p, { icon: icon(em, 'mk', [30, 30]), interactive: false }).addTo(map);
    return { m, dx: (Math.random() - .5) * .0004, dy: (Math.random() - .5) * .0004 };
  });
  setInterval(() => ambient.forEach(a => {
    const p = a.m.getLatLng();
    if (Math.abs(p.lat - HOME[0]) > .02) a.dx *= -1;
    if (Math.abs(p.lng - HOME[1]) > .025) a.dy *= -1;
    if (Math.random() < .05) { a.dx = (Math.random() - .5) * .0004; a.dy = (Math.random() - .5) * .0004; }
    a.m.setLatLng([p.lat + a.dx, p.lng + a.dy]);
  }), 700);

  map.on('click', e => {
    if (!$('[data-step=home]').classList.contains('active')) return;
    setDest({ n: 'Точка на карте', a: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`, c: [e.latlng.lat, e.latlng.lng] });
  });
  $('#locateBtn').onclick = () => map.flyTo(HOME, 15);

  // ---------- утилиты ----------
  const hav = (a, b) => {
    const R = 6371, r = x => x * Math.PI / 180;
    const dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
  const round50 = n => Math.round(n / 50) * 50;
  const vehBy = id => VEHICLES.find(v => v.id === id);
  const price = v => round50(v.base + v.km * st.km);
  const mins = v => Math.max(3, Math.round(st.km / v.speed * 60));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); st.timers.push(t); return t; };
  const clearTimers = () => { st.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); st.timers = []; };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2000); };

  // изогнутая линия маршрута
  const curve = (a, b, n = 40) => {
    const mid = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * .15, (a[1] + b[1]) / 2 - (b[0] - a[0]) * .15];
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n, u = 1 - t;
      return [u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1]];
    });
  };

  // ---------- навигация по шагам ----------
  function go(step) {
    $$('.step').forEach(s => s.classList.toggle('active', s.dataset.step === step));
    $('#sheet').scrollTop = 0;
  }
  $$('[data-back]').forEach(b => b.onclick = () => { resetRoute(); go(b.dataset.back); });

  // ---------- HOME ----------
  function renderSuggest(q = '') {
    const list = PLACES.filter(p => (p.n + p.a).toLowerCase().includes(q.toLowerCase()));
    $('#suggest').innerHTML = list.map((p) =>
      `<button class="sg" data-i="${PLACES.indexOf(p)}"><span class="ic">${p.ic}</span><span><b>${p.n}</b><small>${p.a}</small></span></button>`
    ).join('') || '<p class="muted center">Ничего не нашли 🤷</p>';
    $$('.sg').forEach(b => b.onclick = () => setDest(PLACES[b.dataset.i]));
  }
  $('#toInput').oninput = e => renderSuggest(e.target.value);
  renderSuggest();

  function setDest(p) {
    st.dest = p;
    st.km = hav(HOME, p.c) * 1.3; // дорога длиннее прямой
    resetRoute();
    destMarker = L.marker(p.c, { icon: icon('', 'mk-dest', [18, 18]) }).addTo(map);
    routeLine = L.polyline(curve(HOME, p.c), { color: '#7c3aed', weight: 6, opacity: .9 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { paddingTopLeft: [40, 90], paddingBottomRight: [40, window.innerHeight * .6] });
    $('#tripTo').textContent = p.n;
    $('#tripMeta').textContent = `${st.km.toFixed(1)} км · мото обгоняет пробки 🚦`;
    renderVehicles();
    go('choose');
  }
  function resetRoute() {
    [destMarker, routeLine, drvMarker].forEach(m => m && map.removeLayer(m));
    destMarker = routeLine = drvMarker = null;
  }

  // ---------- CHOOSE ----------
  function renderVehicles() {
    $('#vehicles').innerHTML = VEHICLES.map(v => {
      const carMin = Math.round(mins(v) * 2.1);
      return `<button class="veh ${v.id === st.veh ? 'sel' : ''}" data-id="${v.id}">
        <span class="em">${v.em}</span>
        <span class="nm"><b>${v.n}${v.badge ? `<span class="badge">${v.badge}</span>` : ''}</b><small>${v.d}</small></span>
        <span class="pr"><b>${st.mode === 'bargain' ? '~' : ''}${fmt(price(v))}</b><small>${mins(v)} мин · авто ~${carMin}</small></span>
      </button>`;
    }).join('');
    $$('.veh').forEach(b => b.onclick = () => { st.veh = b.dataset.id; renderVehicles(); syncOffer(true); });
    updateCta();
  }

  $$('#modeSwitch button').forEach(b => b.onclick = () => {
    st.mode = b.dataset.mode;
    $('#modeSwitch').dataset.mode = st.mode;
    $$('#modeSwitch button').forEach(x => x.classList.toggle('on', x === b));
    $('#bargainBox').classList.toggle('on', st.mode === 'bargain');
    renderVehicles();
    syncOffer(true);
  });

  function syncOffer(reset) {
    const rec = price(vehBy(st.veh));
    if (reset) st.offer = round50(rec * .9);
    $('#offerInput').value = st.offer;
    $('#recPrice').textContent = `рекомендуем ${fmt(rec)}`;
    const ratio = st.offer / rec;
    $('#bbWarn').textContent = ratio < .7 ? '😬 Слишком мало — райдеры вряд ли согласятся'
      : ratio < .9 ? '🤔 Низковато, но можно попробовать'
      : ratio > 1.15 ? '🔥 Щедро! Райдеры прилетят мгновенно' : '👌 Хорошая цена';
    updateCta();
  }
  $$('.pm').forEach(b => b.onclick = () => { st.offer = Math.max(200, st.offer + +b.dataset.d); syncOffer(); });
  $('#offerInput').oninput = e => { st.offer = Math.max(0, +e.target.value || 0); syncOffer(); $('#offerInput').value = e.target.value; };

  function updateCta() {
    const v = vehBy(st.veh);
    $('#orderBtn').textContent = st.mode === 'fast'
      ? `⚡ Заказать ${v.n} · ${fmt(price(v))}`
      : `🤝 Предложить ${fmt(st.offer)}`;
    $('#orderBtn').disabled = st.mode === 'bargain' && st.offer < 200;
  }

  const PAYS = [['cash', '💵 Наличные'], ['kaspi', '🔴 Kaspi'], ['card', '💳 Карта']];
  $('#payBtn').onclick = () => {
    const i = (PAYS.findIndex(p => p[0] === st.pay) + 1) % PAYS.length;
    st.pay = PAYS[i][0]; $('#payBtn').textContent = PAYS[i][1] + ' ▾';
  };

  $('#orderBtn').onclick = () => st.mode === 'fast' ? startFast() : startBargain();

  // ---------- FAST ----------
  function startFast() {
    go('search');
    $('#searchTitle').textContent = 'Ищем ближайшего райдера…';
    $('#searchSub').textContent = 'Фиксированная цена — первый свободный уже едет';
    let p = 0;
    const iv = setInterval(() => { p = Math.min(100, p + rnd(4, 12)); $('#searchBar').style.width = p + '%'; }, 200);
    st.timers.push(iv);
    later(() => {
      clearInterval(iv);
      const v = vehBy(st.veh);
      assignDriver(makeDriver(v), price(v));
    }, rnd(2200, 3500));
  }
  $('#cancelSearch').onclick = () => { clearTimers(); $('#searchBar').style.width = 0; go('choose'); toast('Поиск отменён'); };

  function makeDriver(v) {
    st.used = st.used || [];
    let pool = DRIVERS.filter(d => d[2] === v.em && !st.used.includes(d[0]));
    if (!pool.length) pool = DRIVERS.filter(d => !st.used.includes(d[0]));
    if (!pool.length) { st.used = []; pool = DRIVERS; }
    const d = pick(pool);
    st.used.push(d[0]);
    return {
      name: d[0], bike: d[1], em: v.em,
      rating: (4.6 + Math.random() * .39).toFixed(2),
      trips: Math.floor(rnd(80, 3200)),
      eta: Math.floor(rnd(1, 6)),
      plate: `${Math.floor(rnd(100, 999))} ${pick(['AAA', 'KZB', 'MTO', 'ZHL', 'BRM'])} 02`,
    };
  }

  // ---------- BARGAIN ----------
  function startBargain() {
    go('offers');
    st.used = [];
    $('#offers').innerHTML = '<p class="muted center" id="offersEmpty">Ждём ответы райдеров… 📡</p>';
    $('#offersMeta').textContent = `Ты предложил ${fmt(st.offer)} · ${vehBy(st.veh).n}`;
    scheduleOffers(3);
  }
  function scheduleOffers(n) {
    for (let i = 0; i < n; i++) later(addOffer, rnd(1200, 2500) + i * rnd(1300, 2600));
  }
  function addOffer() {
    const v = vehBy(st.veh), rec = price(v);
    const ratio = st.offer / rec;
    // чем ниже цена, тем чаще контр-предложения
    let pr = st.offer;
    if (Math.random() > Math.min(.85, ratio - .15)) pr = round50(Math.max(st.offer + 50, rec * rnd(.95, 1.25)));
    const d = makeDriver(v);
    $('#offersEmpty')?.remove();
    const el = document.createElement('div');
    el.className = 'offer';
    const diff = pr - st.offer;
    el.innerHTML = `
      <div class="avatar">${d.name[0]}</div>
      <div class="info"><b>${d.name}</b><small>★ ${d.rating} · ${d.eta} мин до тебя</small><small>${d.em} ${d.bike}</small></div>
      <div class="price">${fmt(pr)}<small class="${diff > 0 ? 'up' : 'eq'}">${diff > 0 ? '+' + fmt(diff) : 'твоя цена'}</small></div>
      <div class="btns"><button class="ok">Принять</button><button class="no">✕</button></div>
      <i class="timer"></i>`;
    el.querySelector('.ok').onclick = () => { clearTimers(); assignDriver(d, pr); };
    const kill = () => { el.style.transition = '.25s'; el.style.opacity = 0; el.style.transform = 'translateX(-40px)'; setTimeout(() => el.remove(), 250); };
    el.querySelector('.no').onclick = kill;
    later(kill, 15000);
    $('#offers').prepend(el);
    if (navigator.vibrate) navigator.vibrate(30);
  }
  $('#raiseBtn').onclick = () => {
    st.offer += 100;
    $('#offersMeta').textContent = `Ты предложил ${fmt(st.offer)} · ${vehBy(st.veh).n}`;
    toast(`Цена поднята до ${fmt(st.offer)} 🔥`);
    scheduleOffers(2);
  };
  $('#cancelOffers').onclick = () => { clearTimers(); go('choose'); toast('Заказ отменён'); };

  // ---------- DRIVER ----------
  function assignDriver(d, pr) {
    st.drv = { ...d, price: pr };
    $('#drvAvatar').textContent = d.name[0];
    $('#drvName').textContent = d.name;
    $('#drvRating').textContent = `★ ${d.rating} · ${d.trips.toLocaleString('ru-RU')} поездок`;
    $('#drvBike').textContent = `${d.bike} · ${d.em}`;
    $('#drvPlate').textContent = d.plate;
    $('#drvPrice').textContent = fmt(pr);
    go('driver');
    toast(`${d.name} принял заказ!`);

    // анимация: райдер едет к пассажиру, потом везёт к точке
    const start = [HOME[0] + rnd(-.012, .012), HOME[1] + rnd(-.015, .015)];
    drvMarker = L.marker(start, { icon: icon(d.em, 'mk-drv', [36, 36]), zIndexOffset: 1000 }).addTo(map);
    let eta = d.eta;
    $('#etaMin').textContent = eta;
    $('#etaBanner').innerHTML = `Райдер будет через <b id="etaMin">${eta}</b> мин · шлем 🪖 ${$('#helmetChk').checked ? 'везёт' : 'не нужен'}`;
    animate(drvMarker, curve(start, HOME, 30), 5000, () => {
      $('#etaBanner').innerHTML = '📍 Райдер на месте! Надевай шлем и садись';
      later(() => {
        $('#etaBanner').innerHTML = `🏍️ В пути к <b>${st.dest.n}</b> — держись крепче!`;
        map.removeLayer(meMarker);
        animate(drvMarker, routeLine.getLatLngs().map(p => [p.lat, p.lng]), 8000, finish);
      }, 2000);
    });
  }
  function animate(marker, pts, ms, done) {
    const t0 = performance.now();
    let raf;
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      const f = t * (pts.length - 1), i = Math.floor(f), k = f - i;
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      marker.setLatLng([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      if (t < 1) { raf = requestAnimationFrame(step); st.raf = raf; } else done && done();
    };
    raf = requestAnimationFrame(step); st.raf = raf;
  }
  $('#cancelRide').onclick = () => {
    if (!confirm('Отменить поездку?')) return;
    cancelAnimationFrame(st.raf); clearTimers();
    resetRoute(); meMarker.addTo(map); map.flyTo(HOME, 14);
    go('home'); toast('Поездка отменена');
  };

  // ---------- DONE ----------
  function finish() {
    const v = vehBy(st.veh);
    $('#doneSub').textContent = `${st.km.toFixed(1)} км за ${mins(v)} мин · ${fmt(st.drv.price)} · на авто было бы ~${Math.round(mins(v) * 2.1)} мин`;
    $$('#stars b').forEach(s => s.classList.add('on'));
    $$('.tips button').forEach(b => b.classList.remove('on'));
    go('done');
  }
  $$('#stars b').forEach((s, i) => s.onclick = () => $$('#stars b').forEach((x, j) => x.classList.toggle('on', j <= i)));
  $$('.tips button').forEach(b => b.onclick = () => { $$('.tips button').forEach(x => x.classList.toggle('on', x === b && !x.classList.contains('on'))); });
  $('#doneBtn').onclick = () => {
    resetRoute(); meMarker.addTo(map); map.flyTo(HOME, 14);
    $('#toInput').value = ''; renderSuggest();
    go('home'); toast('Спасибо, что с Zhyldam! ⚡');
  };

  // ---------- меню ----------
  const toggleDrawer = on => { $('#drawer').classList.toggle('open', on); $('#scrim').classList.toggle('on', on); };
  $('#menuBtn').onclick = () => toggleDrawer(true);
  $('#scrim').onclick = () => toggleDrawer(false);
  $$('.drawer a').forEach(a => a.onclick = () => { toggleDrawer(false); toast('Скоро будет 😉'); });

  go('home');
})();
