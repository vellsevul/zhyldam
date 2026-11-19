// Zhyldam: режим пассажира. Живые райдеры через room, иначе симуляция.
window.Passenger = (() => {
  const { $, $$, DEFAULT_HOME, PLACES, VEHICLES, hav, fmt, round50, rnd, pick, vehBy, priceFor, store, toast, esc, map, icon, animate, timers } = Z;
  const T = timers();

  const BOTS = [
    ['Ерлан', 'Honda PCX', '🛵'], ['Айдос', 'Yamaha NMAX', '🛵'], ['Нурлан', 'Honda CB500F', '🏍️'],
    ['Тимур', 'Kawasaki Z650', '🏍️'], ['Данияр', 'Yamaha R6', '🏁'], ['Асель', 'Vespa GTS', '🛵'],
    ['Бауыржан', 'BMW S1000RR', '🏁'], ['Арман', 'Suzuki GSX-S750', '🏍️'], ['Мадина', 'Honda Forza', '🛵'],
    ['Ержан', 'Ducati Panigale V2', '🏁'], ['Сабина', 'Yamaha MT-07', '🏍️'],
  ];
  const STAGES = {
    toPickup: d => `🏍️ ${esc(d)} едет к тебе`,
    atPickup: () => '📍 Райдер на месте! Выходи, он ждёт',
    waiting: () => '🪖 Надевай шлем и садись',
    riding: () => `⚡ Мчим к <b>${esc(st.toName)}</b>, держись крепче!`,
    arrived: () => '🏁 Приехали!',
  };
  const st = {
    from: DEFAULT_HOME, fromName: '', located: false, to: null, toName: '',
    mode: 'fast', veh: 'moto', offer: 0, trips: {}, used: [],
    ride: null, drv: null, live: false, livePeer: null, stage: null, tip: 0, rating: 5, saved: null, lostAt: 0,
  };
  const tripOf = id => st.trips[id];
  const priceOf = id => { const t = tripOf(id); return t ? priceFor(vehBy(id), t.km, t.jam) : 0; };

  const layer = L.layerGroup();
  const meMarker = L.marker(st.from, { icon: icon('', 'mk-me pulse', [20, 20]) }).addTo(layer);
  let destMarker = null, routeG = null, drvMarker = null, approachG = null, stopAnim = null, stopPicker = null;
  const liveMarkers = new Map();

  // боты вокруг
  const ambient = Array.from({ length: 10 }, (_, i) => {
    const em = ['🛵', '🏍️', '🛵', '🏁', '🏍️', '🛵', '🏍️', '🛵', '🏍️', '🏁'][i];
    const p = [st.from[0] + rnd(-.015, .015), st.from[1] + rnd(-.02, .02)];
    const m = L.marker(p, { icon: icon(em, 'mk', [30, 30]), interactive: false }).addTo(layer);
    return { m, dx: rnd(-.0002, .0002), dy: rnd(-.0002, .0002) };
  });
  setInterval(() => {
    if (!map.hasLayer(layer)) return;
    ambient.forEach(a => {
      const p = a.m.getLatLng();
      if (Math.abs(p.lat - st.from[0]) > .02) a.dx = -Math.sign(p.lat - st.from[0]) * Math.abs(a.dx);
      if (Math.abs(p.lng - st.from[1]) > .025) a.dy = -Math.sign(p.lng - st.from[1]) * Math.abs(a.dy);
      if (Math.random() < .05) { a.dx = rnd(-.0002, .0002); a.dy = rnd(-.0002, .0002); }
      a.m.setLatLng([p.lat + a.dx, p.lng + a.dy]);
    });
  }, 700);

  function go(step) {
    $$('.step').forEach(s => s.classList.toggle('active', s.dataset.step === step));
    $('#sheet').scrollTop = 0;
    st.step = step;
  }
  $$('[data-back]').forEach(b => b.onclick = () => { clearRoute(); go(b.dataset.back); centerHome(); });
  const centerHome = () => Z.centerOn(st.from, 15);

  // ---------- откуда: точный GPS ----------
  // Пока пассажир сам не передвинул пин, точка посадки следует за GPS.
  let accCircle = null, stopWatch = null, gpsWarned = false;
  function setFrom(p, label, gps) {
    st.from = p;
    meMarker.setLatLng(p);
    const prefix = gps ? '📍 ' : '';
    const acc = gps && st.acc ? ` · ±${st.acc} м` : '';
    st.fromName = label || Z.addressOf(p);
    $('#fromText').textContent = prefix + st.fromName + acc;
    renderSuggest($('#toInput').value);
    if (!label) Z.reverse(p).then(txt => {
      if (st.from !== p || !txt) return;
      st.fromName = txt; $('#fromText').textContent = prefix + txt + acc;
    });
  }
  function onGps({ ll, acc }) {
    const firstFix = !st.gps;
    st.gps = ll; st.acc = acc;
    if (!accCircle) accCircle = L.circle(ll, { radius: acc, color: '#7c3aed', weight: 1, fillColor: '#7c3aed', fillOpacity: .08, interactive: false }).addTo(layer);
    else { accCircle.setLatLng(ll); accCircle.setRadius(acc); }
    if (st.manualFrom) return;
    if (!Z.real.on && !Z.inCity(ll)) {
      if (firstFix) { setFrom(DEFAULT_HOME); toast('Ты вне Алматы, поставили точку в центре. Поправь её'); centerHome(); }
      return;
    }
    if (firstFix || hav(ll, st.from) > .015) {
      setFrom(ll, null, true);
      if (firstFix) { st.located = true; if (st.step === 'home') centerHome(); toast(`📍 Нашли тебя, точность ±${acc} м`); }
      if (st.ride && st.ride.share) publishRide();
    }
  }
  function startGps() {
    $('#fromText').textContent = 'Определяем, где ты…';
    stopWatch && stopWatch();
    stopWatch = Z.watch(onGps, why => {
      if (st.gps) return;
      setFrom(st.from);
      if (!gpsWarned) { gpsWarned = true; toast(why === 'denied' ? 'Доступ к геопозиции запрещён. Поставь точку посадки вручную' : 'Не получилось определить геопозицию. Проверь точку посадки'); }
    });
  }
  function locateMe() {
    st.manualFrom = false;
    if (st.gps) { setFrom(st.gps, null, true); Z.centerOn(st.gps, 16); toast(`📍 Ты здесь, точность ±${st.acc} м`); }
    else { gpsWarned = false; startGps(); }
  }

  // ---------- выбор точки на карте ----------
  let pickKind = 'from', pickLL = null, pickSeq = 0;
  function startPick(kind) {
    pickKind = kind;
    go('pick');
    $('#pickTitle').textContent = kind === 'from' ? 'Откуда заберём?' : 'Куда едем?';
    $('#pickDot').className = kind === 'to' ? 'to' : '';
    $('#pickDone').textContent = kind === 'from' ? 'Заберите меня здесь' : 'Еду сюда';
    if (kind === 'from') layer.removeLayer(meMarker);
    Z.centerOn(kind === 'from' ? st.from : (st.to || st.from), 17);
    stopPicker = Z.startPicker(kind, p => {
      pickLL = p; const seq = ++pickSeq;
      $('#pickAddr').textContent = Z.addressOf(p);
      Z.reverse(p).then(txt => { if (seq === pickSeq && txt) $('#pickAddr').textContent = txt; });
    });
  }
  function endPick() { stopPicker && stopPicker(); stopPicker = null; meMarker.addTo(layer); }
  $('#fromBtn').onclick = () => startPick('from');
  $('#pickToBtn').onclick = () => startPick('to');
  $('#pickBack').onclick = () => { endPick(); go('home'); centerHome(); };
  $('#pickDone').onclick = () => {
    const p = pickLL || Z.pickedLatLng(), label = $('#pickAddr').textContent;
    endPick();
    if (pickKind === 'from') { st.manualFrom = true; setFrom(p, label); go('home'); centerHome(); toast('Точка посадки обновлена. ◎ вернёт к GPS'); }
    else setDest({ n: label, c: p });
  };

  // ---------- куда ----------
  let searchT = null, searchSeq = 0, found = [];
  function renderSuggest(q = '') {
    const list = PLACES.filter(p => (p.n + p.a).toLowerCase().includes(q.toLowerCase()))
      .map(p => ({ p, d: hav(st.from, p.c) })).sort((a, b) => a.d - b.d);
    const real = found.map((p, i) => `<button class="sg" data-f="${i}"><span class="ic">${p.ic}</span><span><b>${esc(p.n)}</b><small>${esc(p.a)}</small></span><span class="km">${hav(st.from, p.c).toFixed(1)} км</span></button>`).join('');
    $('#suggest').innerHTML = real + list.map(({ p, d }) =>
      `<button class="sg" data-i="${PLACES.indexOf(p)}"><span class="ic">${p.ic}</span><span><b>${p.n}</b><small>${p.a}</small></span><span class="km">${d.toFixed(1)} км</span></button>`
    ).join('') || '<p class="muted center">Ничего не нашли. Укажи точку на карте 📌</p>';
    $$('.sg[data-i]').forEach(b => b.onclick = () => setDest(PLACES[b.dataset.i]));
    $$('.sg[data-f]').forEach(b => b.onclick = () => setDest(found[b.dataset.f]));
  }
  $('#toInput').oninput = e => {
    const q = e.target.value;
    found = []; renderSuggest(q);
    clearTimeout(searchT);
    if (!Z.real.on || q.trim().length < 3) return;
    const seq = ++searchSeq;
    searchT = setTimeout(async () => {
      const r = await Z.search(q, st.from);
      if (seq !== searchSeq) return;
      found = r; renderSuggest(q);
    }, 600);
  };
  map.on('click', e => {
    if (!map.hasLayer(layer) || st.step !== 'home') return;
    const p = [e.latlng.lat, e.latlng.lng];
    Z.reverse(p).then(n => setDest({ n, c: p }));
  });

  let destSeq = 0;
  async function setDest(p) {
    if (hav(st.from, p.c) < .3) { toast('Слишком близко, это можно пройти пешком 🙂'); go('home'); return; }
    st.to = p.c; st.toName = p.n;
    const seq = ++destSeq;
    $('#tripTo').textContent = p.n;
    go('choose');
    // сразу показываем примерный расчёт, затем уточняем по настоящим дорогам
    VEHICLES.forEach(v => { st.trips[v.id] = Z.trip(st.from, st.to, v); });
    const paint = () => {
      const t = tripOf(st.veh), sc = t.score;
      $('#tripMeta').innerHTML = `${t.km.toFixed(1)} км ${t.real ? 'по дорогам' : Z.real.on ? 'примерно, строим маршрут…' : 'по улицам'} · пробки <span class="score ${sc < 4 ? 'g' : sc < 7 ? 'y' : 'r'}">${sc}</span> на маршруте`;
      renderVehicles(); syncOffer(true);
    };
    if (!Z.real.on) drawMainRoute(); else { clearRoute(); destMarker = L.marker(st.to, { icon: icon('', 'mk-dest', [18, 18]) }).addTo(layer); }
    $('#shareChk').checked = store.get('share', false);
    paint(); syncPay();
    if (Z.real.on) {
      const trips = await Promise.all(VEHICLES.map(v => Z.tripAsync(st.from, st.to, v)));
      if (seq !== destSeq) return;
      VEHICLES.forEach((v, i) => { st.trips[v.id] = trips[i]; });
      drawMainRoute(); paint();
      if (!trips[0].real) toast('Не удалось построить маршрут по дорогам, показан примерный');
    }
  }
  function drawMainRoute() {
    clearRoute();
    const t = tripOf(st.veh);
    destMarker = L.marker(st.to, { icon: icon('', 'mk-dest', [18, 18]) }).addTo(layer);
    routeG = Z.drawRoute(layer, t);
    map.fitBounds(L.latLngBounds(t.pts), { paddingTopLeft: [40, 110], paddingBottomRight: [40, Math.round(window.innerHeight * .62)] });
  }
  function clearRoute() {
    stopAnim && stopAnim(); stopAnim = null;
    [destMarker, routeG, drvMarker, approachG].forEach(m => m && layer.removeLayer(m));
    destMarker = routeG = drvMarker = approachG = null;
  }

  // ---------- выбор тарифа ----------
  function renderVehicles() {
    $('#vehicles').innerHTML = VEHICLES.map(v => {
      const t = tripOf(v.id);
      return `<button class="veh ${v.id === st.veh ? 'sel' : ''}" data-id="${v.id}">
        <span class="em">${v.em}</span>
        <span class="nm"><b>${v.n}${v.badge ? `<span class="badge">${v.badge}</span>` : ''}</b><small>${v.d}</small></span>
        <span class="pr"><b>${st.mode === 'bargain' ? '~' : ''}${fmt(priceOf(v.id))}</b><small>${t.min} мин · авто ~${t.carMin}</small></span>
      </button>`;
    }).join('');
    $$('.veh').forEach(b => b.onclick = () => { st.veh = b.dataset.id; renderVehicles(); syncOffer(true); drawMainRoute(); });
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
    const rec = priceOf(st.veh);
    if (reset) st.offer = round50(rec * .9);
    $('#offerInput').value = st.offer;
    $('#recPrice').textContent = `рекомендуем ${fmt(rec)}`;
    const r = st.offer / rec;
    $('#bbWarn').textContent = r < .7 ? '😬 Слишком мало, райдеры вряд ли согласятся'
      : r < .9 ? '🤔 Низковато, но можно попробовать' : r > 1.15 ? '🔥 Щедро! Райдеры прилетят мгновенно' : '👌 Хорошая цена';
    updateCta();
  }
  $$('.pm').forEach(b => b.onclick = () => { st.offer = Math.max(200, st.offer + +b.dataset.d); syncOffer(); });
  $('#offerInput').oninput = e => { const raw = e.target.value; st.offer = Math.max(0, +raw || 0); syncOffer(); e.target.value = raw; };
  function updateCta() {
    const v = vehBy(st.veh), n = liveDrivers().length;
    $('#orderBtn').textContent = (st.mode === 'fast' ? `⚡ Заказать ${v.n} · ${fmt(priceOf(st.veh))}` : `🤝 Предложить ${fmt(st.offer)}`) + (n ? ` · 🟢 ${n}` : '');
    $('#orderBtn').disabled = st.mode === 'bargain' && st.offer < 200;
  }
  function syncPay() { const p = Account.currentPay(); $('#payBtn').textContent = `${p.ic} ${p.label} ▾`; }
  Account.onPay(syncPay);
  $('#payBtn').onclick = () => Account.openPanel('pay', { select: true });
  $('#shareChk').onchange = e => { store.set('share', e.target.checked); };

  // ---------- живые райдеры ----------
  const liveDrivers = () => Live.drivers().filter(d => d.presence.profile && d.presence.profile.veh === st.veh && !d.presence.trip);
  function publishRide() {
    if (!st.ride) { Live.set({ role: 'passenger', ride: null, loc: null, chat: null }); return; }
    Live.set({ role: 'passenger', ride: st.ride, loc: st.ride.share ? LL(st.gps && !st.manualFrom ? st.gps : st.from) : null });
  }
  function newRide(price) {
    const t = tripOf(st.veh);
    st.ride = {
      id: Math.random().toString(36).slice(2, 10), status: 'searching', veh: st.veh, mode: st.mode, price,
      from: LL(st.from), fromName: st.fromName.replace(/^📍 /, ''), to: LL(st.to), toName: st.toName, km: Math.round(t.km * 10) / 10,
      share: $('#shareChk').checked, name: Account.name(), pay: Account.currentPay().label, driver: null, finalPrice: null, sim: null,
    };
    publishRide();
  }
  function renderLiveDrivers() {
    const seen = new Set();
    if (map.hasLayer(layer) && !st.livePeer) for (const d of Live.drivers()) {
      const p = d.presence; if (!p.loc || p.trip) continue;
      seen.add(d.peer);
      let m = liveMarkers.get(d.peer);
      if (!m) { m = L.marker(p.loc, { icon: icon(p.profile.em, 'mk live', [32, 32]), interactive: false, zIndexOffset: 500 }).addTo(layer); liveMarkers.set(d.peer, m); }
      else m.setLatLng(p.loc);
    }
    for (const [k, m] of liveMarkers) if (!seen.has(k)) { layer.removeLayer(m); liveMarkers.delete(k); }
  }
  Live.on(() => {
    const n = Live.drivers().length;
    const pill = $('#livePill');
    pill.hidden = !(n && $('#app').classList.contains('mode-passenger'));
    pill.textContent = `Онлайн ${n} ${n === 1 ? 'райдер' : n < 5 ? 'райдера' : 'райдеров'}`;
    renderLiveDrivers();
    if (st.step === 'choose') updateCta();
    if (!st.ride || !st.live) return;
    if (st.ride.status === 'searching') {
      if (st.ride.mode === 'fast') {
        const claim = Live.drivers().filter(d => d.presence.claim === st.ride.id).sort((a, b) => a.updatedAt - b.updatedAt)[0];
        if (claim) { T.clear(); assignLive(claim, st.ride.price); }
      } else renderLiveOffers();
    } else if (st.livePeer) trackLive();
  });

  // ---------- заказ ----------
  $('#orderBtn').onclick = () => {
    const price = st.mode === 'fast' ? priceOf(st.veh) : st.offer;
    st.used = []; st.tip = 0; st.rating = 5; st.saved = null; st.livePeer = null; st.drv = null;
    newRide(price);
    st.live = liveDrivers().length > 0;
    st.mode === 'fast' ? startFast() : startBargain();
  };

  function startFast() {
    go('search');
    $('#searchSub').textContent = st.live ? `🟢 Отправили заказ живым райдерам рядом: ${liveDrivers().length}` : 'Фиксированная цена: первый свободный уже едет';
    let p = 0;
    T.every(() => { p = Math.min(st.live ? 92 : 100, p + rnd(3, 10)); $('#searchBar').style.width = p + '%'; }, 250);
    T.later(() => {
      if (st.live) { st.live = false; toast('Живые райдеры не ответили, ищем ближайших'); }
      T.clear(); const v = vehBy(st.veh); assignBot(makeBot(v), st.ride.price);
    }, st.live ? 25000 : rnd(2200, 3500));
  }
  $('#cancelSearch').onclick = () => { cancelOrder(); };
  function cancelOrder() {
    T.clear(); $('#searchBar').style.width = 0;
    st.ride = null; st.live = false; publishRide();
    go('choose'); toast('Заказ отменён');
  }

  function makeBot(v) {
    let pool = BOTS.filter(d => d[2] === v.em && !st.used.includes(d[0]));
    if (!pool.length) pool = BOTS.filter(d => !st.used.includes(d[0]));
    if (!pool.length) { st.used = []; pool = BOTS; }
    const d = pick(pool); st.used.push(d[0]);
    return { name: d[0], bike: d[1], em: v.em, rating: rnd(4.6, 4.99).toFixed(2), trips: Math.floor(rnd(80, 3200)),
      eta: Math.floor(rnd(2, 6)), plate: `${Math.floor(rnd(100, 999))} ${pick(['AAA', 'KZB', 'MTO', 'ZHL', 'BRM'])} 02` };
  }

  // ---------- торг ----------
  const declined = new Set();
  function startBargain() {
    declined.clear();
    go('offers');
    $('#offers').innerHTML = `<p class="muted center" id="offersEmpty">${st.live ? '🟢 Ждём ответы живых райдеров…' : 'Ждём ответы райдеров… 📡'}</p>`;
    syncOffersMeta();
    if (st.live) T.later(() => { if (st.ride?.status === 'searching' && !$('#offers .offer')) scheduleBots(3); }, 20000);
    else scheduleBots(3);
  }
  const syncOffersMeta = () => { $('#offersMeta').textContent = `Ты предложил ${fmt(st.ride.price)} · ${vehBy(st.veh).n}`; };
  function scheduleBots(n) { for (let i = 0; i < n; i++) T.later(addBotOffer, rnd(1200, 2500) + i * rnd(1300, 2600)); }
  function addBotOffer() {
    const rec = priceOf(st.veh), ratio = st.ride.price / rec;
    let pr = st.ride.price;
    if (Math.random() > Math.min(.85, ratio - .15)) pr = round50(Math.max(st.ride.price + 50, rec * rnd(.95, 1.25)));
    const d = makeBot(vehBy(st.veh));
    const el = offerEl(d, pr, false);
    el.querySelector('.ok').onclick = () => { T.clear(); assignBot(d, pr); };
    T.later(() => kill(el), 15000);
  }
  function offerEl(d, pr, live, key) {
    $('#offersEmpty')?.remove();
    const el = document.createElement('div');
    el.className = 'offer' + (live ? ' live' : '');
    if (key) el.dataset.key = key;
    const diff = pr - st.ride.price;
    el.innerHTML = `
      <div class="avatar">${esc(d.name[0])}</div>
      <div class="info"><b>${esc(d.name)}${live ? '<span class="tag-live">живой</span>' : ''}</b><small>★ ${esc(d.rating)} · ${d.eta} мин до тебя</small><small>${esc(d.em)} ${esc(d.bike)}</small></div>
      <div class="price">${fmt(pr)}<small class="${diff > 0 ? 'up' : 'eq'}">${diff > 0 ? '+' + fmt(diff) : 'твоя цена'}</small></div>
      <div class="btns"><button class="ok">Принять</button><button class="no" aria-label="Отклонить">✕</button></div>
      ${live ? '' : '<i class="timer"></i>'}`;
    el.querySelector('.no').onclick = () => { if (key) declined.add(key); kill(el); };
    $('#offers').prepend(el);
    Account.vibrate(30);
    return el;
  }
  const kill = el => { el.style.transition = '.25s'; el.style.opacity = 0; el.style.transform = 'translateX(-40px)'; setTimeout(() => el.remove(), 250); };
  function renderLiveOffers() {
    const offers = Live.drivers().filter(d => d.presence.offer && d.presence.offer.ride === st.ride.id);
    const keys = new Set();
    offers.forEach(d => {
      const pr = d.presence.offer.price, key = d.peer + ':' + pr;
      keys.add(key);
      if (declined.has(key) || $(`#offers [data-key="${CSS.escape(key)}"]`)) return;
      $$(`#offers [data-key^="${CSS.escape(d.peer)}:"]`).forEach(x => x.remove());
      const prof = d.presence.profile, eta = d.presence.loc ? Math.max(1, Math.round(Z.route(d.presence.loc, st.from, 'moto', vehBy(prof.veh).speed).min)) : 3;
      const el = offerEl({ ...prof, eta }, pr, true, key);
      el.querySelector('.ok').onclick = () => { T.clear(); assignLive(d, pr); };
    });
    $$('#offers .offer.live').forEach(el => { if (!keys.has(el.dataset.key)) el.remove(); });
  }
  $('#raiseBtn').onclick = () => {
    st.ride.price += 100; publishRide(); syncOffersMeta();
    toast(`Цена поднята до ${fmt(st.ride.price)} 🔥`);
    if (!st.live) scheduleBots(2);
  };
  $('#cancelOffers').onclick = cancelOrder;

  // ---------- райдер назначен ----------
  function showDriver(d, price) {
    st.drv = { ...d, price };
    Account.paintAvatar($('#drvAvatar'), d.name, null);
    $('#drvName').textContent = d.name;
    $('#drvRating').textContent = `★ ${d.rating}${d.trips ? ` · ${(+d.trips).toLocaleString('ru-RU')} поездок` : ''}`;
    $('#drvBike').textContent = `${d.bike} · ${d.em}`;
    $('#drvPlate').textContent = d.plate;
    $('#drvPrice').textContent = fmt(price);
    $('#cancelConfirm').hidden = true;
    syncShareNote();
    go('driver');
    toast(`${d.name} принял заказ!`);
    Account.setShareProvider(shareInfo);
  }
  function syncShareNote() {
    const on = st.ride && st.ride.share;
    $('#shareNote').innerHTML = (on ? '📍 Райдер видит тебя на карте' : '🙈 Райдер видит только точку посадки, не тебя')
      + ` · <button id="shareToggle">${on ? 'Скрыть' : 'Показать'}</button> · <button id="shareTrip">🔗 Поделиться поездкой</button>`;
    $('#shareToggle').onclick = () => {
      st.ride.share = !st.ride.share; publishRide(); syncShareNote();
      toast(st.ride.share ? 'Райдер видит тебя на карте' : 'Твоя геопозиция скрыта');
    };
    $('#shareTrip').onclick = () => Account.openShare(shareInfo());
  }
  function shareInfo() {
    if (!st.ride || !st.drv) return null;
    const t = tripOf(st.veh), eta = new Date(Date.now() + (t.min + (st.drv.eta || 3)) * 60000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return { id: st.ride.id, text: `Еду на Zhyldam ⚡\n${st.ride.fromName} → ${st.ride.toName}\nРайдер: ${st.drv.name}, ${st.drv.bike}, ${st.drv.plate}\nПриеду примерно в ${eta}` };
  }
  function banner(stage) {
    st.stage = stage;
    if (stage === 'toPickup') $('#etaBanner').innerHTML = `${STAGES.toPickup(st.drv.name)} · <b>${st.drv.eta} мин</b><br><small class="eta-sub">🏍️ Сейчас: ${esc(st.drv.where || '…')} · 🪖 шлем для тебя у него</small>`;
    else if (stage === 'riding') $('#etaBanner').innerHTML = `${STAGES.riding()} · <b>${st.drv.left ?? tripOf(st.veh).min} мин</b><br><small class="eta-sub">Сейчас: ${esc(st.drv.where || st.fromName)}</small>`;
    else if (STAGES[stage]) $('#etaBanner').innerHTML = STAGES[stage]();
    if (st.ride) { st.ride.status = stage === 'riding' ? 'riding' : 'assigned'; if (st.ride.sim) st.ride.sim.stage = stage; publishRide(); }
  }

  // бот-райдер: всё анимируется здесь
  async function assignBot(d, price) {
    st.live = false; st.livePeer = null;
    st.ride.status = 'assigned'; st.ride.finalPrice = price;
    st.ride.sim = { profile: { name: d.name, bike: d.bike, em: d.em, plate: d.plate, rating: d.rating }, stage: 'toPickup' };
    showDriver(d, price);
    const start = [st.from[0] + rnd(-.012, .012), st.from[1] + rnd(-.015, .015)];
    const appr = await Z.routeAsync(start, st.from, 'moto', vehBy(st.veh).speed);
    if (!st.ride || st.livePeer) return;
    d.eta = Math.max(2, appr.min); st.drv.eta = d.eta;
    banner('toPickup');
    approachG = Z.drawRoute(layer, appr, { color: '#c084fc', dashed: true });
    drvMarker = L.marker(start, { icon: icon(d.em, 'mk-drv', [36, 36]), zIndexOffset: 1000 }).addTo(layer);
    map.fitBounds(L.latLngBounds([...appr.pts, ...tripOf(st.veh).pts]), { paddingTopLeft: [40, 110], paddingBottomRight: [40, Math.round(window.innerHeight * .55)] });
    st.drv.where = Z.addressOf(start); st.drv.from = st.drv.where; banner('toPickup');
    let lastUpd = 0;
    const onMove = (p, t) => {
      const n = performance.now(); if (n - lastUpd < 700) return; lastUpd = n;
      st.drv.where = Z.addressOf(p);
      if (st.stage === 'toPickup') st.drv.eta = Math.max(1, Math.round(appr.min * (1 - t)));
      if (st.stage === 'riding') st.drv.left = Math.max(1, Math.round(tripOf(st.veh).min * (1 - t)));
      banner(st.stage);
    };
    stopAnim = animate(drvMarker, appr.pts, 6000, () => {
      layer.removeLayer(approachG); approachG = null;
      banner('atPickup');
      T.later(() => banner('waiting'), 1800);
      T.later(() => {
        banner('riding'); layer.removeLayer(meMarker);
        stopAnim = animate(drvMarker, tripOf(st.veh).pts, 9000, () => { banner('arrived'); T.later(finish, 1200); }, onMove);
      }, 3600);
    }, onMove);
  }

  // живой райдер: этапы и позиция приходят от него
  function assignLive(peer, price) {
    st.live = true; st.livePeer = peer.peer; st.lostAt = 0;
    st.ride.status = 'assigned'; st.ride.driver = peer.peer; st.ride.finalPrice = price;
    publishRide();
    const p = peer.presence.profile;
    const eta = peer.presence.loc ? Z.route(peer.presence.loc, st.from, 'moto', vehBy(p.veh).speed).min : 3;
    showDriver({ ...p, eta, trips: p.trips }, price);
    banner('toPickup');
  }
  function trackLive() {
    const d = Live.peer(st.livePeer);
    if (!d) {
      if (!st.lostAt) st.lostAt = Date.now();
      else if (Date.now() - st.lostAt > 8000) { toast('Райдер пропал со связи, поездка отменена'); endRide('cancelled'); }
      return;
    }
    st.lostAt = 0;
    const p = d.presence, trip = p.trip;
    if (!trip || trip.ride !== st.ride.id) { if (st.stage && st.stage !== 'toPickup') return; return; }
    if (trip.stage === 'cancelled') { toast('Райдер отменил поездку'); endRide('cancelled'); return; }
    if (trip.stage === 'done') { if (st.step !== 'done') finish(); return; }
    if (trip.stage !== st.stage) {
      banner(trip.stage);
      if (trip.stage === 'riding') layer.removeLayer(meMarker);
      if (trip.stage === 'arrived') Account.vibrate(80);
    }
    if (p.loc) {
      if (!drvMarker) {
        drvMarker = L.marker(p.loc, { icon: icon(p.profile.em, 'mk-drv', [36, 36]), zIndexOffset: 1000 }).addTo(layer);
        st.drv.from = Z.addressOf(p.loc);
      } else drvMarker.setLatLng(p.loc);
      const n = Date.now();
      if (n - (st.liveUpd || 0) > 1200) {
        st.liveUpd = n;
        st.drv.where = Z.addressOf(p.loc);
        const sp = vehBy(p.profile.veh).speed;
        if (trip.stage === 'toPickup') {
          if (!Z.real.on || n - (st.apprUpd || 0) > 15000) {
            st.apprUpd = n;
            Z.routeAsync(p.loc, st.from, 'moto', sp).then(r => {
              if (st.stage !== 'toPickup' || !st.ride) return;
              st.drv.eta = r.min;
              approachG && layer.removeLayer(approachG);
              approachG = Z.drawRoute(layer, r, { color: '#c084fc', dashed: true });
              banner('toPickup');
            });
          } else {
            // между пересчётами: время по оставшемуся расстоянию
            st.drv.eta = Math.max(1, Math.round(hav(p.loc, st.from) * 1.3 / sp * 60 * 1.25));
          }
        } else if (approachG) { layer.removeLayer(approachG); approachG = null; }
        if (trip.stage === 'riding') st.drv.left = Z.real.on ? Math.max(1, Math.round(hav(p.loc, st.to) * 1.3 / sp * 60 * 1.25)) : Z.route(p.loc, st.to, 'moto', sp).min;
        banner(trip.stage);
      }
    }
    Account.redrawChat();
  }

  // звонок и чат
  $('#drvCall').onclick = () => st.drv && Account.openPanel('call', { name: st.drv.name, sub: `${st.drv.bike} · ${st.drv.plate}`, phone: st.drv.phone ||= Account.fakePhone() });
  $('#drvChat').onclick = () => {
    if (!st.drv || !st.ride) return;
    const id = st.ride.id;
    Account.openPanel('chat', {
      id, name: st.drv.name, quick: ['Я у входа', 'Выхожу через минуту', 'Где ты?', 'Я в синей куртке'],
      bot: ['Уже еду! 🏍️', 'Буду через пару минут', 'Шлем для тебя взял 🪖', 'Понял, жду', 'Стою у входа, на байке'],
      theirs: st.live ? () => { const p = Live.peer(st.livePeer)?.presence; return p?.chat?.ride === id ? p.chat.msgs : []; } : null,
      onSend: msgs => { if (st.live) Live.set({ chat: { ride: id, msgs: msgs.slice(-6).map(m => ({ text: m.text.slice(0, 140), at: m.at })) } }); },
    });
  };

  $('#cancelRide').onclick = () => { $('#cancelConfirm').hidden = false; };
  $('#cancelNo').onclick = () => { $('#cancelConfirm').hidden = true; };
  $('#cancelYes').onclick = () => { toast('Поездка отменена'); endRide('cancelled'); };

  function record(status) {
    if (st.saved || !st.ride || !st.drv) return st.saved;
    const v = vehBy(st.veh), t = tripOf(st.veh);
    const total = st.drv.price, base = v.base, dist = Math.round(v.km * t.km), jamFee = Math.max(0, total - base - dist);
    st.saved = Account.addHistory({
      role: 'passenger', status, fromName: st.ride.fromName, toName: st.ride.toName, from: st.ride.from, to: st.ride.to,
      km: t.km, min: t.min, carMin: t.carMin, jamScore: t.score, veh: st.veh, mode: st.ride.mode,
      fare: total, base, dist: st.ride.mode === 'fast' ? total - base - jamFee : dist, jamFee: st.ride.mode === 'fast' ? jamFee : 0,
      tip: status === 'cancelled' ? 0 : st.tip, total: status === 'cancelled' ? 0 : total + st.tip, pay: { label: Account.currentPay().label },
      who: { name: st.drv.name, bike: st.drv.bike, plate: st.drv.plate, rating: st.drv.rating }, live: st.live, rating: st.rating,
    });
    return st.saved;
  }
  function endRide(status) {
    T.clear();
    if (status === 'cancelled' && st.drv) record('cancelled');
    st.ride = null; st.live = false; st.livePeer = null; publishRide();
    Account.setShareProvider(null);
    backHome();
  }

  // ---------- финиш ----------
  function finish() {
    if (st.step === 'done' || st.finishing) return;
    st.finishing = true;
    const t = tripOf(st.veh);
    go('done');
    if (st.ride) { st.ride.status = 'done'; publishRide(); }
    st.finishing = false;
    $('#doneSub').textContent = `${t.km.toFixed(1)} км за ${t.min} мин · ${fmt(st.drv.price)} · на авто было бы ~${t.carMin} мин`;
    $$('#stars b').forEach(s => s.classList.add('on'));
    $$('.tips button').forEach(b => b.classList.remove('on'));
    st.tip = 0; st.rating = 5;
  }
  $$('#stars b').forEach((s, i) => s.onclick = () => { st.rating = i + 1; $$('#stars b').forEach((x, j) => x.classList.toggle('on', j <= i)); });
  $$('.tips button').forEach(b => b.onclick = () => {
    const on = !b.classList.contains('on');
    $$('.tips button').forEach(x => x.classList.toggle('on', x === b && on));
    st.tip = on ? +b.dataset.tip : 0;
  });
  $('#receiptBtn').onclick = () => { const r = record('done'); r && Account.openPanel('receipt', { id: r.id }); };
  $('#doneBtn').onclick = () => { record('done'); endRide('done'); toast('Спасибо, что с Zhyldam! ⚡'); };

  function backHome() {
    clearRoute(); meMarker.addTo(layer);
    $('#toInput').value = ''; renderSuggest();
    go('home'); centerHome();
  }

  let first = true;
  return {
    enter() {
      layer.addTo(map); backHome();
      if (first) { first = false; $('#fromText').textContent = Z.addressOf(st.from); st.fromName = Z.addressOf(st.from); Account.whenSignedIn(startGps); }
      publishRide();
    },
    leave() { T.clear(); endPick(); clearRoute(); st.ride = null; publishRide(); map.removeLayer(layer); $('#livePill').hidden = true; },
    locate() { locateMe(); },
  };
})();
