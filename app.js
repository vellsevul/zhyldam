// Zhyldam: режим пассажира (райдеры симулируются в браузере)
window.Passenger = (() => {
  const { $, $$, HOME, PLACES, VEHICLES, hav, fmt, round50, rnd, pick, vehBy, priceFor, minsFor, curve, toast, map, icon, animate, timers } = Z;
  const T = timers();

  const DRIVERS = [
    ['Ерлан', 'Honda PCX', '🛵'], ['Айдос', 'Yamaha NMAX', '🛵'], ['Нурлан', 'Honda CB500F', '🏍️'],
    ['Тимур', 'Kawasaki Z650', '🏍️'], ['Данияр', 'Yamaha R6', '🏁'], ['Асель', 'Vespa GTS', '🛵'],
    ['Бауыржан', 'BMW S1000RR', '🏁'], ['Арман', 'Suzuki GSX-S750', '🏍️'], ['Мадина', 'Honda Forza', '🛵'],
    ['Ержан', 'Ducati Panigale V2', '🏁'], ['Сабина', 'Yamaha MT-07', '🏍️'],
  ];
  const st = { mode: 'fast', veh: 'moto', dest: null, km: 0, offer: 0, pay: 'cash', drv: null, used: [] };
  const price = v => priceFor(v, st.km);
  const mins = v => minsFor(v, st.km);

  const layer = L.layerGroup();
  const meMarker = L.marker(HOME, { icon: icon('', 'mk-me', [20, 20]) }).addTo(layer);
  let destMarker = null, routeLine = null, drvMarker = null, stopAnim = null;

  // райдеры вокруг
  const ambient = Array.from({ length: 10 }, (_, i) => {
    const em = ['🛵', '🏍️', '🛵', '🏁', '🏍️', '🛵', '🏍️', '🛵', '🏍️', '🏁'][i];
    const p = [HOME[0] + rnd(-.015, .015), HOME[1] + rnd(-.02, .02)];
    const m = L.marker(p, { icon: icon(em, 'mk', [30, 30]), interactive: false }).addTo(layer);
    return { m, dx: rnd(-.0002, .0002), dy: rnd(-.0002, .0002) };
  });
  setInterval(() => {
    if (!map.hasLayer(layer)) return;
    ambient.forEach(a => {
      const p = a.m.getLatLng();
      if (Math.abs(p.lat - HOME[0]) > .02) a.dx *= -1;
      if (Math.abs(p.lng - HOME[1]) > .025) a.dy *= -1;
      if (Math.random() < .05) { a.dx = rnd(-.0002, .0002); a.dy = rnd(-.0002, .0002); }
      a.m.setLatLng([p.lat + a.dx, p.lng + a.dy]);
    });
  }, 700);

  map.on('click', e => {
    if (!map.hasLayer(layer) || !$('[data-step=home]').classList.contains('active')) return;
    setDest({ n: 'Точка на карте', a: `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`, c: [e.latlng.lat, e.latlng.lng] });
  });

  function go(step) {
    $$('.step').forEach(s => s.classList.toggle('active', s.dataset.step === step));
    $('#sheet').scrollTop = 0;
  }
  $$('[data-back]').forEach(b => b.onclick = () => { resetRoute(); go(b.dataset.back); });

  // ---------- HOME ----------
  function renderSuggest(q = '') {
    const list = PLACES.filter(p => (p.n + p.a).toLowerCase().includes(q.toLowerCase()));
    $('#suggest').innerHTML = list.map(p =>
      `<button class="sg" data-i="${PLACES.indexOf(p)}"><span class="ic">${p.ic}</span><span><b>${p.n}</b><small>${p.a}</small></span></button>`
    ).join('') || '<p class="muted center">Ничего не нашли 🤷</p>';
    $$('.sg').forEach(b => b.onclick = () => setDest(PLACES[b.dataset.i]));
  }
  $('#toInput').oninput = e => renderSuggest(e.target.value);
  renderSuggest();

  function setDest(p) {
    st.dest = p;
    st.km = hav(HOME, p.c) * 1.3;
    resetRoute();
    destMarker = L.marker(p.c, { icon: icon('', 'mk-dest', [18, 18]) }).addTo(layer);
    routeLine = L.polyline(curve(HOME, p.c), { color: '#9333ea', weight: 6, opacity: .9 }).addTo(layer);
    map.fitBounds(routeLine.getBounds(), { paddingTopLeft: [40, 90], paddingBottomRight: [40, window.innerHeight * .6] });
    $('#tripTo').textContent = p.n;
    $('#tripMeta').textContent = `${st.km.toFixed(1)} км · мото обгоняет пробки 🚦`;
    renderVehicles(); syncOffer(true);
    go('choose');
  }
  function resetRoute() {
    stopAnim && stopAnim();
    [destMarker, routeLine, drvMarker].forEach(m => m && layer.removeLayer(m));
    destMarker = routeLine = drvMarker = null;
  }

  // ---------- CHOOSE ----------
  function renderVehicles() {
    $('#vehicles').innerHTML = VEHICLES.map(v => `<button class="veh ${v.id === st.veh ? 'sel' : ''}" data-id="${v.id}">
        <span class="em">${v.em}</span>
        <span class="nm"><b>${v.n}${v.badge ? `<span class="badge">${v.badge}</span>` : ''}</b><small>${v.d}</small></span>
        <span class="pr"><b>${st.mode === 'bargain' ? '~' : ''}${fmt(price(v))}</b><small>${mins(v)} мин · авто ~${Math.round(mins(v) * 2.1)}</small></span>
      </button>`).join('');
    $$('.veh').forEach(b => b.onclick = () => { st.veh = b.dataset.id; renderVehicles(); syncOffer(true); });
    updateCta();
  }
  $$('#modeSwitch button').forEach(b => b.onclick = () => {
    st.mode = b.dataset.mode;
    $('#modeSwitch').dataset.mode = st.mode;
    $$('#modeSwitch button').forEach(x => x.classList.toggle('on', x === b));
    $('#bargainBox').classList.toggle('on', st.mode === 'bargain');
    renderVehicles(); syncOffer(true);
  });
  function syncOffer(reset) {
    const rec = price(vehBy(st.veh));
    if (reset) st.offer = round50(rec * .9);
    $('#offerInput').value = st.offer;
    $('#recPrice').textContent = `рекомендуем ${fmt(rec)}`;
    const r = st.offer / rec;
    $('#bbWarn').textContent = r < .7 ? '😬 Слишком мало, райдеры вряд ли согласятся'
      : r < .9 ? '🤔 Низковато, но можно попробовать'
      : r > 1.15 ? '🔥 Щедро! Райдеры прилетят мгновенно' : '👌 Хорошая цена';
    updateCta();
  }
  $$('.pm').forEach(b => b.onclick = () => { st.offer = Math.max(200, st.offer + +b.dataset.d); syncOffer(); });
  $('#offerInput').oninput = e => { const raw = e.target.value; st.offer = Math.max(0, +raw || 0); syncOffer(); e.target.value = raw; };
  function updateCta() {
    const v = vehBy(st.veh);
    $('#orderBtn').textContent = st.mode === 'fast' ? `⚡ Заказать ${v.n} · ${fmt(price(v))}` : `🤝 Предложить ${fmt(st.offer)}`;
    $('#orderBtn').disabled = st.mode === 'bargain' && st.offer < 200;
  }
  const PAYS = [['cash', '💵 Наличные'], ['kaspi', '🔴 Kaspi'], ['card', '💳 Карта']];
  $('#payBtn').onclick = () => {
    const i = (PAYS.findIndex(p => p[0] === st.pay) + 1) % PAYS.length;
    st.pay = PAYS[i][0]; $('#payBtn').textContent = PAYS[i][1] + ' ▾';
  };
  $('#orderBtn').onclick = () => (st.mode === 'fast' ? startFast() : startBargain());

  // ---------- FAST ----------
  function startFast() {
    go('search');
    let p = 0;
    T.every(() => { p = Math.min(100, p + rnd(4, 12)); $('#searchBar').style.width = p + '%'; }, 200);
    T.later(() => { T.clear(); const v = vehBy(st.veh); assignDriver(makeDriver(v), price(v)); }, rnd(2200, 3500));
  }
  $('#cancelSearch').onclick = () => { T.clear(); $('#searchBar').style.width = 0; go('choose'); toast('Поиск отменён'); };

  function makeDriver(v) {
    let pool = DRIVERS.filter(d => d[2] === v.em && !st.used.includes(d[0]));
    if (!pool.length) pool = DRIVERS.filter(d => !st.used.includes(d[0]));
    if (!pool.length) { st.used = []; pool = DRIVERS; }
    const d = pick(pool);
    st.used.push(d[0]);
    return {
      name: d[0], bike: d[1], em: v.em, rating: rnd(4.6, 4.99).toFixed(2), trips: Math.floor(rnd(80, 3200)),
      eta: Math.floor(rnd(1, 6)), plate: `${Math.floor(rnd(100, 999))} ${pick(['AAA', 'KZB', 'MTO', 'ZHL', 'BRM'])} 02`,
    };
  }

  // ---------- BARGAIN ----------
  function startBargain() {
    st.used = [];
    go('offers');
    $('#offers').innerHTML = '<p class="muted center" id="offersEmpty">Ждём ответы райдеров… 📡</p>';
    $('#offersMeta').textContent = `Ты предложил ${fmt(st.offer)} · ${vehBy(st.veh).n}`;
    scheduleOffers(3);
  }
  function scheduleOffers(n) { for (let i = 0; i < n; i++) T.later(addOffer, rnd(1200, 2500) + i * rnd(1300, 2600)); }
  function addOffer() {
    const v = vehBy(st.veh), rec = price(v), ratio = st.offer / rec;
    let pr = st.offer;
    if (Math.random() > Math.min(.85, ratio - .15)) pr = round50(Math.max(st.offer + 50, rec * rnd(.95, 1.25)));
    const d = makeDriver(v), diff = pr - st.offer;
    $('#offersEmpty')?.remove();
    const el = document.createElement('div');
    el.className = 'offer';
    el.innerHTML = `
      <div class="avatar">${d.name[0]}</div>
      <div class="info"><b>${d.name}</b><small>★ ${d.rating} · ${d.eta} мин до тебя</small><small>${d.em} ${d.bike}</small></div>
      <div class="price">${fmt(pr)}<small class="${diff > 0 ? 'up' : 'eq'}">${diff > 0 ? '+' + fmt(diff) : 'твоя цена'}</small></div>
      <div class="btns"><button class="ok">Принять</button><button class="no" aria-label="Отклонить">✕</button></div>
      <i class="timer"></i>`;
    el.querySelector('.ok').onclick = () => { T.clear(); assignDriver(d, pr); };
    const kill = () => { el.style.transition = '.25s'; el.style.opacity = 0; el.style.transform = 'translateX(-40px)'; setTimeout(() => el.remove(), 250); };
    el.querySelector('.no').onclick = kill;
    T.later(kill, 15000);
    $('#offers').prepend(el);
    try { navigator.vibrate && navigator.vibrate(30); } catch {}
  }
  $('#raiseBtn').onclick = () => {
    st.offer += 100;
    $('#offersMeta').textContent = `Ты предложил ${fmt(st.offer)} · ${vehBy(st.veh).n}`;
    toast(`Цена поднята до ${fmt(st.offer)} 🔥`);
    scheduleOffers(2);
  };
  $('#cancelOffers').onclick = () => { T.clear(); go('choose'); toast('Заказ отменён'); };

  // ---------- DRIVER ----------
  function assignDriver(d, pr) {
    st.drv = { ...d, price: pr };
    $('#drvAvatar').textContent = d.name[0];
    $('#drvName').textContent = d.name;
    $('#drvRating').textContent = `★ ${d.rating} · ${d.trips.toLocaleString('ru-RU')} поездок`;
    $('#drvBike').textContent = `${d.bike} · ${d.em}`;
    $('#drvPlate').textContent = d.plate;
    $('#drvPrice').textContent = fmt(pr);
    $('#cancelConfirm').hidden = true;
    go('driver');
    toast(`${d.name} принял заказ!`);

    const start = [HOME[0] + rnd(-.012, .012), HOME[1] + rnd(-.015, .015)];
    drvMarker = L.marker(start, { icon: icon(d.em, 'mk-drv', [36, 36]), zIndexOffset: 1000 }).addTo(layer);
    $('#etaBanner').innerHTML = `Райдер будет через <b>${d.eta}</b> мин · шлем 🪖 ${$('#helmetChk').checked ? 'везёт' : 'не нужен'}`;
    stopAnim = animate(drvMarker, curve(start, HOME, 30), 5000, () => {
      $('#etaBanner').innerHTML = '📍 Райдер на месте! Надевай шлем и садись';
      T.later(() => {
        $('#etaBanner').innerHTML = `🏍️ Мчим к <b>${st.dest.n}</b>, держись крепче!`;
        layer.removeLayer(meMarker);
        stopAnim = animate(drvMarker, routeLine.getLatLngs().map(p => [p.lat, p.lng]), 8000, finish);
      }, 2000);
    });
  }
  $('#cancelRide').onclick = () => { $('#cancelConfirm').hidden = false; };
  $('#cancelNo').onclick = () => { $('#cancelConfirm').hidden = true; };
  $('#cancelYes').onclick = () => { T.clear(); backHome(); toast('Поездка отменена'); };

  // ---------- DONE ----------
  function finish() {
    const v = vehBy(st.veh);
    $('#doneSub').textContent = `${st.km.toFixed(1)} км за ${mins(v)} мин · ${fmt(st.drv.price)} · на авто было бы ~${Math.round(mins(v) * 2.1)} мин`;
    $$('#stars b').forEach(s => s.classList.add('on'));
    $$('.tips button').forEach(b => b.classList.remove('on'));
    go('done');
  }
  $$('#stars b').forEach((s, i) => s.onclick = () => $$('#stars b').forEach((x, j) => x.classList.toggle('on', j <= i)));
  $$('.tips button').forEach(b => b.onclick = () => $$('.tips button').forEach(x => x.classList.toggle('on', x === b && !x.classList.contains('on'))));
  $('#doneBtn').onclick = () => { backHome(); toast('Спасибо, что с Zhyldam! ⚡'); };

  function backHome() {
    resetRoute(); meMarker.addTo(layer); map.flyTo(HOME, 14);
    $('#toInput').value = ''; renderSuggest();
    go('home');
  }

  return {
    enter() { layer.addTo(map); backHome(); },
    leave() { T.clear(); resetRoute(); map.removeLayer(layer); },
    locate() { map.flyTo(HOME, 15); },
  };
})();
