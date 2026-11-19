// Аккаунт, настройки, оплата, история и чеки, поддержка, безопасность, чат, ссылка на поездку
window.Account = (() => {
  const { $, $$, store, toast, fmt, esc, vehBy } = Z;
  const SHARE_BASE = (() => {
    const h = location.host || '';
    if (/^https?:/.test(location.protocol) && h && !/claudeusercontent|claude\.ai|anthropic|claude\.site/.test(h)) return location.href.split('#')[0];
    return 'https://claude.ai/artifact/QCBoNC88W9YtV85PdQyxkU';
  })();

  // ---------- тема ----------
  function applyTheme() {
    const t = store.get('theme', 'system');
    const root = document.documentElement;
    const sys = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('theme-dark', t === 'dark' || (t === 'system' && sys));
  }
  applyTheme();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch {}
  try { new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}

  // ---------- аккаунт ----------
  const accounts = () => store.get('accounts', {});
  const session = () => store.get('session', null);
  const me = () => (session() && accounts()[session()]) || null;
  const name = () => me()?.name || 'Пассажир';
  const saveMe = patch => { const a = accounts(), s = session(); if (!s || !a[s]) return; Object.assign(a[s], patch); store.set('accounts', a); syncUI(); };
  async function hashPass(p) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('zhyldam:' + p));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { let h = 0; for (const c of 'zhyldam:' + p) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h; }
  }
  function paintAvatar(el, nm, img) {
    if (!el) return;
    if (img) { el.style.backgroundImage = `url("${img}")`; el.textContent = ''; }
    else { el.style.backgroundImage = ''; el.textContent = (nm || '?')[0].toUpperCase(); }
  }
  const readyFns = [];
  function syncUI() {
    if (document.getElementById('app').classList.contains('mode-driver')) return;
    paintAvatar($('#drawerAvatar'), name(), me()?.avatar);
    $('#drawerName').textContent = name();
    $('#drawerSub').textContent = '★ 4.95 · ' + (me()?.login || 'гость');
  }

  // ---------- вход ----------
  let authTab = 'login';
  $$('#authTabs button').forEach(b => b.onclick = () => {
    authTab = b.dataset.tab;
    $$('#authTabs button').forEach(x => x.classList.toggle('on', x === b));
    $('#nameFld').hidden = authTab !== 'register';
    $('#authSubmit').textContent = authTab === 'login' ? 'Войти' : 'Создать аккаунт';
    $('#authPass').autocomplete = authTab === 'login' ? 'current-password' : 'new-password';
    $('#authErr').textContent = '';
  });
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const login = $('#authLogin').value.trim().toLowerCase(), pass = $('#authPass').value, nm = $('#authName').value.trim();
    const err = m => { $('#authErr').textContent = m; };
    const phoneOk = /^\+?[0-9\s()-]{10,}$/.test(login), emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login);
    if (!phoneOk && !emailOk) return err('Введи телефон (+7 …) или email');
    if (pass.length < 6) return err('Пароль должен быть не короче 6 символов');
    const a = accounts(), h = await hashPass(pass);
    if (authTab === 'login') {
      if (!a[login]) return err('Аккаунт не найден. Открой вкладку «Регистрация»');
      if (a[login].hash !== h) return err('Неверный пароль');
    } else {
      if (!nm) return err('Как тебя зовут?');
      if (a[login]) return err('Такой аккаунт уже есть, просто войди');
      a[login] = { login, name: nm, hash: h, phone: phoneOk ? login : '', provider: 'password', created: Date.now() };
      store.set('accounts', a);
    }
    signIn(login);
  });
  $$('.social').forEach(b => b.onclick = () => {
    const p = b.dataset.provider, login = p + ':demo', a = accounts();
    if (!a[login]) { a[login] = { login, name: p === 'google' ? 'Пользователь Google' : 'Пользователь Apple', provider: p, created: Date.now() }; store.set('accounts', a); }
    signIn(login);
    toast(`Вход через ${p === 'google' ? 'Google' : 'Apple'} (демо). Имя можно поменять в настройках`);
  });
  function signIn(login) {
    store.set('session', login);
    $('#auth').hidden = true;
    $('#authPass').value = '';
    syncUI();
    toast(`Привет, ${name()}! ⚡`);
    readyFns.splice(0).forEach(f => f());
  }
  function signOut() { store.set('session', null); closePanel(); $('#auth').hidden = false; }
  function whenSignedIn(fn) { if (me()) fn(); else readyFns.push(fn); }
  if (!me()) $('#auth').hidden = false; else syncUI();

  // ---------- аватар ----------
  let onAvatar = null;
  $('#avatarFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'), s = 160; c.width = c.height = s;
        const k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k;
        c.getContext('2d').drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
        const url = c.toDataURL('image/jpeg', .85);
        onAvatar && onAvatar(url);
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  });
  const pickAvatar = cb => { onAvatar = cb; $('#avatarFile').click(); };

  // ---------- оплата ----------
  const cards = () => store.get('cards', []);
  const PAY_BASE = [{ id: 'cash', ic: '💵', label: 'Наличные', sub: 'Райдеру при выходе' }, { id: 'kaspi', ic: '🔴', label: 'Kaspi перевод', sub: 'Переводишь райдеру по номеру телефона в конце поездки' }];
  const payMethods = () => [...PAY_BASE, ...cards().map(c => ({ id: c.id, ic: '💳', label: `${c.brand} •••• ${c.last4}`, sub: `до ${c.exp} · ${c.holder || 'карта'}` }))];
  const currentPay = () => payMethods().find(m => m.id === store.get('pay', 'cash')) || PAY_BASE[0];
  const payListeners = new Set();
  const setPay = id => { store.set('pay', id); payListeners.forEach(f => f(currentPay())); };
  const brandOf = n => /^4/.test(n) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^220[0-4]/.test(n) ? 'Мир' : /^62/.test(n) ? 'UnionPay' : /^3[47]/.test(n) ? 'Amex' : /^(9860|8600)/.test(n) ? 'Humo' : 'Карта';
  const luhn = n => { let s = 0, dbl = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (dbl) { d *= 2; if (d > 9) d -= 9; } s += d; dbl = !dbl; } return n.length >= 13 && s % 10 === 0; };

  // ---------- история ----------
  const history = () => store.get('history', []);
  function addHistory(t) {
    const h = history(); h.unshift({ id: 't' + Date.now().toString(36), at: Date.now(), ...t });
    store.set('history', h.slice(0, 200));
    return h[0];
  }
  const dateFmt = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeFmt = ts => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  // ---------- панели ----------
  const stack = [];
  function openPanel(name, opts = {}) {
    toggleDrawer(false);
    stack.push([name, opts]);
    render();
  }
  function back() { stack.pop(); stack.length ? render() : closePanel(); }
  function closePanel() { stack.length = 0; $('#panel').hidden = true; chatCtx = null; }
  $('#panelBack').onclick = back;
  function render() {
    const [name, opts] = stack[stack.length - 1];
    const v = VIEWS[name]; if (!v) return closePanel();
    $('#panel').hidden = false;
    $('#panelTitle').textContent = typeof v.title === 'function' ? v.title(opts) : v.title;
    const body = $('#panelBody');
    body.className = 'panel-body' + (v.chat ? ' chat-body' : '');
    body.innerHTML = v.html(opts);
    v.bind && v.bind(body, opts);
    body.scrollTop = 0;
  }
  const rerender = () => stack.length && render();

  const VIEWS = {};

  // --- настройки
  VIEWS.settings = {
    title: 'Настройки',
    html: () => {
      const m = me() || {}, t = store.get('theme', 'system');
      return `
      <div class="profile-top">
        <div class="avatar huge" id="setAv"></div>
        <button id="setAvBtn">Сменить фото</button>
        ${m.avatar ? '<button id="setAvDel" class="muted">Убрать фото</button>' : ''}
      </div>
      <div class="sec-title">Профиль</div>
      <label class="fld"><span>Имя</span><input id="setName" maxlength="30" value="${esc(m.name || '')}"></label>
      <label class="fld"><span>Телефон</span><input id="setPhone" inputmode="tel" placeholder="+7 777 123 45 67" value="${esc(m.phone || '')}"></label>
      <div class="sec-title">Тема</div>
      <div class="seg" id="setTheme">
        <button data-t="light" class="${t === 'light' ? 'on' : ''}">☀️ Светлая</button>
        <button data-t="dark" class="${t === 'dark' ? 'on' : ''}">🌙 Тёмная</button>
        <button data-t="system" class="${t === 'system' ? 'on' : ''}">⚙️ Системная</button>
      </div>
      <div class="sec-title">Приложение</div>
      <div class="list">
        <label class="row"><span class="ic">🚦</span><span class="tx"><b>Пробки на карте</b><small>Цветные улицы и балл пробок</small></span><input type="checkbox" class="switch" id="setTraffic" ${store.get('traffic', true) ? 'checked' : ''}></label>
        <label class="row"><span class="ic">📳</span><span class="tx"><b>Вибрация</b><small>Когда приходит предложение или заказ</small></span><input type="checkbox" class="switch" id="setVibe" ${store.get('vibe', true) ? 'checked' : ''}></label>
        <label class="row"><span class="ic">📍</span><span class="tx"><b>Всегда делиться геопозицией</b><small>Не спрашивать при каждом заказе</small></span><input type="checkbox" class="switch" id="setShare" ${store.get('share', false) ? 'checked' : ''}></label>
      </div>
      <div class="sec-title">Аккаунт</div>
      <div class="list">
        <div class="row"><span class="ic">👤</span><span class="tx"><b>${esc(m.login || '—')}</b><small>${m.provider === 'google' ? 'Вход через Google' : m.provider === 'apple' ? 'Вход через Apple' : 'Логин и пароль'}</small></span></div>
        <button class="row" id="setClear"><span class="ic">🧹</span><span class="tx"><b>Очистить историю поездок</b></span></button>
        <button class="row" id="setOut"><span class="ic">🚪</span><span class="tx"><b style="color:var(--danger)">Выйти из аккаунта</b></span></button>
      </div>
      <p class="note">Все данные черновика хранятся только в этом браузере.</p>`;
    },
    bind: b => {
      const m = me() || {};
      paintAvatar(b.querySelector('#setAv'), m.name, m.avatar);
      b.querySelector('#setAvBtn').onclick = () => pickAvatar(url => { saveMe({ avatar: url }); rerender(); toast('Фото обновлено'); });
      b.querySelector('#setAvDel')?.addEventListener('click', () => { saveMe({ avatar: null }); rerender(); });
      let tm;
      b.querySelector('#setName').oninput = e => { clearTimeout(tm); tm = setTimeout(() => saveMe({ name: e.target.value.trim() || 'Пассажир' }), 400); };
      b.querySelector('#setPhone').onchange = e => saveMe({ phone: e.target.value.trim() });
      b.querySelectorAll('#setTheme button').forEach(x => x.onclick = () => { store.set('theme', x.dataset.t); applyTheme(); rerender(); });
      b.querySelector('#setTraffic').onchange = e => Z.setTraffic(e.target.checked);
      b.querySelector('#setVibe').onchange = e => store.set('vibe', e.target.checked);
      b.querySelector('#setShare').onchange = e => { store.set('share', e.target.checked); const c = $('#shareChk'); if (c) c.checked = e.target.checked; };
      b.querySelector('#setClear').onclick = () => { store.set('history', []); toast('История очищена'); };
      b.querySelector('#setOut').onclick = signOut;
    },
  };

  // --- оплата
  VIEWS.pay = {
    title: 'Оплата',
    html: o => `
      <div class="sec-title">${o.select ? 'Чем платим за поездку?' : 'Способы оплаты'}</div>
      <div class="list">${payMethods().map(m => `
        <button class="row ${m.id === currentPay().id ? 'sel' : ''}" data-id="${m.id}">
          <span class="ic">${m.ic}</span><span class="tx"><b>${esc(m.label)}</b><small>${esc(m.sub)}</small></span>
          ${m.id === currentPay().id ? '<span class="check">✓</span>' : ''}
        </button>`).join('')}
        <button class="row" id="addCard"><span class="ic">➕</span><span class="tx"><b>Добавить карту</b><small>Visa, Mastercard, UnionPay</small></span></button>
      </div>
      ${cards().length ? `<div class="sec-title">Мои карты</div><div class="list">${cards().map(c => `
        <div class="row"><span class="ic">💳</span><span class="tx"><b>${esc(c.brand)} •••• ${esc(c.last4)}</b><small>до ${esc(c.exp)}</small></span><button class="ghost sm danger" data-del="${c.id}">Удалить</button></div>`).join('')}</div>` : ''}
      <p class="note">Черновик: списаний нет. От карты сохраняются только тип, последние 4 цифры и срок, CVV нигде не хранится.</p>`,
    bind: (b, o) => {
      b.querySelectorAll('.row[data-id]').forEach(r => r.onclick = () => { setPay(r.dataset.id); toast(`Оплата: ${currentPay().label}`); o.select ? back() : rerender(); });
      b.querySelector('#addCard').onclick = () => openPanel('card', o);
      b.querySelectorAll('[data-del]').forEach(x => x.onclick = () => {
        store.set('cards', cards().filter(c => c.id !== x.dataset.del));
        if (store.get('pay') === x.dataset.del) setPay('cash');
        rerender();
      });
    },
  };
  VIEWS.card = {
    title: 'Новая карта',
    html: () => `
      <div class="card-preview"><span class="brand" id="cpBrand">КАРТА</span><span class="num" id="cpNum">•••• •••• •••• ••••</span><div class="bottom"><span id="cpName">ИМЯ ФАМИЛИЯ</span><span id="cpExp">MM/YY</span></div></div>
      <form id="cardForm" novalidate>
        <label class="fld"><span>Номер карты</span><input id="cNum" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23"></label>
        <div class="grid2">
          <label class="fld"><span>Срок</span><input id="cExp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></label>
          <label class="fld"><span>CVV</span><input id="cCvv" inputmode="numeric" autocomplete="cc-csc" placeholder="•••" maxlength="4" type="password"></label>
        </div>
        <label class="fld"><span>Имя на карте</span><input id="cName" autocomplete="cc-name" placeholder="ANEL ZHYLDAM" maxlength="26"></label>
        <p class="auth-err" id="cErr"></p>
        <button class="cta" type="submit">Привязать карту</button>
      </form>
      <p class="note">Черновик: карта никуда не отправляется. Сохраняем только тип, последние 4 цифры и срок.</p>`,
    bind: (b, o) => {
      const num = b.querySelector('#cNum'), exp = b.querySelector('#cExp'), cvv = b.querySelector('#cCvv'), nm = b.querySelector('#cName');
      const digits = () => num.value.replace(/\D/g, '');
      num.oninput = () => {
        const d = digits().slice(0, 19); num.value = d.replace(/(.{4})/g, '$1 ').trim();
        b.querySelector('#cpNum').textContent = (d + '•'.repeat(Math.max(0, 16 - d.length))).replace(/(.{4})/g, '$1 ').trim();
        b.querySelector('#cpBrand').textContent = d ? brandOf(d).toUpperCase() : 'КАРТА';
        num.classList.remove('bad');
      };
      exp.oninput = () => { let d = exp.value.replace(/\D/g, '').slice(0, 4); if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2); exp.value = d; b.querySelector('#cpExp').textContent = d || 'MM/YY'; exp.classList.remove('bad'); };
      cvv.oninput = () => { cvv.value = cvv.value.replace(/\D/g, ''); cvv.classList.remove('bad'); };
      nm.oninput = () => { nm.value = nm.value.toUpperCase().replace(/[^A-Z\s-]/g, ''); b.querySelector('#cpName').textContent = nm.value || 'ИМЯ ФАМИЛИЯ'; };
      b.querySelector('#cardForm').addEventListener('submit', e => {
        e.preventDefault();
        const err = (m, el) => { b.querySelector('#cErr').textContent = m; el && el.classList.add('bad'); };
        const d = digits();
        if (!luhn(d)) return err('Номер карты неверный, проверь цифры', num);
        const [mm, yy] = exp.value.split('/').map(Number);
        const now = new Date(), y = 2000 + (yy || 0);
        if (!mm || mm > 12 || !yy || y < now.getFullYear() || (y === now.getFullYear() && mm < now.getMonth() + 1)) return err('Срок действия неверный или карта просрочена', exp);
        if (!/^\d{3,4}$/.test(cvv.value)) return err('CVV: 3 цифры с обратной стороны', cvv);
        const c = { id: 'c' + Date.now().toString(36), brand: brandOf(d), last4: d.slice(-4), exp: exp.value, holder: nm.value.trim() };
        store.set('cards', [...cards(), c]);
        cvv.value = ''; num.value = '';
        setPay(c.id);
        toast(`Карта ${c.brand} •••• ${c.last4} привязана`);
        back();
      });
      setTimeout(() => num.focus(), 50);
    },
  };

  // --- история
  VIEWS.history = {
    title: 'История поездок',
    html: o => {
      const role = o.role || (document.getElementById('app').classList.contains('mode-driver') ? 'driver' : 'passenger');
      const list = history().filter(t => t.role === role);
      let lastDate = '', out = '';
      list.forEach(t => {
        const d = dateFmt(t.at);
        if (d !== lastDate) { if (lastDate) out += '</div>'; out += `<div class="sec-title">${d}</div><div class="list">`; lastDate = d; }
        out += `<button class="row" data-id="${t.id}"><span class="ic">${vehBy(t.veh).em}</span>
          <span class="tx"><b>${esc(t.fromName)} → ${esc(t.toName)}</b><small>${timeFmt(t.at)} · ${t.km.toFixed(1)} км · ${esc(t.pay?.label || '')}${t.status === 'cancelled' ? ' · отменена' : ''}</small></span>
          <span class="rt">${role === 'driver' ? '+' : ''}${fmt(t.total)}<small>${t.mode === 'bargain' ? '🤝 торг' : '⚡ быстро'}</small></span></button>`;
      });
      if (lastDate) out += '</div>';
      const total = list.filter(t => t.status !== 'cancelled').reduce((s, t) => s + t.total, 0);
      return `<div class="seg" id="hRole"><button data-r="passenger" class="${role === 'passenger' ? 'on' : ''}">🧍 Пассажир</button><button data-r="driver" class="${role === 'driver' ? 'on' : ''}">🏍️ Райдер</button></div>
        ${list.length ? `<p class="note">${list.length} ${plural(list.length, 'поездка', 'поездки', 'поездок')} · ${role === 'driver' ? 'заработано' : 'потрачено'} ${fmt(total)}</p>${out}`
          : `<div class="empty-big"><div>🛵</div>Пока нет поездок. ${role === 'driver' ? 'Выйди на линию и возьми первый заказ!' : 'Закажи первую, и она появится здесь с чеком.'}</div>`}`;
    },
    bind: (b, o) => {
      b.querySelectorAll('#hRole button').forEach(x => x.onclick = () => { stack[stack.length - 1][1] = { role: x.dataset.r }; render(); });
      b.querySelectorAll('.row[data-id]').forEach(r => r.onclick = () => openPanel('receipt', { id: r.dataset.id }));
    },
  };
  const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

  VIEWS.receipt = {
    title: 'Чек',
    html: o => {
      const t = history().find(x => x.id === o.id);
      if (!t) return '<div class="empty-big"><div>🧾</div>Чек не найден</div>';
      const v = vehBy(t.veh), drv = t.role === 'driver';
      const line = (k, val) => `<div class="r-line"><span>${k}</span><b>${val}</b></div>`;
      return `<div class="receipt">
        <h3>zhyldam ⚡ ${drv ? 'заработок' : 'чек'}</h3>
        <div class="muted">№ ${t.id.toUpperCase()} · ${dateFmt(t.at)}, ${timeFmt(t.at)}</div>
        <div class="route"><div><i class="a"></i>${esc(t.fromName)}</div><div><i></i>${esc(t.toName)}</div></div>
        <hr>
        ${line('Транспорт', `${v.em} ${v.n}`)}
        ${line('Режим', t.mode === 'bargain' ? '🤝 Торг' : '⚡ Быстро')}
        ${line('Расстояние', `${t.km.toFixed(1)} км`)}
        ${line('В пути', `${t.min} мин${t.carMin ? ` (авто ~${t.carMin})` : ''}`)}
        ${t.jamScore ? line('Пробки', `<span class="score ${t.jamScore < 4 ? 'g' : t.jamScore < 7 ? 'y' : 'r'}">${t.jamScore}</span> баллов`) : ''}
        ${line(drv ? 'Пассажир' : 'Райдер', esc(t.who?.name || '—') + (t.who?.plate ? ` · ${esc(t.who.plate)}` : ''))}
        ${t.who?.bike ? line('Байк', esc(t.who.bike)) : ''}
        <hr>
        ${t.mode === 'bargain'
          ? line('Договорная цена', fmt(t.fare))
          : line('Посадка', fmt(t.base)) + line(`Поездка, ${t.km.toFixed(1)} км`, fmt(t.dist)) + (t.jamFee ? line('Надбавка за пробки', fmt(t.jamFee)) : '')}
        ${t.tip ? line('Чаевые', fmt(t.tip)) : ''}
        ${line('Сервисный сбор', '0 ₸')}
        <hr>
        <div class="r-line total"><span>Итого</span><b>${fmt(t.total)}</b></div>
        ${line('Оплата', esc(t.pay?.label || 'Наличные'))}
        ${t.status === 'cancelled' ? line('Статус', 'Отменена') : line('Оценка', '★'.repeat(t.rating || 5))}
        ${t.live ? line('Тип', '🟢 Живая поездка') : ''}
      </div>
      <button class="ghost" id="rcCopy" style="margin-top:20px">📋 Скопировать чек</button>`;
    },
    bind: (b, o) => {
      b.querySelector('#rcCopy')?.addEventListener('click', () => {
        const t = history().find(x => x.id === o.id); if (!t) return;
        copy(`Zhyldam, чек № ${t.id.toUpperCase()}\n${dateFmt(t.at)}, ${timeFmt(t.at)}\n${t.fromName} → ${t.toName}\n${t.km.toFixed(1)} км, ${t.min} мин\nИтого: ${fmt(t.total)} (${t.pay?.label || 'Наличные'})`, 'Чек скопирован');
      });
    },
  };

  // --- поддержка
  let supportMsgs = store.get('support', []);
  const QUICK = ['Забыл(а) вещь у райдера', 'Списали лишние деньги', 'Райдер ехал опасно', 'Как работает торг?', 'Как стать райдером?', 'Нет шлема у райдера'];
  const CANNED = [
    [/забы|вещ|потерял/i, 'Сочувствуем! Открой «История поездок», выбери поездку и скопируй чек. Пришли сюда номер чека и что именно забыто, и мы свяжемся с райдером. Обычно вещи возвращают в тот же день.'],
    [/спис|деньг|оплат|карт|возврат|дорог/i, 'Проверим. Пришли номер чека из «Истории поездок». Если списание ошибочное, вернём деньги на карту за 1–3 рабочих дня. Пока ждёшь, можешь выбрать «Наличные» в разделе «Оплата».'],
    [/опасн|безопас|груб|жалоб|авар|скорост/i, 'Спасибо, что сообщил(а), это важно. Если сейчас есть угроза, звони 112. Пришли номер чека, и мы заблокируем райдера на время проверки. Во время поездки кнопка «Безопасность» даёт поделиться маршрутом с близкими.'],
    [/шлем/i, 'Шлем для пассажира обязателен. Каждый райдер Zhyldam подтверждает, что возит запасной. Если шлема не было, напиши номер чека, и мы вернём полную стоимость поездки.'],
    [/торг|цен|предлож/i, 'В режиме «Торг» ты предлагаешь свою цену, а райдеры принимают её или просят немного больше. Выбираешь лучшее предложение по цене, рейтингу и времени подачи. Если никто не откликается, подними цену на 100 ₸.'],
    [/райдер|водител|работ|стать/i, 'Нужно своё мото или мопед, права категории A или A1 и запасной шлем для пассажира. Открой меню → «Стать райдером», заполни профиль и выходи на линию.'],
    [/отмен/i, 'Пока райдер не выехал, поездку можно отменить бесплатно. Если райдер уже ждёт тебя дольше 5 минут, может взиматься сбор 200 ₸.'],
  ];
  const cannedReply = q => (CANNED.find(([re]) => re.test(q)) || [0, 'Принято! Опиши, пожалуйста, подробнее, что случилось, и приложи номер чека, если вопрос про поездку. Оператор ответит в течение пары минут.'])[1];
  let sampleP = null;
  const getSample = () => (sampleP ||= (async () => { try { return window.claude?.use ? await window.claude.use('sample') : null; } catch { return null; } })());
  async function supportAnswer(q, onText) {
    const s = await getSample();
    if (s) {
      try {
        const last = history()[0];
        const ctx = `Ты оператор службы поддержки Zhyldam: мото-такси в Алматы (мопеды, мотоциклы, спортбайки). Режимы заказа: «Быстро» (фиксированная цена) и «Торг» (пассажир предлагает цену, райдеры отвечают). Шлем для пассажира обязателен, его привозит райдер. Оплата: наличные, Kaspi перевод, карта. Экстренная служба: 112. Отвечай по-русски, коротко (2–4 предложения), дружелюбно, без markdown. Не придумывай номера телефонов, суммы возврата и сроки, которых нет здесь. Возврат на карту идёт 1–3 рабочих дня. ${last ? `Последняя поездка клиента: ${last.fromName} → ${last.toName}, ${fmt(last.total)}, ${last.pay?.label}, чек № ${last.id.toUpperCase()}.` : ''}`;
        const msgs = supportMsgs.slice(-10).map(m => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text }));
        while (msgs.length && msgs[0].role !== 'user') msgs.shift();
        if (msgs.length) msgs[0] = { role: 'user', content: ctx + '\n\nКлиент: ' + msgs[0].content };
        else msgs.push({ role: 'user', content: ctx + '\n\nКлиент: ' + q });
        const r = await s(msgs, { modelTier: 'quick', cache: false, onText: ({ text }) => onText(text) });
        if (r && r.text) return r.text.trim();
      } catch {}
    }
    await new Promise(r => setTimeout(r, 900));
    return cannedReply(q);
  }
  VIEWS.support = {
    title: 'Служба поддержки',
    chat: true,
    html: () => `<div class="msgs" id="sMsgs"></div>
      <div class="quick">${QUICK.map(q => `<button>${q}</button>`).join('')}</div>
      <form class="composer" id="sForm"><input id="sInput" placeholder="Напиши, что случилось…" autocomplete="off" maxlength="500"><button type="submit" aria-label="Отправить">➤</button></form>`,
    bind: b => {
      const box = b.querySelector('#sMsgs');
      const draw = (typing) => {
        const all = [{ from: 'them', text: `Сәлем, ${name()}! 👋 Это поддержка Zhyldam. Чем помочь?`, at: 0 }, ...supportMsgs];
        box.innerHTML = all.map(m => `<div class="msg ${m.from}">${esc(m.text)}${m.at ? `<small>${timeFmt(m.at)}</small>` : ''}</div>`).join('') + (typing != null ? `<div class="msg them typing">${typing ? esc(typing) : 'Оператор печатает…'}</div>` : '');
        box.scrollTop = box.scrollHeight;
      };
      let busy = false;
      const send = async text => {
        text = text.trim(); if (!text || busy) return;
        busy = true;
        supportMsgs.push({ from: 'me', text, at: Date.now() }); draw('');
        const ans = await supportAnswer(text, partial => draw(partial));
        supportMsgs.push({ from: 'them', text: ans, at: Date.now() });
        supportMsgs = supportMsgs.slice(-40); store.set('support', supportMsgs);
        busy = false; draw();
      };
      b.querySelectorAll('.quick button').forEach(q => q.onclick = () => send(q.textContent));
      b.querySelector('#sForm').addEventListener('submit', e => { e.preventDefault(); const i = b.querySelector('#sInput'); send(i.value); i.value = ''; });
      draw();
    },
  };

  // --- безопасность
  VIEWS.safety = {
    title: 'Безопасность',
    html: () => `
      <div class="list">
        <div class="row"><span class="ic">🆘</span><span class="tx"><b>Экстренная служба: 112</b><small>Набери этот номер с телефона, если есть угроза</small></span><button class="ghost sm" id="sfCopy">Копировать</button></div>
        <button class="row" id="sfShare"><span class="ic">🔗</span><span class="tx"><b>Поделиться поездкой</b><small>Отправь близким ссылку, чтобы следили за маршрутом</small></span></button>
        <button class="row" data-go="support"><span class="ic">🎧</span><span class="tx"><b>Написать в поддержку</b><small>Ответим за пару минут</small></span></button>
      </div>
      <div class="sec-title">Правила Zhyldam</div>
      <div class="list">
        <div class="row"><span class="ic">🪖</span><span class="tx"><b>Шлем обязателен</b><small>Райдер всегда привозит запасной шлем для пассажира</small></span></div>
        <div class="row"><span class="ic">🧾</span><span class="tx"><b>Проверенные райдеры</b><small>Права категории A/A1, документы на байк</small></span></div>
        <div class="row"><span class="ic">🛑</span><span class="tx"><b>Можно остановить поездку</b><small>Попроси райдера остановиться в любой момент</small></span></div>
        <div class="row"><span class="ic">🌧️</span><span class="tx"><b>Плохая погода</b><small>В дождь и гололёд райдер вправе снизить скорость или отказаться</small></span></div>
      </div>`,
    bind: b => {
      b.querySelector('#sfCopy').onclick = () => copy('112', 'Номер 112 скопирован');
      b.querySelector('#sfShare').onclick = () => { const t = shareProvider && shareProvider(); t ? openPanel('share', t) : toast('Поделиться можно во время поездки'); };
      b.querySelector('[data-go=support]').onclick = () => openPanel('support');
    },
  };

  // --- звонок (номер скрыт)
  VIEWS.call = {
    title: 'Звонок',
    html: o => `<div class="profile-top"><div class="avatar huge" id="callAv"></div><b style="font-size:20px">${esc(o.name)}</b><span class="muted">${esc(o.sub || '')}</span></div>
      <div class="list"><div class="row"><span class="ic">📞</span><span class="tx"><b>${o.phone}</b><small>Подменный номер: твой настоящий номер скрыт</small></span><button class="ghost sm" id="callCopy">Копировать</button></div></div>
      <p class="note">В черновике звонок не совершается. Номер подменный и действует до конца поездки.</p>`,
    bind: (b, o) => { paintAvatar(b.querySelector('#callAv'), o.name); b.querySelector('#callCopy').onclick = () => copy(o.phone.replace(/\s/g, ''), 'Номер скопирован'); },
  };

  // --- чат с райдером/пассажиром
  let chatCtx = null; // {id, name, mine:[], theirs: fn, bot: [...] }
  const chats = {};
  VIEWS.chat = {
    title: o => o.name,
    chat: true,
    html: o => `<div class="msgs" id="cMsgs"></div>
      <div class="quick">${(o.quick || []).map(q => `<button>${q}</button>`).join('')}</div>
      <form class="composer" id="cForm"><input id="cInput" placeholder="Сообщение…" autocomplete="off" maxlength="300"><button type="submit" aria-label="Отправить">➤</button></form>`,
    bind: (b, o) => {
      chatCtx = o;
      const st = chats[o.id] ||= { mine: [], bot: [] };
      const draw = () => {
        const theirs = (o.theirs && o.theirs()) || st.bot;
        const all = [...st.mine.map(m => ({ ...m, from: 'me' })), ...theirs.map(m => ({ ...m, from: 'them' }))].sort((a, c) => a.at - c.at);
        const box = b.querySelector('#cMsgs');
        box.innerHTML = all.length ? all.map(m => `<div class="msg ${m.from}">${esc(m.text)}<small>${timeFmt(m.at)}</small></div>`).join('') : '<p class="muted center">Напиши, если нужно уточнить место посадки</p>';
        box.scrollTop = box.scrollHeight;
      };
      o.redraw = draw;
      const send = text => {
        text = text.trim(); if (!text) return;
        st.mine.push({ text, at: Date.now() }); st.mine = st.mine.slice(-20);
        o.onSend && o.onSend(st.mine);
        if (!o.theirs && o.bot) setTimeout(() => { st.bot.push({ text: Z.pick(o.bot), at: Date.now() }); chatCtx === o && draw(); }, 1400);
        draw();
      };
      b.querySelectorAll('.quick button').forEach(q => q.onclick = () => send(q.textContent));
      b.querySelector('#cForm').addEventListener('submit', e => { e.preventDefault(); const i = b.querySelector('#cInput'); send(i.value); i.value = ''; });
      draw();
    },
  };
  const redrawChat = () => chatCtx && chatCtx.redraw && !$('#panel').hidden && chatCtx.redraw();

  // --- поделиться поездкой
  let shareProvider = null;
  VIEWS.share = {
    title: 'Поделиться поездкой',
    html: o => {
      const link = SHARE_BASE + '#ride-' + o.id;
      return `<p class="muted">Отправь близким: они увидят, кто тебя везёт и когда приедешь.</p>
      <div class="receipt" style="margin:12px 0 22px"><div style="white-space:pre-wrap;font-weight:500">${esc(o.text)}</div></div>
      <label class="fld"><span>Ссылка на поездку</span><input id="shLink" readonly value="${esc(link)}"></label>
      <button class="cta" id="shCopy">🔗 Скопировать ссылку и описание</button>
      <button class="ghost" id="shLinkOnly">Только ссылку</button>
      <p class="note">По ссылке поездка видна вживую, пока у тебя открыто приложение. Человеку нужен доступ к этой странице.</p>`;
    },
    bind: (b, o) => {
      const link = SHARE_BASE + '#ride-' + o.id;
      b.querySelector('#shCopy').onclick = () => copy(o.text + '\n' + link, 'Скопировано, отправь в WhatsApp или Telegram');
      b.querySelector('#shLinkOnly').onclick = () => copy(link, 'Ссылка скопирована');
    },
  };

  // --- отслеживание по ссылке
  VIEWS.track = {
    title: 'Поездка',
    html: o => {
      const pass = Live.passengers().find(p => p.presence.ride.id === o.id);
      if (!pass) return `<div class="empty-big"><div>🔍</div><b>Поездка сейчас не в эфире</b><p>Ссылка показывает поездку, пока у пассажира открыто приложение Zhyldam. Возможно, поездка уже закончилась.</p></div>
        <button class="ghost" id="trClose">На главную</button>`;
      const r = pass.presence.ride, drv = r.driver && Live.peer(r.driver);
      const dp = drv?.presence || (r.sim ? { profile: r.sim.profile, trip: { stage: r.sim.stage } } : null);
      const stage = { toPickup: '🏍️ Райдер едет к пассажиру', atPickup: '📍 Райдер на месте', waiting: '🪖 Пассажир садится', riding: '⚡ В пути', arrived: '🏁 Приехали', done: '✅ Поездка завершена' }[dp?.trip?.stage] || (r.status === 'searching' ? '🔎 Ищем райдера' : '…');
      return `<div class="eta-banner">${stage}</div>
        <div class="receipt"><div class="route"><div><i class="a"></i>${esc(r.fromName)}</div><div><i></i>${esc(r.toName)}</div></div>
        <hr><div class="r-line"><span>Пассажир</span><b>${esc(r.name || 'Пассажир')}</b></div>
        ${dp ? `<div class="r-line"><span>Райдер</span><b>${esc(dp.profile.name)} · ★ ${esc(dp.profile.rating)}</b></div><div class="r-line"><span>Байк</span><b>${esc(dp.profile.em)} ${esc(dp.profile.bike)}</b></div><div class="r-line"><span>Номер</span><b>${esc(dp.profile.plate)}</b></div>` : ''}
        ${drv?.presence?.loc ? `<div class="r-line"><span>Райдер сейчас</span><b>${esc(Z.addressOf(drv.presence.loc))}</b></div>` : ''}
        <div class="r-line"><span>Расстояние</span><b>${(+r.km).toFixed(1)} км</b></div></div>
        <p class="note">Обновляется в реальном времени.</p>
        <button class="ghost" id="trClose">Закрыть</button>`;
    },
    bind: b => { b.querySelector('#trClose').onclick = () => { closePanel(); history_replace(''); }; },
  };
  const history_replace = h => { try { history.replaceState(null, '', h || location.pathname + location.search); } catch {} };
  Live.on(() => {
    if (stack.length && stack[stack.length - 1][0] === 'track') render();
    redrawChat();
  });
  function checkHash() {
    const m = location.hash.match(/^#ride-([a-z0-9]+)$/i);
    if (m) whenSignedIn(() => { closePanel(); openPanel('track', { id: m[1] }); setTimeout(rerender, 1500); });
  }
  window.addEventListener('hashchange', checkHash);
  setTimeout(checkHash, 300);

  // ---------- общее ----------
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || 'Скопировано'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(msg || 'Скопировано'); } catch { toast('Выдели текст и скопируй вручную'); }
      ta.remove();
    }
  }
  function toggleDrawer(on) { $('#drawer').classList.toggle('open', on); $('#scrim').classList.toggle('on', on); }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-panel]');
    if (b) { e.preventDefault(); openPanel(b.dataset.panel); }
  });
  const vibrate = ms => { try { store.get('vibe', true) && navigator.vibrate && navigator.vibrate(ms); } catch {} };
  const fakePhone = () => `+7 7${Math.floor(Z.rnd(0, 9))}${Math.floor(Z.rnd(0, 9))} ${Math.floor(Z.rnd(100, 999))} ${Math.floor(Z.rnd(10, 99))} ${Math.floor(Z.rnd(10, 99))}`;

  return {
    me, name, syncUI, paintAvatar, whenSignedIn, toggleDrawer,
    currentPay, onPay: f => payListeners.add(f),
    addHistory, openPanel, closePanel, copy, vibrate, fakePhone,
    setShareProvider: f => { shareProvider = f; },
    openShare: t => openPanel('share', t),
    redrawChat,
  };
})();
