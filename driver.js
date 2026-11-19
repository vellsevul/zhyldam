// Zhyldam: режим райдера (пассажиры и заказы симулируются)
window.Driver = (() => {
  const { $, $$, HOME, PLACES, VEHICLES, hav, fmt, round50, rnd, pick, vehBy, priceFor, minsFor, curve, store, toast, map, icon, animate, timers } = Z;
  const T = timers();      // заказы на линии
  const TT = timers();     // текущая поездка

  const PASSENGERS = ['Айгерим', 'Дана', 'Алихан', 'Санжар', 'Жанна', 'Мирас', 'Камила', 'Ерасыл', 'Томирис', 'Нурсултан', 'Алина', 'Диас'];
  const PICKUPS = ['ТРЦ Forum', 'ул. Жандосова, 58', 'Атакент', 'метро Алмалы', 'ЖК Хан Тенгри', 'ул. Шевченко, 90', 'Рахат Палас', 'Абай / Байзакова', 'Сайран', 'метро Москва'];

  const prof = Object.assign({ name: 'Ерлан', bike: 'Honda CB500F', veh: 'moto', plate: '777 ZHL 02' }, store.get('driver', {}));
  const st = { online: false, pos: [HOME[0] + .004, HOME[1] - .006], orders: new Map(), ride: null, earned: 0, trips: 0, stage: null };

  const layer = L.layerGroup();
  const me = L.marker(st.pos, { icon: icon(vehBy(prof.veh).em, 'mk-drv me', [40, 40]), zIndexOffset: 2000 }).addTo(layer);
  let routeA = null, routeB = null, pickM = null, destM = null, stopAnim = null;

  map.on('click', e => {
    if (!map.hasLayer(layer) || st.ride) return;
    st.pos = [e.latlng.lat, e.latlng.lng];
    me.setLatLng(st.pos);
    renderOrders();
    toast('📍 Ты здесь');
  });

  function go(step) {
    $$('.dstep').forEach(s => s.classList.toggle('active', s.dataset.dstep === step));
    $('#dsheet').scrollTop = 0;
  }

  // ---------- SETUP ----------
  function renderSetup() {
    $('#dName').value = prof.name; $('#dBike').value = prof.bike; $('#dPlate').value = prof.plate;
    $('#dVeh').innerHTML = VEHICLES.map(v => `<button class="chip ${v.id === prof.veh ? 'on' : ''}" data-id="${v.id}">${v.em} ${v.n}</button>`).join('');
    $$('#dVeh .chip').forEach(b => b.onclick = () => { prof.veh = b.dataset.id; renderSetup(); });
  }
  $('#dStart').onclick = () => {
    prof.name = $('#dName').value.trim() || 'Райдер';
    prof.bike = $('#dBike').value.trim() || 'Мотоцикл';
    prof.plate = $('#dPlate').value.trim().toUpperCase() || '000 ZHL 02';
    store.set('driver', prof);
    me.setIcon(icon(vehBy(prof.veh).em, 'mk-drv me', [40, 40]));
    syncDrawer();
    go('online'); setOnline(true);
  };

  // ---------- ONLINE ----------
  function setOnline(on) {
    st.online = on;
    $('#dOnline').classList.toggle('on', on);
    $('#dOnline span').textContent = on ? 'На линии' : 'Не на линии';
    T.clear();
    if (on) { spawnOrder(); T.every(() => st.orders.size < 4 && spawnOrder(), 5500); }
    else { [...st.orders.keys()].forEach(removeOrder); }
    renderOrders();
  }
  $('#dOnline').onclick = () => setOnline(!st.online);

  function spawnOrder() {
    const v = vehBy(prof.veh);
    const from = [st.pos[0] + rnd(-.012, .012), st.pos[1] + rnd(-.016, .016)];
    const dest = pick(PLACES);
    const km = hav(from, dest.c) * 1.3;
    if (km < 1) return;
    const rec = priceFor(v, km);
    const mode = Math.random() < .55 ? 'bargain' : 'fast';
    const o = {
      id: Math.random().toString(36).slice(2, 8), name: pick(PASSENGERS), rating: rnd(4.5, 5).toFixed(1),
      from, fromName: pick(PICKUPS), dest, km, rec, mode,
      price: mode === 'fast' ? rec : round50(rec * rnd(.75, 1.05)),
      pay: pick(['💵 Наличные', '🔴 Kaspi', '💳 Карта']), helmet: Math.random() < .7, ttl: 20, state: 'new',
    };
    o.pin = L.marker(from, { icon: L.divIcon({ html: `<span>${fmt(o.price)}</span>`, className: 'mk-order ' + mode, iconSize: [84, 30], iconAnchor: [42, 34] }) }).addTo(layer);
    o.pin.on('click', () => document.getElementById('o-' + o.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    st.orders.set(o.id, o);
    T.later(() => { if (st.orders.get(o.id)?.state === 'new') { removeOrder(o.id); renderOrders(); } }, o.ttl * 1000);
    renderOrders();
    try { navigator.vibrate && navigator.vibrate(40); } catch {}
  }
  function removeOrder(id) {
    const o = st.orders.get(id); if (!o) return;
    layer.removeLayer(o.pin); st.orders.delete(id);
  }

  function renderOrders() {
    const box = $('#dOrders');
    $('#dOrdersMeta').textContent = st.online ? `${st.orders.size} рядом · ${vehBy(prof.veh).em} ${vehBy(prof.veh).n}` : '';
    if (!st.online) { box.innerHTML = '<div class="empty">😴 Ты не на линии. Включи статус, чтобы получать заказы.</div>'; return; }
    if (!st.orders.size) { box.innerHTML = '<div class="empty"><span class="radar"></span>Ищем пассажиров рядом…</div>'; return; }
    box.innerHTML = [...st.orders.values()].reverse().map(o => {
      const toPick = hav(st.pos, o.from);
      const diff = o.price - o.rec;
      const btns = o.state === 'wait'
        ? `<div class="wait">⏳ Ждём ответа пассажира… <b>${fmt(o.myPrice)}</b></div>`
        : o.mode === 'fast'
          ? `<button class="cta sm" data-act="take" data-id="${o.id}">⚡ Принять · ${fmt(o.price)}</button>`
          : `<div class="counter">
               <button class="cta sm" data-act="take" data-id="${o.id}">Принять ${fmt(o.price)}</button>
               ${[100, 200, 300].map(x => `<button class="chip" data-act="counter" data-x="${x}" data-id="${o.id}">${fmt(o.price + x)}</button>`).join('')}
             </div>`;
      return `<div class="order ${o.mode}" id="o-${o.id}">
        <div class="o-top">
          <span class="o-mode">${o.mode === 'fast' ? '⚡ Быстро' : '🤝 Торг'}</span>
          <span class="o-pass">${o.name} · ★ ${o.rating}</span>
          <b class="o-price">${fmt(o.price)}</b>
        </div>
        <div class="o-route">
          <div><i class="d1"></i>${o.fromName}<small>${toPick.toFixed(1)} км · ${Math.max(1, Math.round(toPick / .5))} мин до тебя</small></div>
          <div><i class="d2"></i>${o.dest.n}<small>${o.km.toFixed(1)} км поездка</small></div>
        </div>
        <div class="o-meta">${o.pay}${o.helmet ? ' · 🪖 нужен шлем' : ''}${o.mode === 'bargain' ? ` · ${diff < 0 ? `ниже рекоменд. на ${fmt(-diff)}` : 'хорошая цена'}` : ''}</div>
        ${btns}
        ${o.state === 'new' ? `<i class="o-timer" style="animation-duration:${o.ttl}s"></i>` : ''}
      </div>`;
    }).join('');
    $$('#dOrders [data-act]').forEach(b => b.onclick = () => {
      const o = st.orders.get(b.dataset.id); if (!o) return;
      b.dataset.act === 'take' ? take(o, o.price) : counter(o, o.price + +b.dataset.x);
    });
  }

  function take(o, price) {
    // в быстром режиме иногда кто-то успевает раньше
    if (o.mode === 'fast' && Math.random() < .12) { removeOrder(o.id); renderOrders(); toast('😅 Другой райдер успел раньше'); return; }
    startRide(o, price);
  }
  function counter(o, price) {
    o.state = 'wait'; o.myPrice = price; renderOrders();
    const over = (price - o.price) / o.price;
    const chance = Math.max(.15, .85 - over * 2.2);
    T.later(() => {
      if (!st.orders.has(o.id)) return;
      if (Math.random() < chance) { toast(`🤝 ${o.name} согласился на ${fmt(price)}`); startRide(o, price); }
      else { removeOrder(o.id); renderOrders(); toast(`${o.name} выбрал другого райдера`); }
    }, rnd(1800, 3500));
  }

  // ---------- TRIP ----------
  function startRide(o, price) {
    T.clear();
    [...st.orders.keys()].filter(id => id !== o.id).forEach(removeOrder);
    removeOrder(o.id);
    st.ride = { ...o, final: price };
    $('#pAvatar').textContent = o.name[0];
    $('#pName').textContent = o.name;
    $('#pRating').textContent = `★ ${o.rating} · пассажир`;
    $('#pRoute').textContent = `${o.fromName} → ${o.dest.n}`;
    $('#pPrice').textContent = fmt(price);
    $('#pTags').innerHTML = [o.pay, o.helmet ? '🪖 Взять шлем' : '🪖 Шлем не нужен', `${o.km.toFixed(1)} км`, o.mode === 'fast' ? '⚡ Быстро' : '🤝 Торг']
      .map(t => `<span>${t}</span>`).join('');
    $('#dCancelConfirm').hidden = true;
    go('trip');

    pickM = L.marker(o.from, { icon: icon('', 'mk-me', [20, 20]) }).addTo(layer);
    destM = L.marker(o.dest.c, { icon: icon('', 'mk-dest', [18, 18]) }).addTo(layer);
    const a = curve(st.pos, o.from, 30), b = curve(o.from, o.dest.c, 40);
    routeA = L.polyline(a, { color: '#c084fc', weight: 5, dashArray: '2 10', lineCap: 'round' }).addTo(layer);
    routeB = L.polyline(b, { color: '#9333ea', weight: 6, opacity: .9 }).addTo(layer);
    map.fitBounds(L.latLngBounds([...a, ...b]), { paddingTopLeft: [40, 90], paddingBottomRight: [40, window.innerHeight * .55] });

    stage('toPickup');
    stopAnim = animate(me, a, 5000, () => stage('atPickup'), p => { st.pos = p; });
  }

  function stage(s) {
    const r = st.ride; st.stage = s;
    const btn = $('#dAction');
    btn.disabled = false;
    if (s === 'toPickup') {
      $('#dBanner').innerHTML = `🏍️ Едешь к пассажиру · <b>${r.fromName}</b>`;
      btn.textContent = 'В пути к пассажиру…'; btn.disabled = true;
    } else if (s === 'atPickup') {
      $('#dBanner').innerHTML = `📍 Ты на точке. Сообщи ${r.name}, что приехал`;
      btn.textContent = 'Я на месте';
    } else if (s === 'waiting') {
      $('#dBanner').innerHTML = `🪖 ${r.name} надевает шлем и садится…`;
      btn.textContent = 'Начать поездку';
    } else if (s === 'riding') {
      $('#dBanner').innerHTML = `⚡ Мчим к <b>${r.dest.n}</b> · ${r.km.toFixed(1)} км`;
      btn.textContent = 'В пути…'; btn.disabled = true;
      map.removeLayer(routeA);
      stopAnim = animate(me, routeB.getLatLngs().map(p => [p.lat, p.lng]), 8000, () => stage('arrived'), p => { st.pos = p; });
    } else if (s === 'arrived') {
      $('#dBanner').innerHTML = `🏁 Вы на месте: <b>${r.dest.n}</b>`;
      btn.textContent = `Завершить · получить ${fmt(r.final)}`;
    }
  }
  $('#dAction').onclick = () => {
    const next = { atPickup: 'waiting', waiting: 'riding', arrived: 'finish' }[st.stage];
    if (next === 'finish') finish(); else if (next) stage(next);
  };
  $('#dCancel').onclick = () => { $('#dCancelConfirm').hidden = false; };
  $('#dCancelNo').onclick = () => { $('#dCancelConfirm').hidden = true; };
  $('#dCancelYes').onclick = () => { clearRide(); go('online'); setOnline(true); toast('Заказ отменён'); };

  function clearRide() {
    stopAnim && stopAnim(); TT.clear();
    [routeA, routeB, pickM, destM].forEach(m => m && layer.removeLayer(m));
    routeA = routeB = pickM = destM = null;
    st.ride = null; st.stage = null;
  }

  function finish() {
    const r = st.ride;
    const tip = Math.random() < .4 ? pick([200, 300, 500]) : 0;
    st.earned += r.final + tip; st.trips += 1;
    $('#dDoneTitle').textContent = `+${fmt(r.final + tip)}`;
    $('#dDoneSub').textContent = `${r.name} оценил(а) поездку на 5 ★${tip ? ` и оставил(а) чаевые ${fmt(tip)}` : ''} · ${r.km.toFixed(1)} км за ${minsFor(vehBy(prof.veh), r.km)} мин`;
    $('#dEarn').textContent = fmt(st.earned);
    $('#dTrips').textContent = `${st.trips} ${st.trips === 1 ? 'поездка' : st.trips < 5 ? 'поездки' : 'поездок'} сегодня`;
    clearRide();
    go('done');
  }
  $('#dDoneBtn').onclick = () => { go('online'); setOnline(true); map.flyTo(st.pos, 14); };

  function syncDrawer() {
    $('#drawerAvatar').textContent = prof.name[0] || 'R';
    $('#drawerName').textContent = prof.name;
    $('#drawerSub').textContent = `${vehBy(prof.veh).em} ${prof.bike} · ★ 4.92`;
  }

  return {
    enter() {
      layer.addTo(map); syncDrawer(); renderSetup();
      map.flyTo(st.pos, 14);
      if (st.ride) go('trip'); else if (st.online || store.get('driver')) { go('online'); setOnline(true); } else go('setup');
    },
    leave() { T.clear(); setOnline(false); clearRide(); map.removeLayer(layer); },
    locate() { map.flyTo(st.pos, 15); },
  };
})();

// ---------- переключение ролей ----------
(() => {
  const { $, $$, toast } = Z;
  let role = null;
  const toggleDrawer = on => { $('#drawer').classList.toggle('open', on); $('#scrim').classList.toggle('on', on); };
  function setRole(r) {
    if (r === role) return;
    if (role) (role === 'driver' ? Driver : Passenger).leave();
    role = r;
    $('#app').className = 'mode-' + r;
    $('#roleSwitch').textContent = r === 'driver' ? '🧍 Режим пассажира' : '🏍️ Стать райдером';
    if (r === 'passenger') { $('#drawerAvatar').textContent = 'A'; $('#drawerName').textContent = 'Пассажир'; $('#drawerSub').textContent = '★ 4.95'; }
    (r === 'driver' ? Driver : Passenger).enter();
    const h = r === 'driver' ? '#driver' : '';
    if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
  }
  $('#menuBtn').onclick = () => toggleDrawer(true);
  $('#scrim').onclick = () => toggleDrawer(false);
  $('#roleSwitch').onclick = () => { toggleDrawer(false); setRole(role === 'driver' ? 'passenger' : 'driver'); };
  $$('.dr-item:not(.role-switch)').forEach(a => a.onclick = () => { toggleDrawer(false); toast('Скоро будет 😉'); });
  $('#locateBtn').onclick = () => (role === 'driver' ? Driver : Passenger).locate();
  window.addEventListener('hashchange', () => setRole(location.hash === '#driver' ? 'driver' : 'passenger'));
  setRole(location.hash === '#driver' ? 'driver' : 'passenger');
})();
