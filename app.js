'use strict';
// چند صبح دیگه؟ — a 2-minute interactive film in the style of «سهم تو کجاست؟» (همدلی).
// intro (the alarm: «قطعش کن») → part 1 → age slider: how many mornings are left (+ voice) → parts 2–3 →
// «one morning of your own» cards (+ voice) → parts 4–5 (with a «بقیه‌ی ماجرا» button) → invitation → form → success.
// On Android the phone vibrates with the alarm, the slider and the count.

// ---- where the form goes (set before publishing) ----
// LEAD_API: an endpoint that accepts POST JSON { id, name, mobile, consent, website, summaries, source }.
// Empty = the form shows a polite "not open yet" message instead of sending anything.
const LEAD_API = '';
const SOURCE = 'chand-sobh';

const PARTS = [
  { src: 'media/p1.mp4', label: '۰۱' },
  { src: 'media/p2.mp4', label: '۰۲' },
  { src: 'media/p3.mp4', label: '۰۳' },
  { src: 'media/p4.mp4', label: '۰۴' },
  { src: 'media/p5.mp4', label: '۰۵' },
];
const VOICE = { age: 'media/v_age.mp3', choice: 'media/v_choice.mp3', cta: 'media/v_cta.mp3', ok: 'media/v_ok.mp3' };
const ALARM = 'media/alarm.mp3';
const MORNINGS = ['صبحونه با بچه‌هام', 'ورزش، بدون عجله', 'یه سفر کوتاه', 'هیچی… فقط می‌خوابیدم'];
const ICONS = ['🍳', '🏃', '🛣️', '😴'];

const $ = (s) => document.querySelector(s);
const vids = [$('#vA'), $('#vB')];
const stage = $('#stage'), shade = $('#shade'), mini = $('#mini');
const voice = $('#voice'), loading = $('#loading'), pausedHint = $('#paused'), muteBtn = $('#mute');
let phase = 'intro', part = 0, cur = 0, muted = false, busy = false, consent = false;
let age = 30, mornings = 0, pick = -1, requestId = '', requestPayload = '', reference = '';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const faNum = (n) => fa(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');
const video = () => vids[cur];
const other = () => vids[1 - cur];
const buzz = (p) => { try { if (!muted && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not supported */ } };
const prime = (v) => { try { const m = v.muted; v.muted = true; const p = v.play(); if (p && p.then) p.then(() => { v.pause(); v.muted = m; }).catch(() => { v.muted = m; }); } catch (e) { /* ignore */ } };

// ---------- screens ----------
function render() {
  shade.classList.toggle('on', ['age', 'choice', 'cta', 'form', 'success'].includes(phase));
  mini.classList.toggle('hidden', !(phase === 'play' && part >= 3));
  stage.classList.toggle('top', phase === 'form');
  $('#screen').classList.toggle('is-intro', phase === 'intro');
  muteBtn.classList.toggle('hidden', ['intro', 'form', 'success'].includes(phase));
  pausedHint.classList.add('hidden');
  if (phase === 'intro') {
    stage.innerHTML = `<div class="alarm">
      <div class="clock"><small>شنبه · صبح</small><b dir="ltr">۶:۳۰</b><span>⏰ زنگ — بیدار شو</span></div>
      <div class="bottom"><button class="stop" id="start" type="button">قطعش کن</button>
      <div class="brand">چند صبح دیگه؟</div>
      <p>یه تجربه‌ی دو دقیقه‌ای. صدای گوشی‌ات رو روشن کن.</p></div></div>`;
    $('#start').onclick = start;
  } else if (phase === 'age') {
    stage.innerHTML = `<div class="panel"><span class="eyebrow">یه حساب ساده…</span>
      <h1>چند سالته؟</h1>
      <div class="age-n"><b id="ageN">${fa(age)}</b><span>سال</span></div>
      <input id="range" type="range" min="18" max="70" step="1" value="${age}" aria-label="سن">
      <button class="primary" id="go" type="button">همینه</button>
      <div class="mornings" id="out"></div></div>`;
    const r = $('#range');
    const upd = () => { age = +r.value; $('#ageN').textContent = fa(age); r.style.setProperty('--p', `${100 - ((age - 18) / 52) * 100}%`); };
    r.oninput = () => { upd(); buzz(6); }; upd();
    $('#go').onclick = countMornings;
  } else if (phase === 'choice') {
    stage.innerHTML = `<div class="panel"><span class="eyebrow">فقط یه سؤال…</span>
      <h1>اگه هر هفته فقط <b>یه صبح</b><br>مال خودت بود…<br>باهاش چی کار می‌کردی؟</h1>
      <div class="cards">${MORNINGS.map((m, i) => `<button class="card" data-i="${i}" type="button"><i>${ICONS[i]}</i>${m}</button>`).join('')}</div>
      <div class="picked-note" id="note"></div></div>`;
    stage.querySelectorAll('.card').forEach((b) => (b.onclick = () => choose(+b.dataset.i)));
  } else if (phase === 'cta') {
    stage.innerHTML = `<div class="panel"><span class="eyebrow">بقیه‌ی ماجرا</span>
      <h1>می‌خوای ببینی<br>آدم‌های معمولی کنار کارشون<br><b>چی می‌سازن</b>؟</h1>
      <p>اسم و شماره‌ت رو بذار. یه گفت‌وگوی کوتاه؛ همه‌چیز شفاف… و تصمیم، با خودت.</p>
      <button class="primary" id="yes" type="button">آره، می‌خوام بدونم ←</button>
      <button class="ghost" id="share" type="button">برای کسی بفرستم که هنوز زنگ داره</button>
      <button class="ghost" id="again" type="button">دوباره از اول ببینم</button>
      <span class="note">درآمد تضمینی نیست · نتیجه به یادگیری و کار خودت بستگی داره</span></div>`;
    $('#yes').onclick = () => { phase = 'form'; render(); };
    $('#share').onclick = share;
    $('#again').onclick = restart;
  } else if (phase === 'form') {
    stage.innerHTML = `<form class="panel form" id="lead" novalidate>
      <div class="top-row"><span class="eyebrow">یک قدم تا گفت‌وگو</span><button type="button" class="link" id="back">بازگشت</button></div>
      <h1>اسمت و شماره‌ی موبایلت رو بنویس.</h1>
      <div class="trust"><span>بدون هزینه</span><span>بدون تعهد</span><span>فقط برای همین تماس</span></div>
      <label for="name">نام و نام خانوادگی</label>
      <input id="name" name="name" type="text" required minlength="2" maxlength="80" autocomplete="name" placeholder="نام تو">
      <label for="mobile">شماره موبایل</label>
      <input id="mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" maxlength="18" required placeholder="0912 345 6789">
      <div class="trap" aria-hidden="true"><input id="website" tabindex="-1" autocomplete="off"></div>
      <label class="consent"><input id="consent" type="checkbox" ${consent ? 'checked' : ''}><span>موافقم از نام و شماره‌ام فقط برای تماس درباره‌ی این درخواست استفاده شود.</span></label>
      <div class="err" id="err" role="alert"></div>
      <button class="primary" id="submit" type="submit" ${consent ? '' : 'disabled'}>ثبت درخواست گفت‌وگو</button>
      <span class="note">ثبت درخواست، تعهد به خرید یا همکاری نیست.</span></form>`;
    $('#consent').onchange = (e) => { consent = e.target.checked; $('#submit').disabled = !consent; };
    $('#back').onclick = () => { stopVoice(); phase = 'cta'; render(); };
    $('#lead').onsubmit = submitForm;
    ['#name', '#mobile'].forEach((q) => $(q).addEventListener('focus', (e) => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)));
  } else if (phase === 'success') {
    stage.innerHTML = `<div class="panel success"><div class="mark">✓</div><h1>درخواستت ثبت شد.</h1>
      <p>ممنون از اعتمادت. به‌زودی باهات تماس می‌گیریم.</p>
      <span class="ref">کد پیگیری: <b dir="ltr">${esc(fa(reference))}</b></span></div>`;
  } else {
    stage.innerHTML = '';
  }
}

// ---------- film ----------
function load(el, i) {
  if (!PARTS[i] || el.dataset.part === String(i)) return;
  el.dataset.part = String(i);
  el.src = PARTS[i].src;
  el.preload = 'auto';
  el.muted = muted;
  el.load();
}
function playPart(i) {
  part = i;
  const v = video();
  load(v, i);
  const old = vids.find((x) => x !== v);
  v.classList.remove('hidden');
  v.style.zIndex = '2'; old.style.zIndex = '1';
  const hideOld = () => { if (video() === v) old.classList.add('hidden'); };
  if (v.readyState >= 2 && !v.paused) hideOld(); else v.addEventListener('playing', hideOld, { once: true });
  setTimeout(hideOld, 1500);
  phase = 'play';
  render();
  v.play().catch(() => pausedHint.classList.remove('hidden'));
}
function next() {
  if (part === 0) { phase = 'age'; render(); return; }
  if (part === 2) { phase = 'choice'; render(); return; }
  if (part + 1 < PARTS.length) { cur = 1 - cur; playPart(part + 1); return; }
  toCta();
}
vids.forEach((v) => {
  v.addEventListener('ended', () => { if (v === video() && phase === 'play') next(); });
  v.addEventListener('timeupdate', () => { if (v === video() && v.currentTime > 2 && part + 1 < PARTS.length) load(other(), part + 1); });
  v.addEventListener('waiting', () => { if (v === video() && phase === 'play') loading.classList.remove('hidden'); });
  v.addEventListener('playing', () => { loading.classList.add('hidden'); pausedHint.classList.add('hidden'); });
  v.addEventListener('error', () => { if (v === video() && phase === 'play') { loading.classList.add('hidden'); toast('بارگذاری ویدئو کامل نشد. دوباره بزن تا ادامه پیدا کند.'); } });
});
$('#screen').addEventListener('click', (e) => {
  if (phase !== 'play' || e.target.closest('button')) return;
  const v = video();
  if (v.paused) { v.play().catch(() => {}); pausedHint.classList.add('hidden'); }
  else { v.pause(); pausedHint.classList.remove('hidden'); }
});
function toast(msg) {
  pausedHint.textContent = msg;
  pausedHint.classList.remove('hidden');
  setTimeout(() => { pausedHint.textContent = '▶ ادامه'; }, 4000);
}

// ---------- voice ----------
function say(key, done) {
  stopVoice();
  voice.src = VOICE[key];
  voice.muted = muted;
  let finished = false;
  const fin = () => { if (finished) return; finished = true; done && done(); };
  voice.onended = fin;
  voice.onerror = fin;
  voice.play().catch(fin);
  if (done) setTimeout(fin, 9000);
}
function stopVoice() { voice.onended = voice.onerror = null; voice.pause(); }

// ---------- interactions ----------
function start() {
  // this tap stops the alarm and unlocks sound for the whole film
  voice.src = VOICE.age; voice.muted = true;
  voice.play().then(() => { voice.pause(); voice.muted = muted; }).catch(() => { voice.muted = muted; });
  buzz([60, 40, 60]);
  load(other(), 1);
  prime(other());
  playPart(0);
}
function countMornings() {
  $('#go').disabled = true; $('#range').disabled = true;
  prime(other());
  const out = $('#out');
  if (age >= 65) {
    mornings = 0;
    out.innerHTML = '<span>تو دیگه زنگ نداری 🌿</span><small>ولی حتماً کسی رو می‌شناسی که هنوز داره… آخرش می‌تونی براش بفرستی.</small>';
    buzz(40);
    setTimeout(() => { cur = 1 - cur; playPart(1); }, 3800);
    return;
  }
  mornings = (65 - age) * 300;
  out.innerHTML = '<b id="mN">۰</b><span>صبح، با همین زنگ.</span><small>تا شصت‌وپنج سالگی · سالی ۳۰۰ روز کاری</small>';
  const el = $('#mN'), t0 = performance.now(), D = 1800;
  let lastTick = 0;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
    el.textContent = faNum(mornings * e);
    if (now - lastTick > 90 && k < 1) { buzz(8); lastTick = now; }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  say('age', () => { if (phase === 'age') { cur = 1 - cur; playPart(1); } });
}
function choose(i) {
  if (pick >= 0) return;
  pick = i;
  stage.querySelectorAll('.card').forEach((b) => b.classList.toggle(+b.dataset.i === i ? 'picked' : 'dim', true));
  $('#note').textContent = `✦ ${MORNINGS[i]}`;
  buzz([30, 80, 30]);
  prime(other());
  say('choice', () => { if (phase === 'choice') { cur = 1 - cur; playPart(3); } });
}
async function share() {
  const data = { title: 'چند صبح دیگه؟', text: 'یه حساب دو دقیقه‌ای… ببین چند صبح دیگه زنگ داری.', url: location.href.split('#')[0] };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(data.url);
    $('#share').textContent = 'لینک کپی شد ✓';
  } catch (e) { /* cancelled */ }
}
mini.addEventListener('click', (e) => { e.stopPropagation(); video().pause(); toCta(); });
function toCta() { phase = 'cta'; render(); say('cta'); }
function restart() {
  stopVoice(); cur = 0; pick = -1;
  vids.forEach((v) => { v.pause(); v.removeAttribute('src'); delete v.dataset.part; v.load(); });
  load(other(), 1);
  playPart(0);
}
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  muted = !muted;
  vids.forEach((v) => (v.muted = muted));
  voice.muted = muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'play') { video().pause(); pausedHint.classList.remove('hidden'); }
  if (document.hidden) voice.pause();
});

// ---------- form ----------
function makeRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function normalize(s) {
  return s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\D/g, '').replace(/^0098/, '0').replace(/^98/, '0');
}
async function submitForm(e) {
  e.preventDefault();
  if (busy || !consent) return;
  const err = $('#err'), submit = $('#submit');
  const name = $('#name').value.trim(), mobile = normalize($('#mobile').value);
  if (name.length < 2) { err.textContent = 'نامت رو کامل بنویس.'; $('#name').focus(); return; }
  if (!/^09\d{9}$/.test(mobile)) { err.textContent = 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.'; $('#mobile').focus(); return; }
  if (!LEAD_API) { err.textContent = 'ثبت درخواست هنوز باز نشده؛ لطفاً از طریق کسی که این لینک رو فرستاده پیگیری کن.'; return; }
  busy = true; err.textContent = ''; submit.disabled = true; submit.textContent = 'در حال ثبت…'; stopVoice();
  const summaries = [];
  if (mornings) summaries.push({ title: 'صبح‌های مونده تا ۶۵', priority: faNum(mornings) });
  if (pick >= 0) summaries.push({ title: 'یه صبح برای خودش', priority: MORNINGS[pick] });
  const payload = JSON.stringify({ name, mobile, consent: true, summaries });
  if (payload !== requestPayload) { requestId = makeRequestId(); requestPayload = payload; }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const ref = (new URLSearchParams(location.search).get('ref') || '').trim().slice(0, 80);
    const res = await fetch(LEAD_API, {
      method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ id: requestId, name, mobile, consent: true, website: $('#website').value, summaries, source: SOURCE, ...(ref ? { referralCode: ref } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'ثبت انجام نشد؛ دوباره تلاش کن.');
    reference = String(data.reference || requestId.slice(0, 8));
    phase = 'success'; render(); say('ok'); buzz([60, 80, 60]);
  } catch (x) {
    err.textContent = x.name === 'AbortError' ? 'ارتباط طول کشید؛ دوباره تلاش کن.' : x instanceof TypeError ? 'ارتباط برقرار نشد؛ دوباره تلاش کن.' : x.message || 'ارتباط برقرار نشد؛ دوباره تلاش کن.';
    submit.disabled = !consent; submit.textContent = 'ثبت درخواست گفت‌وگو';
  } finally { clearTimeout(timer); busy = false; }
}

render();
load(vids[0], 0);
