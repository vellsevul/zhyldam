// Zhyldam: режим райдера. Живые заказы пассажиров через room + симулированные.
window.Driver = (() => {
  const { $, $$, DEFAULT_HOME, PLACES, VEHICLES, hav, fmt, round50, rnd, pick, vehBy, priceFor, store, toast, esc, map, icon, animate, timers } = Z;
  const T = timers();

  const PASSENGERS = ['Айгерим', 'Дана', 'Алихан', 'Санжар', 'Жанна', 'Мирас', 'Камила', 'Ерасыл', 'Томирис', 'Нурсултан', 'Алина', 'Диас'];
  const prof = Object.assign({ name: 'Ерлан', bike: 'Honda CB500F', veh: 'moto', plate: '777 ZHL 02', helmet: false, rating: '4.92', trips: 318 }, store.get('driver', {}));
  const st = { online: false, pos: [DEFAULT_HOME[0] + .004, DEFAULT_HOME[1] - .006], orders: new Map(), ride: null, stage: null, earned: 0, trips: 0, saved: null, lostAt: 0 };
  const today = new Date().toDateString();
  const hist = (store.get('history', []) || []).filter(t => t.role === 'driver' && new Date(t.at).toDateString() === today && t.status !== 'cancelled');
  st.earned = hist.reduce((s, t) => s + t.total, 0); st.trips = hist.length;

  const layer = L.layerGroup();
  const me = L.marker(st.pos, { icon: icon(vehBy(prof.veh).em, 'mk-drv me', [40, 40]), zIndexOffset: 2000 }).addTo(layer);
  let routeA = null, routeB = null, pickM = null, destM = null, stopAnim = null;

  map.on('click', e => {
    if (!map.hasLayer(layer) || st.ride) return;
    if (st.gpsOn) { toast('📡 Позиция берётся из GPS'); return; }
    st.pos = [e.latlng.lat, e.latlng.lng];
    me.setLatLng(st.pos); publish(); renderOrders();
    toast('📍 Ты здесь');
  });

  function go(step) {
    $$('.dstep').forEach(s => s.classList.toggle('active', s.dataset.dstep === step));
    $('#dsheet').scrollTop = 0;
  }

  // ---------- presence ----------
  const pubProfile = () => ({ name: prof.name, bike: prof.bike, veh: prof.veh, em: vehBy(prof.veh).em, plate: prof.plate, rating: prof.rating, trips: prof.trips });
  function publish(extra = {}) {
    const r = st.ride, live = r && r.live;
    Live.set({
      role: 'driver', profile: pubProfile(), online: st.online,
      loc: st.online ? LL(st.pos) : null,
      trip: live ? { ride: r.id, stage: st.stage } : null,
      ...extra,
    });
  }

  // ---------- профиль ----------
  function renderSetup() {
    $('#dName').value = prof.name; $('#dBike').value = prof.bike; $('#dPlate').value = prof.plate;
    $('#dHelmet').checked = !!prof.helmet;
    $('#dVeh').innerHTML = VEHICLES.map(v => `<button class="chip ${v.id === prof.veh ? 'on' : ''}" data-id="${v.id}">${v.em} ${v.n}</button>`).join('');
    $$('#dVeh .chip').forEach(b => b.onclick = () => { prof.veh = b.dataset.id; renderSetup(); });
  }
  $('#dHelmet').onchange = () => $('#dHelmetRow').classList.remove('bad');
  $('#dStart').onclick = () => {
    if (!$('#dHelmet').checked) { $('#dHelmetRow').classList.add('bad'); toast('🪖 Сначала подтверди, что возишь шлем для пассажира'); return; }
    prof.name = $('#dName').value.trim() || 'Райдер';
    prof.bike = $('#dBike').value.trim() || 'Мотоцикл';
    prof.plate = $('#dPlate').value.trim().toUpperCase() || '000 ZHL 02';
    prof.helmet = true;
    store.set('driver', prof);
    me.setIcon(icon(vehBy(prof.veh).em, 'mk-drv me', [40, 40]));
    syncDrawer();
    go('online'); setOnline(true);
  };

  // ---------- на линии ----------
  function setOnline(on) {
    st.online = on;
    $('#dOnline').classList.toggle('on', on);
    $('#dOnline span').textContent = on ? 'На линии' : 'Не на линии';
    T.clear();
    if (on) { T.later(spawnBot, 1500); T.every(() => [...st.orders.values()].filter(o => !o.live).length < 3 && spawnBot(), 6500); }
    else [...st.orders.keys()].forEach(removeOrder);
    publish({ offer: null, claim: null });
    renderOrders(); syncEarn();
  }
  $('#dOnline').onclick = () => setOnline(!st.online);
  function syncEarn() {
    $('#dEarn').textContent = fmt(st.earned);
    $('#dTrips').textContent = `${st.trips} ${st.trips % 10 === 1 && st.trips !== 11 ? 'поездка' : [2, 3, 4].includes(st.trips % 10) && !(st.trips > 10 && st.trips < 15) ? 'поездки' : 'поездок'} сегодня`;
  }

  function addPin(o) {
    o.pin = L.marker(o.from, { icon: L.divIcon({ html: `<span>${fmt(o.price)}</span>`, className: `mk-order ${o.mode}${o.live ? ' live' : ''}`, iconSize: [84, 30], iconAnchor: [42, 34] }) }).addTo(layer);
    o.pin.on('click', () => document.getElementById('o-' + o.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }
  function spawnBot() {
    if (!st.online || st.ride) return;
    const v = vehBy(prof.veh);
    const from = [st.pos[0] + rnd(-.012, .012), st.pos[1] + rnd(-.016, .016)];
    const dest = pick(PLACES);
    const tr = Z.trip(from, dest.c, v);
    if (tr.km < 1) return;
    const rec = priceFor(v, tr.km, tr.jam), mode = Math.random() < .55 ? 'bargain' : 'fast';
    const o = {
      id: Math.random().toString(36).slice(2, 8), live: false, name: pick(PASSENGERS), rating: rnd(4.5, 5).toFixed(1),
      from, fromName: Z.addressOf(from), to: dest.c, toName: dest.n, km: tr.km, rec, mode, share: Math.random() < .5,
      price: mode === 'fast' ? rec : round50(rec * rnd(.75, 1.05)), pay: pick(['💵 Наличные', '🔴 Kaspi перевод', '💳 Visa •••• 4242']), state: 'new', ttl: 20,
    };
    addPin(o); st.orders.set(o.id, o);
    T.later(() => { if (st.orders.get(o.id)?.state === 'new') { removeOrder(o.id); renderOrders(); } }, o.ttl * 1000);
    renderOrders(); Account.vibrate(40);
  }
  function removeOrder(id) { const o = st.orders.get(id); if (!o) return; layer.removeLayer(o.pin); st.orders.delete(id); }

  // живые заказы
  Live.on(() => {
    if (!map.hasLayer(layer)) return;
    if (st.ride && st.ride.live) return trackPassenger();
    if (!st.online) return;
    const seen = new Set();
    for (const p of Live.passengers()) {
      const r = p.presence.ride;
      if (r.veh !== prof.veh) continue;
      const mine = r.driver && r.driver === Live.myPeer();
      if (r.status !== 'searching' && !mine) continue;
      seen.add(r.id);
      let o = st.orders.get(r.id);
      if (!o) {
        o = { id: r.id, live: true, peer: p.peer, name: r.name || 'Пассажир', rating: '5.0', from: r.from, fromName: r.fromName, to: r.to, toName: r.toName,
          km: +r.km, rec: priceFor(vehBy(r.veh), +r.km), mode: r.mode, price: r.price, pay: r.pay, share: r.share, state: 'new' };
        addPin(o); st.orders.set(o.id, o); Account.vibrate(60); toast(`🟢 Живой заказ от ${r.name || 'пассажира'}`);
      } else if (o.price !== r.price) { o.price = r.price; layer.removeLayer(o.pin); addPin(o); if (o.state === 'wait' && o.myPrice <= r.price) o.state = 'new'; }
      o.share = r.share;
      if (mine && o.state === 'wait') startRide(o, r.finalPrice || o.myPrice || r.price);
    }
    for (const [id, o] of st.orders) if (o.live && !seen.has(id)) {
      if (o.state === 'wait') toast(`${o.name} выбрал(а) другого райдера`);
      removeOrder(id);
    }
    renderOrders();
  });

  function renderOrders() {
    const box = $('#dOrders');
    $('#dOrdersMeta').textContent = st.online ? `${st.orders.size} рядом · ${vehBy(prof.veh).em} ${vehBy(prof.veh).n}` : '';
    if (!st.online) { box.innerHTML = '<div class="empty">😴 Ты не на линии. Включи статус, чтобы получать заказы.</div>'; return; }
    if (!st.orders.size) { box.innerHTML = '<div class="empty"><span class="radar"></span>Ищем пассажиров рядом…</div>'; return; }
    const list = [...st.orders.values()].sort((a, b) => (b.live - a.live));
    box.innerHTML = list.map(o => {
      const toPick = hav(st.pos, o.from), diff = o.price - o.rec;
      const btns = o.state === 'wait'
        ? `<div class="wait">⏳ Ждём ответа пассажира… <b>${fmt(o.myPrice)}</b></div>`
        : o.mode === 'fast'
          ? `<button class="cta sm" data-act="take" data-id="${o.id}">⚡ Принять · ${fmt(o.price)}</button>`
          : `<div class="counter">
               <button class="cta sm" data-act="take" data-id="${o.id}">Принять ${fmt(o.price)}</button>
               ${[100, 200, 300].map(x => `<button class="chip" data-act="counter" data-x="${x}" data-id="${o.id}">${fmt(o.price + x)}</button>`).join('')}
             </div>`;
      return `<div class="order ${o.mode}${o.live ? ' live' : ''}" id="o-${o.id}">
        <div class="o-top">
          <span class="o-mode">${o.mode === 'fast' ? '⚡ Быстро' : '🤝 Торг'}</span>
          <span class="o-pass">${o.live ? '🟢 ' : ''}${esc(o.name)} · ★ ${esc(o.rating)}</span>
          <b class="o-price">${fmt(o.price)}</b>
        </div>
        <div class="o-route">
          <div><i class="d1"></i>${esc(o.fromName)}<small>${toPick.toFixed(1)} км · ${Math.max(1, Math.round(toPick / .55))} мин до пассажира</small></div>
          <div><i class="d2"></i>${esc(o.toName)}<small>${(+o.km).toFixed(1)} км поездка</small></div>
        </div>
        <div class="o-meta">${esc(o.pay)} · ${o.share ? '📍 показывает, где стоит' : '📍 только точка посадки'}${o.mode === 'bargain' ? ` · ${diff < 0 ? `ниже рекоменд. на ${fmt(-diff)}` : 'хорошая цена'}` : ''}</div>
        ${btns}
        ${o.state === 'new' && !o.live ? `<i class="o-timer" style="animation-duration:${o.ttl}s"></i>` : ''}
      </div>`;
    }).join('');
    $$('#dOrders [data-act]').forEach(b => b.onclick = () => {
      const o = st.orders.get(b.dataset.id); if (!o) return;
      b.dataset.act === 'take' ? take(o, o.price) : counter(o, o.price + +b.dataset.x);
    });
  }

  function take(o, price) {
    if (o.live) {
      o.state = 'wait'; o.myPrice = price;
      publish(o.mode === 'fast' ? { claim: o.id, offer: null } : { offer: { ride: o.id, price }, claim: null });
      renderOrders();
      T.later(() => { if (st.orders.get(o.id)?.state === 'wait' && !st.ride) { o.state = 'new'; publish({ claim: null }); renderOrders(); } }, 30000);
      return;
    }
    if (o.mode === 'fast' && Math.random() < .12) { removeOrder(o.id); renderOrders(); toast('😅 Другой райдер успел раньше'); return; }
    startRide(o, price);
  }
  function counter(o, price) {
    if (o.live) return take(o, price);
    o.state = 'wait'; o.myPrice = price; renderOrders();
    const chance = Math.max(.15, .85 - (price - o.price) / o.price * 2.2);
    T.later(() => {
      if (!st.orders.has(o.id)) return;
      if (Math.random() < chance) { toast(`🤝 ${o.name} согласился на ${fmt(price)}`); startRide(o, price); }
      else { removeOrder(o.id); renderOrders(); toast(`${o.name} выбрал другого райдера`); }
    }, rnd(1800, 3500));
  }

  // ---------- поездка ----------
  async function startRide(o, price) {
    T.clear();
    [...st.orders.keys()].forEach(removeOrder);
    st.ride = { ...o, final: price }; st.saved = null; st.lostAt = 0;
    Account.paintAvatar($('#pAvatar'), o.name, null);
    $('#pName').textContent = o.name;
    $('#pRating').textContent = `★ ${o.rating} · ${o.live ? '🟢 живой пассажир' : 'пассажир'}`;
    $('#pRoute').textContent = `${o.fromName} → ${o.toName}`;
    $('#pPrice').textContent = fmt(price);
    syncTags();
    $('#dCancelConfirm').hidden = true;
    go('trip');

    pickM = L.marker(o.from, { icon: icon('', 'mk-me pulse', [20, 20]) }).addTo(layer);
    destM = L.marker(o.to, { icon: icon('', 'mk-dest', [18, 18]) }).addTo(layer);
    const v = vehBy(prof.veh), ride = st.ride;
    $('#dBanner').textContent = 'Строим маршрут…'; $('#dAction').disabled = true;
    const [ra, rb] = await Promise.all([Z.routeAsync(st.pos, o.from, 'moto', v.speed), Z.tripAsync(o.from, o.to, v)]);
    if (st.ride !== ride) return;
    st.ride.a = ra; st.ride.b = rb;
    routeA = Z.drawRoute(layer, st.ride.a, { color: '#c084fc', dashed: true });
    routeB = Z.drawRoute(layer, st.ride.b);
    map.fitBounds(L.latLngBounds([...st.ride.a.pts, ...st.ride.b.pts]), { paddingTopLeft: [40, 110], paddingBottomRight: [40, Math.round(window.innerHeight * .55)] });

    stage('toPickup');
    if (!st.gpsOn) stopAnim = animate(me, st.ride.a.pts, 6000, () => stage('atPickup'), p => { st.pos = p; publishLoc(); });
  }
  // ---------- настоящий GPS райдера ----------
  let gpsT = 0;
  function onGps({ ll, acc }) {
    const first = !st.gpsOn;
    st.gpsOn = true; st.acc = acc;
    if (first) { toast(`📡 GPS включён, точность ±${acc} м`); stopAnim && stopAnim(); }
    st.pos = ll; me.setLatLng(ll); publishLoc(); syncGpsMeta();
    const r = st.ride; if (!r || !r.a) return;
    const n = Date.now(); if (n - gpsT < 2000) return; gpsT = n;
    const sp = vehBy(prof.veh).speed;
    if (st.stage === 'toPickup') {
      const left = hav(ll, r.from);
      if (left < .06) return stage('atPickup');
      r.a.min = Math.max(1, Math.round(left * 1.3 / sp * 60 * 1.25));
      $('#dBanner').innerHTML = `🏍️ Едешь к пассажиру · <b>${esc(r.fromName)}</b> · ${(left * 1000).toFixed(0)} м · ${r.a.min} мин`;
    } else if (st.stage === 'riding') {
      const left = hav(ll, r.to);
      if (left < .08) return stage('arrived');
      $('#dBanner').innerHTML = `⚡ Мчим к <b>${esc(r.toName)}</b> · осталось ${left.toFixed(1)} км · ~${Math.max(1, Math.round(left * 1.3 / sp * 60 * 1.25))} мин`;
    }
  }
  const syncGpsMeta = () => { const el = $('#dGps'); if (el) el.textContent = st.gpsOn ? `📡 GPS · ±${st.acc} м` : '📍 Демо-позиция: нажми на карту, чтобы переместиться'; };
  Z.watch(onGps, () => { st.gpsOn = false; syncGpsMeta(); });
  let locT = 0;
  const publishLoc = () => { const n = performance.now(); if (n - locT > 120) { locT = n; publish(); } };
  function syncTags() {
    const o = st.ride;
    $('#pTags').innerHTML = [o.pay, '🪖 Шлем для пассажира', `${(+o.km).toFixed(1)} км`, o.mode === 'fast' ? '⚡ Быстро' : '🤝 Торг', o.share ? '📍 Пассажир виден на карте' : '📍 Только точка посадки']
      .map(t => `<span>${esc(t)}</span>`).join('');
  }

  function stage(s) {
    const r = st.ride; st.stage = s;
    const btn = $('#dAction'); btn.disabled = false;
    if (s === 'toPickup') { $('#dBanner').innerHTML = `🏍️ Едешь к пассажиру · <b>${esc(r.fromName)}</b> · ${r.a.min} мин`; btn.textContent = st.gpsOn ? 'Я на месте' : 'В пути к пассажиру…'; btn.disabled = !st.gpsOn; }
    else if (s === 'atPickup') { $('#dBanner').innerHTML = `📍 Ты на точке. Достань шлем 🪖 и сообщи ${esc(r.name)}, что приехал`; btn.textContent = 'Я на месте'; }
    else if (s === 'waiting') { $('#dBanner').innerHTML = `🪖 Дай пассажиру шлем и проверь застёжку`; btn.textContent = 'Пассажир в шлеме, поехали'; }
    else if (s === 'riding') {
      $('#dBanner').innerHTML = `⚡ Мчим к <b>${esc(r.toName)}</b> · ${r.b.km.toFixed(1)} км · ${r.b.min} мин`;
      btn.textContent = st.gpsOn ? 'Приехали' : 'В пути…'; btn.disabled = !st.gpsOn;
      layer.removeLayer(routeA); layer.removeLayer(pickM);
      if (!st.gpsOn) stopAnim = animate(me, r.b.pts, 9000, () => stage('arrived'), p => { st.pos = p; publishLoc(); });
    } else if (s === 'arrived') { $('#dBanner').innerHTML = `🏁 Вы на месте: <b>${esc(r.toName)}</b>. Забери шлем`; btn.textContent = `Завершить · получить ${fmt(r.final)}`; }
    publish();
  }
  $('#dAction').onclick = () => {
    if (st.stage === 'toPickup' && st.gpsOn) stage('atPickup');
    else if (st.stage === 'riding' && st.gpsOn) stage('arrived');
    else if (st.stage === 'atPickup') stage('waiting');
    else if (st.stage === 'waiting') stage('riding');
    else if (st.stage === 'arrived') finish();
  };
  // живой пассажир: включил/выключил геопозицию, отменил, ушёл
  function trackPassenger() {
    const r = st.ride, p = Live.peer(r.peer);
    const ride = p?.presence?.ride;
    if (!ride || ride.id !== r.id || ride.status === 'cancelled') {
      if (st.stage === 'arrived' || st.saved) return;
      if (!st.lostAt) { st.lostAt = Date.now(); T.later(trackPassenger, 8500); return; }
      if (Date.now() - st.lostAt < 8000) return;
      toast('Пассажир отменил поездку'); record('cancelled'); clearRide(); go('online'); setOnline(true); return;
    }
    st.lostAt = 0;
    if (ride.share !== r.share) { r.share = ride.share; syncTags(); publish(); toast(r.share ? '📍 Пассажир показал геопозицию' : 'Пассажир скрыл геопозицию'); }
    if (r.share && p.presence.loc && pickM && map.hasLayer(pickM)) pickM.setLatLng(p.presence.loc);
    Account.redrawChat();
  }

  $('#pCall').onclick = () => st.ride && Account.openPanel('call', { name: st.ride.name, sub: 'пассажир', phone: st.ride.phone ||= Account.fakePhone() });
  $('#pChat').onclick = () => {
    const r = st.ride; if (!r) return;
    Account.openPanel('chat', {
      id: r.id, name: r.name, quick: ['Подъезжаю 🏍️', 'Я на месте', 'Шлем у меня', 'Где вы стоите?'],
      bot: ['Хорошо, выхожу!', 'Стою у входа', 'Спасибо, жду', 'Я в белой куртке'],
      theirs: r.live ? () => { const p = Live.peer(r.peer)?.presence; return p?.chat?.ride === r.id ? p.chat.msgs : []; } : null,
      onSend: msgs => { if (r.live) Live.set({ chat: { ride: r.id, msgs: msgs.slice(-6).map(m => ({ text: m.text.slice(0, 140), at: m.at })) } }); },
    });
  };
  $('#dCancel').onclick = () => { $('#dCancelConfirm').hidden = false; };
  $('#dCancelNo').onclick = () => { $('#dCancelConfirm').hidden = true; };
  $('#dCancelYes').onclick = () => {
    if (st.ride?.live) { st.stage = 'cancelled'; publish(); }
    record('cancelled');
    T.later(() => { clearRide(); go('online'); setOnline(true); }, 300);
    toast('Заказ отменён');
  };

  function clearRide() {
    stopAnim && stopAnim(); stopAnim = null;
    [routeA, routeB, pickM, destM].forEach(m => m && layer.removeLayer(m));
    routeA = routeB = pickM = destM = null;
    st.ride = null; st.stage = null;
    publish({ offer: null, claim: null, chat: null });
  }

  function record(status) {
    const r = st.ride; if (!r || st.saved) return st.saved;
    const v = vehBy(prof.veh), done = status !== 'cancelled';
    st.saved = Account.addHistory({
      role: 'driver', status, fromName: r.fromName, toName: r.toName, from: r.from, to: r.to,
      km: r.b ? r.b.km : +r.km, min: r.b ? r.b.min : 0, carMin: r.b ? r.b.carMin : 0, jamScore: r.b ? r.b.score : 0, veh: prof.veh, mode: r.mode,
      fare: r.final, base: v.base, dist: Math.max(0, r.final - v.base), jamFee: 0, tip: done ? r.tip || 0 : 0, total: done ? r.final + (r.tip || 0) : 0,
      pay: { label: String(r.pay || '').replace(/^\S+\s/, '') }, who: { name: r.name, rating: r.rating }, live: !!r.live, rating: 5,
    });
    return st.saved;
  }

  function finish() {
    const r = st.ride;
    r.tip = !r.live && Math.random() < .4 ? pick([200, 300, 500]) : 0;
    if (r.live) { st.stage = 'done'; publish(); }
    const rec = record('done');
    st.earned += r.final + r.tip; st.trips += 1; prof.trips += 1; store.set('driver', prof);
    $('#dDoneTitle').textContent = `+${fmt(r.final + r.tip)}`;
    $('#dDoneSub').textContent = `${r.name} оценил(а) поездку на 5 ★${r.tip ? ` и оставил(а) чаевые ${fmt(r.tip)}` : ''} · ${r.b.km.toFixed(1)} км за ${r.b.min} мин. Не забудь забрать шлем 🪖`;
    $('#dReceiptBtn').onclick = () => Account.openPanel('receipt', { id: rec.id });
    syncEarn();
    T.later(() => clearRide(), 1500);
    go('done');
  }
  $('#dDoneBtn').onclick = () => { if (st.ride) clearRide(); go('online'); setOnline(true); Z.centerOn(st.pos, 14); };

  function syncDrawer() {
    Account.paintAvatar($('#drawerAvatar'), prof.name, Account.me()?.avatar);
    $('#drawerName').textContent = prof.name;
    $('#drawerSub').textContent = `${vehBy(prof.veh).em} ${prof.bike} · ★ ${prof.rating}`;
  }

  return {
    enter() {
      layer.addTo(map); syncDrawer(); renderSetup(); syncEarn(); syncGpsMeta();
      Z.centerOn(st.pos, 14);
      if (st.ride) go('trip'); else if (prof.helmet && store.get('driver')) { go('online'); setOnline(true); } else go('setup');
    },
    leave() { T.clear(); if (st.ride) { if (st.ride.live) { st.stage = 'cancelled'; publish(); } clearRide(); } setOnline(false); Live.set({ role: null, online: false, loc: null, profile: null }); map.removeLayer(layer); },
    locate() { Z.centerOn(st.pos, 15); },
  };
})();

// ---------- переключение ролей ----------
(() => {
  const { $, $$, toast } = Z;
  let role = null;
  function setRole(r) {
    if (r === role) return;
    if (role) (role === 'driver' ? Driver : Passenger).leave();
    role = r;
    $('#app').className = 'mode-' + r;
    $('#roleSwitch').textContent = r === 'driver' ? '🧍 Режим пассажира' : '🏍️ Стать райдером';
    if (r === 'passenger') Account.syncUI();
    (r === 'driver' ? Driver : Passenger).enter();
    const h = r === 'driver' ? '#driver' : '';
    if (!/^#ride-/.test(location.hash) && location.hash !== h) { try { history.replaceState(null, '', h || location.pathname + location.search); } catch {} }
  }
  $('#menuBtn').onclick = () => Account.toggleDrawer(true);
  $('#scrim').onclick = () => Account.toggleDrawer(false);
  $('#drawerHead').onclick = () => Account.openPanel('settings');
  $('#roleSwitch').onclick = () => { Account.toggleDrawer(false); setRole(role === 'driver' ? 'passenger' : 'driver'); };
  $('#locateBtn').onclick = () => (role === 'driver' ? Driver : Passenger).locate();
  window.addEventListener('hashchange', () => { if (location.hash === '#driver') setRole('driver'); else if (!location.hash) setRole('passenger'); });
  setRole(location.hash === '#driver' ? 'driver' : 'passenger');
})();
