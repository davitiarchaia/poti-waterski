/* =================== SETTINGS — edit these =================== */
const CONFIG = {
  phone: '',          // e.g. '+995 555 12 34 56'  (empty = hidden on the page)
  whatsapp: '',       // digits only, e.g. '995555123456' (empty = WhatsApp buttons hidden)
  instagram: '',      // e.g. 'potiwaterski'
  openHour: 9, closeHour: 19,      // first and last start time
  slotMinutes: 30,
  daysAhead: 14,
  seasonMonths: [4, 5, 6, 7, 8, 9], // 0 = January … this is May–October
};
// price: number in GEL (₾), or null = "price on request"
const RIDES = [
  { id: 'first', price: null, tag: true },
  { id: 'set',   price: null },
  { id: 'wake',  price: null },
  { id: 'group', price: null, perGroup: true },
];
const SUPABASE_URL = 'https://boijrdntbfxvopcamdsd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n5U7gtibxsdDpAa9za8rmw_0wDPRLvy'; // public key, safe in the browser
/* ============================================================== */

const T = {
  ka: {
    title: 'ჯავშანი — ფოთის წყლის თხილამურებისა და ვეიკბორდის კლუბი',
    place: 'ოქროს ტბა · მალთაყვა · ფოთი',
    h1a: 'დაჯავშნე', h1b: 'შენი სრიალი.',
    chip1: 'აღჭურვილობა და ჰიდროკოსტიუმი შედის', chip2: 'მწვრთნელები ყველა დონისთვის', chip3: 'ბავშვები 6 წლიდან',
    bookTitle: 'ჯავშანი',
    s1: 'აირჩიე აქტივობა', s2: 'აირჩიე დღე', s3: 'აირჩიე დრო', s4: 'მონაწილეები', s5: 'შენი მონაცემები',
    rides: {
      first: ['პირველი სრიალი', '20 წთ · მწვრთნელი ნაპირზე და ნავში', 'დამწყებთათვის'],
      set:   ['სავარჯიშო სეტი', '15 წთ · სლალომი, ვეიკი ან ტრიუკები'],
      wake:  ['ვეიკბორდი', '15 წთ · დაფა, ჟილეტი, კოსტიუმი'],
      group: ['ჯგუფი / ღონისძიება', 'დაბადების დღე, გუნდი, კომპანია'],
    },
    perRider: '/ ადამიანი', onRequest: 'ფასი მოთხოვნით',
    seasonOpens: d => `სეზონი იხსნება ${d.replace(/ი$/, '')}ს — დაჯავშნე წინასწარ.`,
    pickDayFirst: 'ჯერ აირჩიე დღე.', noSlotsToday: 'დღეს თავისუფალი დრო აღარ არის — აირჩიე სხვა დღე.',
    loadingSlots: 'თავისუფალი დროის ჩატვირთვა…', taken: 'დაკავებულია',
    levelLabel: 'დონე',
    levels: ['არასდროს მიცდია', 'დამწყები — ვდგები', 'საშუალო', 'გამოცდილი / სპორტსმენი'],
    name: 'სახელი', namePh: 'შენი სახელი', phone: 'ტელეფონი / WhatsApp',
    notes: 'შენიშვნა', optional: '(არასავალდებულო)', notesPh: 'ბავშვების ასაკი, სურვილები…',
    total: 'ჯამი', rider: n => `${n} მონაწილე`, noWhen: 'დღე და დრო არჩეული არ არის', pickTime: 'აირჩიე დრო',
    submit: 'დაჯავშნა', sending: 'იგზავნება…',
    fine: 'ყველა ჯავშანს ტელეფონით ან WhatsApp-ით ვადასტურებთ.',
    errDay: 'აირჩიე დღე.', errTime: 'აირჩიე დრო.', errContact: 'შეიყვანე სახელი და სწორი ტელეფონის ნომერი.',
    errTaken: 'ეს დრო ახლახან დაიკავეს — აირჩიე სხვა.', errNet: 'ვერ გაიგზავნა. შეამოწმე ინტერნეტი და სცადე თავიდან.',
    doneTitle: 'ჯავშანი მიღებულია!', doneText: (r, w, n, p) => `${r}, ${w}, ${n}. დასადასტურებლად დაგიკავშირდებით ნომერზე ${p}.`,
    doneWa: 'გაგზავნე WhatsApp-ითაც', again: 'კიდევ ერთი ჯავშანი',
    waMsg: 'გამარჯობა! ჯავშანი:',
    where: 'სად ვართ', address: 'ოქროს ტბა, მალთაყვა, ფოთი', openMaps: 'რუკაზე გახსნა →',
    know: 'კარგია იცოდე',
    k1: 'წამოიღე', k1v: 'საცურაო კოსტიუმი, პირსახოცი, მზის კრემი',
    k2: 'მოდი', k2v: 'დაწყებამდე 15 წუთით ადრე',
    k3: 'ამინდი', k3v: 'სახიფათო ამინდში დაგიკავშირდებით',
    contact: 'კონტაქტი', cPhone: 'ტელეფონი', cWa: 'WhatsApp', cWaLink: 'მოგვწერე', cIg: 'Instagram', cSeason: 'სეზონი', cSeasonV: 'მაისი – ოქტომბერი',
    cOnly: 'ჯავშნის ფორმა ზემოთაა — ვუპასუხებთ მალე.',
  },
  en: {
    title: 'Book a Ride — Poti Waterski & Wakeboard Club',
    place: 'Golden Lake · Maltakva · Poti',
    h1a: 'Book your', h1b: 'ride.',
    chip1: 'Equipment & wetsuit included', chip2: 'Coaches for all levels', chip3: 'Kids from 6 years',
    bookTitle: 'Booking',
    s1: 'Choose your ride', s2: 'Pick a day', s3: 'Pick a time', s4: 'Riders', s5: 'Your details',
    rides: {
      first: ['First Ride', '20 min · coach on land & boat', 'Beginners'],
      set:   ['Coached Set', '15 min · slalom, wake or tricks'],
      wake:  ['Wakeboard', '15 min · board, vest, wetsuit'],
      group: ['Group / Event', 'Birthdays, teams, companies'],
    },
    perRider: '/ rider', onRequest: 'Price on request',
    seasonOpens: d => `Season opens ${d} — book ahead now.`,
    pickDayFirst: 'Pick a day first.', noSlotsToday: 'No more slots today — pick another day.',
    loadingSlots: 'Loading free times…', taken: 'Taken',
    levelLabel: 'Level',
    levels: ['Never tried it', 'Beginner — can get up', 'Intermediate', 'Advanced / competitive'],
    name: 'Name', namePh: 'Your name', phone: 'Phone / WhatsApp',
    notes: 'Notes', optional: '(optional)', notesPh: 'Ages of kids, special requests…',
    total: 'Total', rider: n => `${n} rider${n > 1 ? 's' : ''}`, noWhen: 'No day or time selected', pickTime: 'pick a time',
    submit: 'Request booking', sending: 'Sending…',
    fine: 'We confirm every booking by phone or WhatsApp.',
    errDay: 'Please pick a day.', errTime: 'Please pick a time.', errContact: 'Please add your name and a valid phone number.',
    errTaken: 'That time was just taken — please pick another.', errNet: "Couldn't send. Check your connection and try again.",
    doneTitle: 'Booking received!', doneText: (r, w, n, p) => `${r}, ${w}, ${n}. We'll contact you at ${p} to confirm.`,
    doneWa: 'Send it on WhatsApp too', again: 'Make another booking',
    waMsg: 'Hi! Booking request:',
    where: 'Where', address: 'Golden Lake, Maltakva, Poti', openMaps: 'Open in maps →',
    know: 'Good to know',
    k1: 'Bring', k1v: 'Swimsuit, towel, sunscreen',
    k2: 'Arrive', k2v: '15 minutes before your slot',
    k3: 'Weather', k3v: "We'll contact you if it's unsafe",
    contact: 'Contact', cPhone: 'Phone', cWa: 'WhatsApp', cWaLink: 'Chat with us', cIg: 'Instagram', cSeason: 'Season', cSeasonV: 'May – October',
    cOnly: 'Use the booking form above — we reply fast.',
  },
  ru: {
    title: 'Бронирование — клуб водных лыж и вейкборда, Поти',
    place: 'Золотое озеро · Малтаква · Поти',
    h1a: 'Забронируй', h1b: 'катание.',
    chip1: 'Снаряжение и гидрокостюм включены', chip2: 'Тренеры для любого уровня', chip3: 'Дети с 6 лет',
    bookTitle: 'Бронирование',
    s1: 'Выбери катание', s2: 'Выбери день', s3: 'Выбери время', s4: 'Участники', s5: 'Твои данные',
    rides: {
      first: ['Первое катание', '20 мин · тренер на берегу и в лодке', 'Новичкам'],
      set:   ['Сет с тренером', '15 мин · слалом, вейк или трюки'],
      wake:  ['Вейкборд', '15 мин · доска, жилет, гидрокостюм'],
      group: ['Группа / событие', 'Дни рождения, команды, компании'],
    },
    perRider: '/ чел.', onRequest: 'Цена по запросу',
    seasonOpens: d => `Сезон открывается ${d} — бронируй заранее.`,
    pickDayFirst: 'Сначала выбери день.', noSlotsToday: 'На сегодня свободного времени нет — выбери другой день.',
    loadingSlots: 'Загружаем свободное время…', taken: 'Занято',
    levelLabel: 'Уровень',
    levels: ['Никогда не пробовал', 'Новичок — встаю', 'Средний', 'Продвинутый / спортсмен'],
    name: 'Имя', namePh: 'Твоё имя', phone: 'Телефон / WhatsApp',
    notes: 'Комментарий', optional: '(необязательно)', notesPh: 'Возраст детей, пожелания…',
    total: 'Итого', rider: n => `${n} чел.`, noWhen: 'День и время не выбраны', pickTime: 'выбери время',
    submit: 'Забронировать', sending: 'Отправляем…',
    fine: 'Каждую бронь подтверждаем по телефону или в WhatsApp.',
    errDay: 'Выбери день.', errTime: 'Выбери время.', errContact: 'Укажи имя и правильный номер телефона.',
    errTaken: 'Это время только что заняли — выбери другое.', errNet: 'Не удалось отправить. Проверь интернет и попробуй снова.',
    doneTitle: 'Бронь получена!', doneText: (r, w, n, p) => `${r}, ${w}, ${n} — мы свяжемся с тобой по номеру ${p} для подтверждения.`,
    doneWa: 'Отправить и в WhatsApp', again: 'Ещё одна бронь',
    waMsg: 'Здравствуйте! Бронь:',
    where: 'Где мы', address: 'Золотое озеро, Малтаква, Поти', openMaps: 'Открыть на карте →',
    know: 'Полезно знать',
    k1: 'Взять с собой', k1v: 'Купальник, полотенце, солнцезащитный крем',
    k2: 'Приходи', k2v: 'За 15 минут до начала',
    k3: 'Погода', k3v: 'Если небезопасно — мы свяжемся с тобой',
    contact: 'Контакты', cPhone: 'Телефон', cWa: 'WhatsApp', cWaLink: 'Написать нам', cIg: 'Instagram', cSeason: 'Сезон', cSeasonV: 'Май – октябрь',
    cOnly: 'Бронируй через форму выше — ответим быстро.',
  },
};
const LOCALE = { ka: 'ka-GE', en: 'en-GB', ru: 'ru-RU' };
// Georgian names written out, so dates are Georgian in every browser
const KA_WD = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];
const KA_WD_LONG = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];
const KA_MO = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
function fmt(d, kind) {
  if (state.lang === 'ka') {
    if (kind === 'wd') return KA_WD[d.getDay()];
    if (kind === 'mo') return KA_MO[d.getMonth()].slice(0, 3);
    if (kind === 'dm') return `${d.getDate()} ${KA_MO[d.getMonth()]}`;
    return `${KA_WD_LONG[d.getDay()]}, ${d.getDate()} ${KA_MO[d.getMonth()]}`;
  }
  const o = { wd: { weekday: 'short' }, mo: { month: 'short' }, dm: { day: 'numeric', month: 'long' }, long: { weekday: 'long', day: 'numeric', month: 'long' } }[kind];
  return new Intl.DateTimeFormat(LOCALE[state.lang], o).format(d);
}

/* ---------- state ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = { lang: 'ka', ride: RIDES[0], day: null, time: null, riders: 1, taken: new Set() };
const t = k => T[state.lang][k];

function initialLang() {
  try { const s = localStorage.getItem('lang'); if (T[s]) return s; } catch {}
  const n = (navigator.language || '').slice(0, 2);
  return T[n] ? n : 'ka';
}

/* ---------- language ---------- */
function setLang(l) {
  state.lang = l;
  try { localStorage.setItem('lang', l); } catch {}
  document.documentElement.lang = l;
  document.title = t('title');
  $$('[data-i18n]').forEach(el => { const v = t(el.dataset.i18n); if (typeof v === 'string') el.textContent = v; });
  $$('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $$('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  $$('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
  const lv = $('#level'), keep = lv.selectedIndex;
  lv.innerHTML = t('levels').map((x, i) => `<option value="${i}">${x}</option>`).join('');
  lv.selectedIndex = Math.max(0, keep);
  renderRides(); renderDays(); renderSlots(); renderContact(); update();
  if (!$('#done').hidden && state.lastBooking) showDone(state.lastBooking);
}
$('.lang').addEventListener('click', e => { const l = e.target.dataset.lang; if (l) setLang(l); });

/* ---------- rides ---------- */
function renderRides() {
  $('#rides').innerHTML = RIDES.map(r => {
    const [name, info, tag] = t('rides')[r.id];
    const price = r.price != null ? `₾${r.price} ${r.perGroup ? '' : t('perRider')}` : t('onRequest');
    return `<label class="ride">
      <input type="radio" name="ride" value="${r.id}" ${state.ride.id === r.id ? 'checked' : ''}>
      ${r.tag && tag ? `<span class="tag">${tag}</span>` : ''}
      <b>${name}</b><small>${info}</small><span class="price">${price}</span>
    </label>`;
  }).join('');
}
$('#rides').addEventListener('change', e => { state.ride = RIDES.find(r => r.id === e.target.value); update(); });

/* ---------- days ---------- */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = s => new Date(s + 'T12:00');
function seasonDays() {
  const out = [], d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 0; out.length < CONFIG.daysAhead && i < 400; i++) {
    if (CONFIG.seasonMonths.includes(d.getMonth())) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const DAYS = seasonDays();
function renderDays() {
  $('#days').innerHTML = DAYS.map(x => `
    <button type="button" class="day" role="radio" aria-checked="${state.day === iso(x)}" data-iso="${iso(x)}">
      <small>${fmt(x, 'wd')}</small><b>${x.getDate()}</b><small>${fmt(x, 'mo')}</small>
    </button>`).join('');
  const note = $('#seasonNote'), today = new Date(); today.setHours(0, 0, 0, 0);
  const late = DAYS.length && DAYS[0] > today;
  note.hidden = !late;
  if (late) note.textContent = t('seasonOpens')(fmt(DAYS[0], 'dm'));
}
$('#days').addEventListener('click', e => {
  const b = e.target.closest('.day'); if (!b) return;
  state.day = b.dataset.iso; state.time = null;
  $$('#days .day').forEach(x => x.setAttribute('aria-checked', x === b));
  loadTaken(); update();
});
$$('.scroll-btn').forEach(b => b.addEventListener('click', () => {
  const box = $('#days'); box.scrollBy({ left: +b.dataset.scroll * box.clientWidth * 0.8, behavior: 'smooth' });
}));

/* ---------- slots ---------- */
function allSlots() {
  const s = [];
  for (let m = CONFIG.openHour * 60; m <= CONFIG.closeHour * 60; m += CONFIG.slotMinutes)
    s.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return s;
}
function renderSlots(loading) {
  const box = $('#slots');
  if (!state.day) return box.innerHTML = `<p class="hint">${t('pickDayFirst')}</p>`;
  if (loading) return box.innerHTML = `<p class="hint">${t('loadingSlots')}</p>`;
  const now = new Date(), isToday = iso(now) === state.day, cutoff = now.getHours() * 60 + now.getMinutes() + 60;
  const slots = allSlots().filter(x => !isToday || (+x.slice(0, 2) * 60 + +x.slice(3)) > cutoff);
  if (!slots.length) return box.innerHTML = `<p class="hint">${t('noSlotsToday')}</p>`;
  box.innerHTML = slots.map(x => {
    const busy = state.taken.has(x);
    return `<button type="button" class="slot" role="radio" aria-checked="${state.time === x}" ${busy ? `disabled title="${t('taken')}"` : ''}>${x}</button>`;
  }).join('');
}
$('#slots').addEventListener('click', e => {
  const b = e.target.closest('.slot'); if (!b || b.disabled) return;
  state.time = b.textContent;
  $$('#slots .slot').forEach(x => x.setAttribute('aria-checked', x === b)); update();
});

/* ---------- Supabase ---------- */
const sbHeaders = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
let takenReq = 0;
async function loadTaken() {
  const my = ++takenReq; state.taken = new Set(); renderSlots(true);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/taken_slots`, { method: 'POST', headers: sbHeaders, body: JSON.stringify({ d: state.day }) });
    if (r.ok) state.taken = new Set(await r.json());
  } catch {}
  if (my === takenReq) renderSlots();
}
async function saveBooking(b) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(b),
  });
  if (r.ok) return 'ok';
  const err = await r.json().catch(() => ({}));
  return err.code === '23505' ? 'taken' : 'error';
}

/* ---------- riders ---------- */
$('.stepper').addEventListener('click', e => {
  const d = +e.target.dataset.d; if (!d) return;
  state.riders = Math.min(12, Math.max(1, state.riders + d));
  $('#riderCount').textContent = state.riders; update();
});

/* ---------- summary ---------- */
const rideName = () => t('rides')[state.ride.id][0];
function whenText(day = state.day, time = state.time) {
  if (!day) return t('noWhen');
  const d = fmt(fromIso(day), 'long');
  return `${d} · ${time || t('pickTime')}`;
}
function update() {
  $('#sumRide').textContent = `${rideName()} · ${t('rider')(state.riders)}`;
  $('#sumWhen').textContent = whenText();
  const r = state.ride, total = r.price == null ? null : r.perGroup ? r.price : r.price * state.riders;
  $('#sumTotal').textContent = total == null ? t('onRequest') : '₾' + total;
  $('#formError').textContent = '';
}

/* ---------- contact ---------- */
function waLink(text) { return CONFIG.whatsapp ? `https://wa.me/${CONFIG.whatsapp}${text ? '?text=' + encodeURIComponent(text) : ''}` : ''; }
function renderContact() {
  const rows = [];
  if (CONFIG.phone) rows.push(`<li><b>${t('cPhone')}</b><a href="tel:${CONFIG.phone.replace(/\s/g, '')}">${CONFIG.phone}</a></li>`);
  if (CONFIG.whatsapp) rows.push(`<li><b>${t('cWa')}</b><a href="${waLink()}" target="_blank" rel="noopener">${t('cWaLink')}</a></li>`);
  if (CONFIG.instagram) rows.push(`<li><b>${t('cIg')}</b><a href="https://instagram.com/${CONFIG.instagram}" target="_blank" rel="noopener">@${CONFIG.instagram}</a></li>`);
  rows.push(`<li><b>${t('cSeason')}</b><span>${t('cSeasonV')}</span></li>`);
  if (!CONFIG.phone && !CONFIG.whatsapp) rows.unshift(`<li class="only">${t('cOnly')}</li>`);
  $('#contactList').innerHTML = rows.join('');
  $$('.wa-link[data-wa]').forEach(a => { a.hidden = !CONFIG.whatsapp; a.href = waLink(); });
}

/* ---------- submit ---------- */
const form = $('#bookingForm');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#formError');
  if (form.website.value) return;                    // bot trap
  if (!state.day) return err.textContent = t('errDay');
  if (!state.time) return err.textContent = t('errTime');
  const name = form.name.value.trim(), phone = form.phone.value.trim();
  if (!name || phone.replace(/\D/g, '').length < 9) return err.textContent = t('errContact');

  const booking = {
    ride: state.ride.id, date: state.day, time: state.time, riders: state.riders,
    level: T.en.levels[form.level.value], name, phone, notes: form.notes.value.trim() || null, lang: state.lang,
  };
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = t('sending');
  let res = 'error';
  try { res = await saveBooking(booking); } catch {}
  btn.disabled = false; btn.textContent = t('submit');

  if (res === 'taken') { state.time = null; loadTaken(); update(); err.textContent = t('errTaken'); return; }
  if (res !== 'ok') { update(); err.textContent = t('errNet'); return; }
  state.lastBooking = booking;
  showDone(state.lastBooking);
});

function showDone(b) {
  const when = whenText(b.date, b.time);
  const rn = t('rides')[b.ride][0];
  $('#doneText').textContent = t('doneText')(rn, when, t('rider')(b.riders), b.phone);
  const msg = `${t('waMsg')}\n${rn} · ${t('rider')(b.riders)} · ${t('levels')[T.en.levels.indexOf(b.level)]}\n${when}\n${b.name}, ${b.phone}${b.notes ? '\n' + b.notes : ''}`;
  const wa = $('#doneWa'); wa.hidden = !CONFIG.whatsapp; wa.href = waLink(msg);
  form.hidden = true; const d = $('#done'); d.hidden = false;
  d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.focus({ preventScroll: true });
}

$('#again').addEventListener('click', () => {
  form.reset(); Object.assign(state, { ride: RIDES[0], day: null, time: null, riders: 1, taken: new Set(), lastBooking: null });
  $('#riderCount').textContent = 1;
  renderRides(); renderDays(); renderSlots(); update();
  $('#done').hidden = true; form.hidden = false;
});

$('#yr').textContent = new Date().getFullYear();
setLang(initialLang());
