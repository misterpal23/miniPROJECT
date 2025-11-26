/* KeyRush — script.js
   Purpose: robust monkeytype-style typing surface (time-mode focused).
   - Timer starts on first keystroke
   - Result overlay only shown after test finished
   - Per-char spans, efficient comparison, smooth current-word highlight/scroll
   - Guards for edge-cases (no immediate finish, clamps)
*/

const textContainer = document.getElementById('textContainer');
const inputArea = document.getElementById('inputArea');
const timerEl = document.getElementById('timer');
const wpmEl = document.getElementById('wpm');
const accuracyEl = document.getElementById('accuracy');
const mistakesEl = document.getElementById('mistakes');
const newTextBtn = document.getElementById('newTextBtn');
const restartBtn = document.getElementById('restartBtn');
const loader = document.getElementById('loader');
const darkToggle = document.getElementById('darkToggle');
const progressBar = document.getElementById('progressBar');
const timeSelect = document.getElementById('timeSelect');
const wordsSelect = document.getElementById('wordsSelect');

const resultOverlay = document.getElementById('resultOverlay');
const resultWpm = document.getElementById('resultWpm');
const resultAccuracy = document.getElementById('resultAccuracy');
const resultKeys = document.getElementById('resultKeys');
const resultCorrect = document.getElementById('resultCorrect');
const retryBtn = document.getElementById('retryBtn');
const newBtn = document.getElementById('newBtn');

let words = [];
let wordsRendered = [];
let charSpans = [];
let isStarted = false;
let startTime = null;
let endTime = null;
let timerId = null;
let duration = parseInt(timeSelect.value, 10) || 30;
let preloadedWords = parseInt(wordsSelect.value, 10) || 400;

/* small word pool fallback */
const WORD_POOL = [
  "practice","makes","progress","speed","accuracy","focus","consistency","typing","keyboard",
  "muscle","memory","ideas","flow","steady","mindful","improve","gradual","challenge","repeat",
  "growth","learn","effort","habit","routine","small","steps","big","results","soft","control",
  "rhythm","tempo","fluid","clean","sharp","precision","timing","compose","sentence","word",
  "random","quote","auto","append","infinite","mode","monkeytype","stability","quick","steady",
  "example","simple","complex","modern","design","aesthetic","smooth","fast","accurate","focus"
];

/* fetch quote with safe fallback */
async function fetchQuote() {
  try {
    const res = await fetch('https://api.quotable.io/random?minLength=40&maxLength=120');
    if (!res.ok) throw new Error('api fail');
    const data = await res.json();
    return data.content.trim();
  } catch (e) {
    return randomWords(12).trim();
  }
}

/* build n words mixing quotes fallback */
async function buildWords(n) {
  const list = [];
  const apiTries = Math.min(4, Math.floor(n / 20));
  for (let i = 0; i < apiTries; i++) {
    const q = await fetchQuote();
    if (q) list.push(...q.split(/\s+/));
  }
  while (list.length < n) {
    list.push(WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)]);
  }
  return list.slice(0, n).map(w => w.replace(/\s+/g, ' ').trim());
}

function randomWords(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(WORD_POOL[Math.floor(Math.random() * WORD_POOL.length)]);
  }
  return out.join(' ');
}

/* Render words into the DOM and build charSpans */
function renderWords(wordArray) {
  textContainer.innerHTML = '';
  wordsRendered = [];
  charSpans = [];
  const frag = document.createDocumentFragment();

  for (let wi = 0; wi < wordArray.length; wi++) {
    const w = wordArray[wi];
    const wordSpan = document.createElement('span');
    wordSpan.className = 'word';
    wordSpan.dataset.index = wi;

    for (const ch of w) {
      const chSpan = document.createElement('span');
      chSpan.className = 'char';
      chSpan.textContent = ch;
      wordSpan.appendChild(chSpan);
      charSpans.push(chSpan);
    }

    // trailing space char (NBSP to preserve spacing)
    const spaceSpan = document.createElement('span');
    spaceSpan.className = 'char';
    spaceSpan.textContent = '\u00A0';
    wordSpan.appendChild(spaceSpan);
    charSpans.push(spaceSpan);

    frag.appendChild(wordSpan);
    wordsRendered.push(wordSpan);
  }

  textContainer.appendChild(frag);
  if (wordsRendered[0]) wordsRendered[0].classList.add('current');
}

/* format seconds as mm:ss */
function formatTime(sec) {
  sec = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : Math.max(0, Math.floor(duration));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* show / hide result overlay safely */
function showResult() {
  if (!resultOverlay) return;
  resultOverlay.hidden = false;
  resultOverlay.style.position = 'absolute';
  resultOverlay.style.inset = 0;
}
function hideResult() {
  if (!resultOverlay) return;
  resultOverlay.hidden = true;
}

/* reset UI + timers */
function resetAll(keepLoader = false) {
  if (timerId) { clearInterval(timerId); timerId = null; }
  isStarted = false;
  startTime = null;
  endTime = null;
  inputArea.disabled = false;
  inputArea.value = '';
  timerEl.textContent = formatTime(duration);
  wpmEl.textContent = '0';
  accuracyEl.textContent = '100%';
  mistakesEl.textContent = '0';
  progressBar.style.width = '0%';

  for (const sp of charSpans) {
    if (sp && sp.classList) sp.classList.remove('correct', 'incorrect');
  }
  for (const w of wordsRendered) {
    if (w && w.classList) w.classList.remove('current', 'correct-word');
  }
  if (wordsRendered[0]) wordsRendered[0].classList.add('current');
  if (!keepLoader && loader) loader.style.display = 'none';
  hideResult();
  // ensure focus
  inputArea.focus();
}

/* start timer at first keystroke */
function startTimer() {
  if (isStarted) return;
  isStarted = true;
  startTime = Date.now();
  endTime = startTime + duration * 1000;
  // immediate update + set interval
  tickTimer();
  timerId = setInterval(tickTimer, 100);
}

/* timer tick - uses endTime guard */
function tickTimer() {
  if (!isStarted || !startTime || !endTime) return;
  const now = Date.now();
  const remainingMs = Math.max(0, endTime - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  timerEl.textContent = formatTime(remainingSec);

  const elapsedSec = Math.max(1, (now - startTime) / 1000);
  updateMetrics(elapsedSec);

  if (remainingMs <= 0) {
    clearInterval(timerId);
    timerId = null;
    // defensively only finish if we actually had a startTime
    if (startTime) finishTest();
  }
}

/* compute live metrics and update UI */
function updateMetrics(elapsedSec) {
  const typed = inputArea.value || '';
  const typedLen = Math.min(typed.length, charSpans.length);
  let correctChars = 0;
  let mismatches = 0;
  for (let i = 0; i < typedLen; i++) {
    const expected = charSpans[i].textContent === '\u00A0' ? ' ' : charSpans[i].textContent;
    const actual = typed[i];
    if (actual === expected) correctChars++;
    else mismatches++;
  }
  const minutes = Math.max(elapsedSec / 60, 1 / 60);
  const rawWpm = (correctChars / 5) / minutes;
  const bounded = Math.min(Math.round(rawWpm), 2000);
  wpmEl.textContent = isNaN(bounded) ? '0' : String(bounded);

  const acc = typedLen === 0 ? 100 : Math.round((correctChars / typedLen) * 100);
  accuracyEl.textContent = acc + '%';
  mistakesEl.textContent = mismatches;

  const now = Date.now();
  const elapsedTotal = Math.max(0, Math.min(duration, (now - (startTime || now)) / 1000));
  const pct = Math.round((elapsedTotal / duration) * 100);
  progressBar.style.width = pct + '%';
}

/* input handler: paint characters & maintain current-word highlight */
function handleInput() {
  const typedRaw = inputArea.value || '';
  // clamp typed length to available chars
  if (typedRaw.length > charSpans.length) {
    inputArea.value = typedRaw.slice(0, charSpans.length);
  }
  const typed = inputArea.value;

  // start timer on first real input
  if (!isStarted && typed.length > 0) startTimer();

  // clear classes in the visible buffer (cheap but fine for our sizes)
  for (let i = 0; i < charSpans.length; i++) {
    charSpans[i].classList.remove('correct', 'incorrect');
  }

  // set correct/incorrect classes
  for (let i = 0; i < typed.length && i < charSpans.length; i++) {
    const expected = charSpans[i].textContent === '\u00A0' ? ' ' : charSpans[i].textContent;
    if (typed[i] === expected) charSpans[i].classList.add('correct');
    else charSpans[i].classList.add('incorrect');
  }

  // update word highlight and correct-word flags
  updateCurrentWordHighlight(typed.length);
}

/* determine current word by caret and scroll into view */
function updateCurrentWordHighlight(caretPos) {
  let cumulative = 0;
  let wordIndex = 0;
  for (let wi = 0; wi < wordsRendered.length; wi++) {
    const wSpan = wordsRendered[wi];
    const wCharCount = wSpan.querySelectorAll('.char').length;
    if (caretPos < cumulative + wCharCount) { wordIndex = wi; break; }
    cumulative += wCharCount;
    if (wi === wordsRendered.length - 1) wordIndex = wi;
  }

  wordsRendered.forEach((w, idx) => {
    w.classList.remove('current');
    const chars = Array.from(w.querySelectorAll('.char'));
    const allCorrect = chars.slice(0, chars.length - 1).every(c => c.classList.contains('correct'));
    if (allCorrect) w.classList.add('correct-word'); else w.classList.remove('correct-word');
  });

  if (wordsRendered[wordIndex]) {
    wordsRendered[wordIndex].classList.add('current');
    // keep the current word visible & centered-ish horizontally (fast)
    try {
      wordsRendered[wordIndex].scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    } catch (e) { /* ignore in older browsers */ }
  }
}

/* finish test and show results */
function finishTest() {
  // Only finish if test was started
  if (!startTime) return;
  isStarted = false;
  inputArea.disabled = true;

  const typed = inputArea.value || '';
  let correctChars = 0;
  for (let i = 0; i < typed.length && i < charSpans.length; i++) {
    const expected = charSpans[i].textContent === '\u00A0' ? ' ' : charSpans[i].textContent;
    if (typed[i] === expected) correctChars++;
  }
  const elapsedSec = Math.max(1, ((Date.now() - (startTime || Date.now())) / 1000));
  const minutes = Math.max(elapsedSec / 60, 1 / 60);
  const wpm = Math.min(Math.round((correctChars / 5) / minutes), 2000);
  const acc = typed.length === 0 ? 100 : Math.round((correctChars / typed.length) * 100);

  resultWpm.textContent = isNaN(wpm) ? '0' : String(wpm);
  resultAccuracy.textContent = acc + '%';
  resultKeys.textContent = String(typed.length);
  resultCorrect.textContent = String(correctChars);

  showResult();
}

/* generate new words and render */
async function generateNewText() {
  loader.style.display = 'block';
  resetAll(true);

  duration = parseInt(timeSelect.value, 10) || 30;
  preloadedWords = parseInt(wordsSelect.value, 10) || 400;
  timerEl.textContent = formatTime(duration);

  try {
    words = await buildWords(preloadedWords);
  } catch (e) {
    words = randomWords(preloadedWords).split(' ');
  }
  renderWords(words);

  loader.style.display = 'none';
  resetAll(); // ensure UI clean without keeping loader
}

/* restart current attempt (same text) */
function restartAttempt() {
  resetAll();
}

/* theme toggle persistence */
darkToggle.addEventListener('change', (e) => {
  if (e.target.checked) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('kr_theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('kr_theme');
  }
});

/* event listeners */
inputArea.addEventListener('input', handleInput);
newTextBtn.addEventListener('click', generateNewText);
restartBtn.addEventListener('click', restartAttempt);

retryBtn.addEventListener('click', () => {
  restartAttempt();
  hideResult();
});
newBtn.addEventListener('click', () => {
  generateNewText();
  hideResult();
});

timeSelect.addEventListener('change', () => {
  duration = parseInt(timeSelect.value, 10) || 30;
  timerEl.textContent = formatTime(duration);
  restartAttempt();
});
wordsSelect.addEventListener('change', () => {
  preloadedWords = parseInt(wordsSelect.value, 10) || 400;
  generateNewText();
});

/* shortcuts */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    restartAttempt();
  }
  // quick focus to input on Escape
  if (e.key === 'Escape') {
    inputArea.focus();
  }
});

/* Init */
(async function init() {
  hideResult();

  // load theme
  const saved = localStorage.getItem('kr_theme');
  if (saved === 'dark') {
    darkToggle.checked = true;
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  duration = parseInt(timeSelect.value, 10) || 30;
  timerEl.textContent = formatTime(duration);

  await generateNewText();
  resetAll();
})();
