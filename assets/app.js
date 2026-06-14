/* Five & A+ - app.js v2 (MCQ + legacy dual-mode, localStorage) */
'use strict';

/* ── Safe storage (private browsing fallback) ──────────────────────────────── */
const _store = (function() {
  try { _store.setItem('__test__','1'); _store.removeItem('__test__'); return window.localStorage; }
  catch(e) {
    var m = {};
    return { getItem: function(k){return m[k]||null;}, setItem: function(k,v){m[k]=String(v);},
             removeItem: function(k){delete m[k];}, get length(){return Object.keys(m).length;},
             key: function(i){return Object.keys(m)[i]||null;} };
  }
})();

/* ── storage keys ─────────────────────────────────────────────────────────── */
const P = 'fa2-';
function key(type, qid) { return P + type + '-' + qid; }

/* ── MCQ helpers (.q-item elements) ─────────────────────────────────────────
   Format:  <div class="q-item" data-qid="...">
              <ul class="q-choices">
                <li class="q-choice" data-correct="true"  onclick="mcqPick(this,'qid')">
                <li class="q-choice" data-correct="false" onclick="mcqPick(this,'qid')">
              </ul>
              <div class="q-explain" id="exp-{qid}" style="display:none">…</div>
            </div>
──────────────────────────────────────────────────────────────────────────── */

function allMcqItems() {
  return Array.from(document.querySelectorAll('.q-item[data-qid]'));
}

function mcqPick(el, qid) {
  var item = el.closest('.q-item');
  if (!item || item.classList.contains('answered')) return;
  item.classList.add('answered');

  var isCorrect = el.dataset.correct === 'true';
  el.classList.add(isCorrect ? 'correct' : 'wrong', 'fresh');
  if (!isCorrect) {
    item.querySelectorAll('.q-choice[data-correct="true"]').forEach(function(c) {
      c.classList.add('show-correct');
    });
  }
  item.querySelectorAll('.q-choice').forEach(function(c) { c.classList.add('picked'); });

  var exp = document.getElementById('exp-' + qid);
  if (exp) exp.style.display = 'block';

  var result = isCorrect ? 'right' : 'wrong';
  var chosenIdx = Array.from(item.querySelectorAll('.q-choice')).indexOf(el);
  _store.setItem(key('mcq-state', qid), result);
  _store.setItem(key('mcq-chosen', qid), chosenIdx);

  updateScores();
  updateBankScore(item.dataset.bank);
}

function loadMcqState() {
  allMcqItems().forEach(function(item) {
    var qid = item.dataset.qid;
    var result = _store.getItem(key('mcq-state', qid));
    var chosenIdx = _store.getItem(key('mcq-chosen', qid));
    if (result === null || chosenIdx === null) return;

    item.classList.add('answered');
    var choices = item.querySelectorAll('.q-choice');
    var chosen = choices[parseInt(chosenIdx, 10)];
    if (!chosen) return;

    chosen.classList.add(result === 'right' ? 'correct' : 'wrong');
    if (result === 'wrong') {
      item.querySelectorAll('.q-choice[data-correct="true"]').forEach(function(c) {
        c.classList.add('show-correct');
      });
    }
    choices.forEach(function(c) { c.classList.add('picked'); });
    var exp = document.getElementById('exp-' + qid);
    if (exp) exp.style.display = 'block';
  });
}

/* ── Legacy textarea helpers (.iq elements) ──────────────────────────────────
   Kept for backward compat with any course pages still using textarea format.
──────────────────────────────────────────────────────────────────────────── */

function allLegacyItems() {
  return Array.from(document.querySelectorAll('.iq[data-qid]'));
}

function setLegacyState(card, status) {
  var qid = card.dataset.qid;
  card.classList.remove('right', 'wrong');
  if (status === 'right' || status === 'wrong') card.classList.add(status);
  var st = card.querySelector('[data-state]');
  if (st) st.textContent = status === 'right' ? 'Correct' : status === 'wrong' ? 'Wrong' : 'Unmarked';
  if (status === 'right' || status === 'wrong') {
    _store.setItem(key('state', qid), status);
  } else {
    _store.removeItem(key('state', qid));
  }
  updateScores();
  updateBankScore(card.dataset.bank);
}

function saveLegacyAnswer(textarea) {
  var card = textarea.closest('.iq');
  if (card) _store.setItem(key('answer', card.dataset.qid), textarea.value);
}

function loadLegacyState() {
  allLegacyItems().forEach(function(card) {
    var qid = card.dataset.qid;
    var ta = card.querySelector('textarea[data-answer]');
    if (ta) {
      var saved = _store.getItem(key('answer', qid));
      if (saved !== null) ta.value = saved;
    }
    setLegacyState(card, _store.getItem(key('state', qid)) || '');
  });
}

/* ── Dashboard + bank scores ─────────────────────────────────────────────── */

function updateScores() {
  /* MCQ counts */
  var mcqItems = allMcqItems();
  var mcqRight = 0, mcqWrong = 0;
  mcqItems.forEach(function(item) {
    var s = _store.getItem(key('mcq-state', item.dataset.qid));
    if (s === 'right') mcqRight++;
    else if (s === 'wrong') mcqWrong++;
  });

  /* Legacy textarea counts */
  var legItems = allLegacyItems();
  var legRight = 0, legWrong = 0, legAnswered = 0;
  legItems.forEach(function(q) {
    if (q.classList.contains('right')) legRight++;
    if (q.classList.contains('wrong')) legWrong++;
    var ta = q.querySelector('textarea');
    if (ta && ta.value.trim()) legAnswered++;
  });

  var total    = mcqItems.length + legItems.length;
  var right    = mcqRight + legRight;
  var wrong    = mcqWrong + legWrong;
  var answered = (mcqRight + mcqWrong) + legAnswered;
  var unmarked = total - right - wrong;
  var pct      = total ? Math.round(right / total * 100) : 0;

  function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
  set('dash-total',    total);
  set('dash-answered', answered);
  set('dash-right',    right);
  set('dash-wrong',    wrong);
  set('dash-unmarked', unmarked);
  set('dash-pct',      pct + '%');
}

function updateBankScore(bankId) {
  if (!bankId) return;
  var el = document.querySelector('[data-bank-score="' + bankId + '"]');
  if (!el) return;

  /* MCQ in this bank */
  var mcqInBank = allMcqItems().filter(function(i) { return i.dataset.bank === bankId; });
  var mr = 0, mw = 0;
  mcqInBank.forEach(function(i) {
    var s = _store.getItem(key('mcq-state', i.dataset.qid));
    if (s === 'right') mr++; else if (s === 'wrong') mw++;
  });

  /* Legacy in this bank */
  var legInBank = allLegacyItems().filter(function(q) { return q.dataset.bank === bankId; });
  var lr = legInBank.filter(function(q) { return q.classList.contains('right'); }).length;
  var lw = legInBank.filter(function(q) { return q.classList.contains('wrong'); }).length;

  var total = mcqInBank.length + legInBank.length;
  var right = mr + lr;
  var wrong = mw + lw;
  var unmarked = total - right - wrong;
  el.textContent = right + ' / ' + total + ' correct (· ' + wrong + ' wrong)';
}

function refreshAllBankScores() {
  document.querySelectorAll('[data-bank-score]').forEach(function(el) {
    updateBankScore(el.dataset.bankScore);
  });
}

/* ── Reset helpers ───────────────────────────────────────────────────────── */

function resetBank(bankId) {
  if (!confirm('Reset this question bank? All picks and scores will be cleared.')) return;

  /* MCQ reset */
  document.querySelectorAll('.q-item[data-bank="' + bankId + '"]').forEach(function(item) {
    var qid = item.dataset.qid;
    item.classList.remove('answered');
    item.querySelectorAll('.q-choice').forEach(function(c) {
      c.classList.remove('correct', 'wrong', 'show-correct', 'picked');
    });
    var exp = document.getElementById('exp-' + qid);
    if (exp) exp.style.display = 'none';
    _store.removeItem(key('mcq-state', qid));
    _store.removeItem(key('mcq-chosen', qid));
  });

  /* Legacy reset */
  document.querySelectorAll('.iq[data-bank="' + bankId + '"]').forEach(function(card) {
    var ta = card.querySelector('textarea');
    if (ta) ta.value = '';
    card.querySelectorAll('details').forEach(function(d) { d.open = false; });
    _store.removeItem(key('answer', card.dataset.qid));
    setLegacyState(card, '');
  });

  updateScores();
  updateBankScore(bankId);
}

function resetAll() {
  if (!confirm('Clear ALL answers, picks, and lesson checkboxes on this page?')) return;

  /* clear MCQ */
  allMcqItems().forEach(function(item) {
    var qid = item.dataset.qid;
    item.classList.remove('answered');
    item.querySelectorAll('.q-choice').forEach(function(c) {
      c.classList.remove('correct', 'wrong', 'show-correct', 'picked');
    });
    var exp = document.getElementById('exp-' + qid);
    if (exp) exp.style.display = 'none';
    _store.removeItem(key('mcq-state', qid));
    _store.removeItem(key('mcq-chosen', qid));
  });

  /* clear legacy */
  allLegacyItems().forEach(function(q) {
    var ta = q.querySelector('textarea');
    if (ta) ta.value = '';
    q.querySelectorAll('details').forEach(function(d) { d.open = false; });
    _store.removeItem(key('answer', q.dataset.qid));
    setLegacyState(q, '');
  });

  /* clear progress checkboxes */
  document.querySelectorAll('input[data-progress]').forEach(function(cb) {
    cb.checked = false;
    _store.removeItem('fa-progress-' + cb.dataset.progress);
  });

  updateScores();
  refreshAllBankScores();
}

/* ── Global filter toggles ───────────────────────────────────────────────── */

function showGlobal(mode) {
  document.body.classList.remove('global-missed', 'global-correct', 'global-unmarked', 'global-all');
  if (mode === 'missed')   document.body.classList.add('global-missed');
  if (mode === 'correct')  document.body.classList.add('global-correct');
  if (mode === 'unmarked') document.body.classList.add('global-unmarked');
  /* 'all' clears filters - body class already removed above */
}

/* ── Search filter ───────────────────────────────────────────────────────── */

function filterSite() {
  var input = document.getElementById('q');
  if (!input) return;
  var q = input.value.toLowerCase().trim();
  document.querySelectorAll('.course, section[data-search]').forEach(function(el) {
    el.classList.toggle('hidden', !!(q && !el.innerText.toLowerCase().includes(q)));
  });
}

/* ── Navigation helper ───────────────────────────────────────────────────── */

function goBackSafe() {
  if (history.length > 1) history.back();
  else location.href = '../index.html';
}

/* ── Event delegation ────────────────────────────────────────────────────── */

document.addEventListener('input', function(e) {
  if (e.target.matches('textarea[data-answer]')) {
    saveLegacyAnswer(e.target);
    updateScores();
  }
});

document.addEventListener('change', function(e) {
  if (e.target.matches('input[data-progress]')) {
    _store.setItem('fa-progress-' + e.target.dataset.progress, e.target.checked ? '1' : '0');
  }
});

document.addEventListener('click', function(e) {
  var btn = e.target.closest('button');
  if (!btn) return;

  /* Legacy mark/clear buttons */
  if (btn.dataset.action === 'mark') {
    setLegacyState(btn.closest('.iq'), btn.dataset.status);
  }
  if (btn.dataset.action === 'clear') {
    var card = btn.closest('.iq');
    if (!card) return;
    var ta = card.querySelector('textarea');
    if (ta) ta.value = '';
    _store.removeItem(key('answer', card.dataset.qid));
    setLegacyState(card, '');
  }

  /* Legacy bank-action buttons (show/hide/missed/all/reset) */
  if (btn.dataset.bankAction) {
    var bankId = btn.dataset.bankTarget;
    var sec = document.querySelector('[data-bank="' + bankId + '"]');
    if (!sec) return;
    if (btn.dataset.bankAction === 'show')   sec.querySelectorAll('details.answer').forEach(function(d) { d.open = true; });
    if (btn.dataset.bankAction === 'hide')   sec.querySelectorAll('details.answer').forEach(function(d) { d.open = false; });
    if (btn.dataset.bankAction === 'missed') sec.classList.add('missed-filter');
    if (btn.dataset.bankAction === 'all')    sec.classList.remove('missed-filter');
    if (btn.dataset.bankAction === 'reset')  resetBank(bankId);
  }
});

/* ── Init ────────────────────────────────────────────────────────────────── */

(function init() {
  /* restore progress checkboxes */
  document.querySelectorAll('input[data-progress]').forEach(function(cb) {
    cb.checked = _store.getItem('fa-progress-' + cb.dataset.progress) === '1';
  });

  loadMcqState();
  loadLegacyState();
  updateScores();
  refreshAllBankScores();
})();

function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  if (sb) sb.classList.toggle('open');
}

/* ── Unit confidence rating ───────────────────────────────────────────── */
function rateUnit(uid, val) {
  _store.setItem('unit-rate-' + uid, val);
  renderStars(uid, val);
  var labels = ['','Just started 😅','Getting there 🙂','Feeling okay 😊','Pretty solid 💪','Got this! 🌟'];
  var lbl = document.getElementById('reviewLabel-' + uid);
  if (lbl) lbl.textContent = labels[val] || '';
}
function renderStars(uid, val) {
  var btns = document.querySelectorAll('#reviewStars-' + uid + ' .star-btn');
  btns.forEach(function(b) {
    b.classList.toggle('lit', parseInt(b.dataset.val) <= val);
  });
}
function initRatings() {
  document.querySelectorAll('.review-stars').forEach(function(el) {
    var uid = el.id.replace('reviewStars-','');
    var saved = parseInt(_store.getItem('unit-rate-' + uid)) || 0;
    if (saved) { renderStars(uid, saved); rateUnit(uid, saved); }
  });
}

/* ── Feedback widget ──────────────────────────────────────────────────── */
function toggleFeedback() {
  var panel = document.getElementById('feedbackPanel');
  if (panel) panel.classList.toggle('open');
}
function submitFeedback() {
  var txt = document.getElementById('feedbackText');
  var thanks = document.getElementById('feedbackThanks');
  var btn = document.querySelector('.feedback-submit');
  if (!txt || !txt.value.trim()) return;
  // Store locally (no backend)
  var fb = JSON.parse(_store.getItem('fa2-feedback') || '[]');
  fb.push({ page: location.pathname, text: txt.value.trim(), ts: Date.now() });
  _store.setItem('fa2-feedback', JSON.stringify(fb));
  txt.value = '';
  if (thanks) thanks.style.display = 'block';
  if (btn) btn.style.display = 'none';
  setTimeout(function() { toggleFeedback(); if (thanks) thanks.style.display = 'none'; if (btn) btn.style.display = ''; }, 2000);
}
document.addEventListener('DOMContentLoaded', initRatings);


/* ── Site review rating ───────────────────────────────────────────────── */
function rateSite(val) {
  _store.setItem('fa2-site-rating', val);
  var btns = document.querySelectorAll('#siteReviewStars .sr-star');
  btns.forEach(function(b) { b.classList.toggle('lit', parseInt(b.dataset.val) <= val); });
  var labels = ['','Not for me 😕','Could be better 🤔','Pretty helpful 😊','Really solid 💪','Love it! 🌟'];
  var lbl = document.getElementById('siteReviewLabel');
  if (lbl) lbl.textContent = labels[val] || '';
  // form is always visible
}
function submitSiteReview() {
  var name = document.getElementById('siteReviewName');
  var txt = document.getElementById('siteReviewText');
  var thanks = document.getElementById('siteReviewThanks');
  var form = document.getElementById('siteReviewForm');
  var reviews = JSON.parse(_store.getItem('fa2-site-reviews') || '[]');
  reviews.push({
    rating: _store.getItem('fa2-site-rating'),
    name: name ? name.value.trim() : '',
    text: txt ? txt.value.trim() : '',
    ts: Date.now()
  });
  _store.setItem('fa2-site-reviews', JSON.stringify(reviews));
  if (form) form.style.display = 'none';
  if (thanks) thanks.style.display = 'block';
}
(function initSiteReview() {
  var saved = parseInt(_store.getItem('fa2-site-rating')) || 0;
  if (saved) {
    document.querySelectorAll('#siteReviewStars .sr-star').forEach(function(b) {
      b.classList.toggle('lit', parseInt(b.dataset.val) <= saved);
    });
    var labels = ['','Not for me 😕','Could be better 🤔','Pretty helpful 😊','Really solid 💪','Love it! 🌟'];
    var lbl = document.getElementById('siteReviewLabel');
    if (lbl) lbl.textContent = labels[saved] || '';
  }
})();

/* ── Lesson completion ────────────────────────────────────────────────────── */
function initLessonProgress() {
  document.querySelectorAll('input[data-progress]').forEach(function(cb) {
    var id = cb.dataset.progress;
    if (_store.getItem('fa2-done-' + id) === '1') {
      cb.checked = true;
      var lesson = cb.closest('.lesson');
      if (lesson) lesson.classList.add('lesson-done');
    }
    cb.addEventListener('change', function() {
      _store.setItem('fa2-done-' + id, cb.checked ? '1' : '0');
      var lesson = cb.closest('.lesson');
      if (lesson) lesson.classList.toggle('lesson-done', cb.checked);
    });
  });
}
document.addEventListener('DOMContentLoaded', initLessonProgress);


/* ── Continue where you left off ─────────────────────────────────────────── */
function initContinueBanner() {
  var banner = document.getElementById('continueBanner');
  var link = document.getElementById('continueLink');
  if (!banner || !link) return;
  var sidebarLinks = Array.from(document.querySelectorAll('.sidebar-lesson-link'));
  if (!sidebarLinks.length) return;
  var allKeys = [];
  for (var i = 0; i < _store.length; i++) {
    var k = _store.key(i);
    if (k && k.startsWith('fa2-done-') && _store.getItem(k) === '1') allKeys.push(k);
  }
  if (!allKeys.length) return;
  var firstIncomplete = sidebarLinks.find(function(a) {
    var href = a.getAttribute('href') || '';
    var id = href.replace('#','');
    return !_store.getItem('fa2-done-' + id);
  });
  if (firstIncomplete) {
    link.href = firstIncomplete.getAttribute('href') || '#';
    link.textContent = firstIncomplete.querySelector('.sidebar-lesson-title')?.textContent || 'Next lesson';
    banner.style.display = 'flex';
  }
}
document.addEventListener('DOMContentLoaded', initContinueBanner);

/* ── Course theme attribution ──────────────────────────────────────────────
   Tags <body data-course="…"> from the URL so the per-course token blocks in
   site.css (accent colors + light-path character) apply on every page type
   without editing any page markup. */
(function courseTheme() {
  var COURSES = [
    'ap-art-history', 'ap-biology', 'ap-calculus-bc', 'ap-chemistry',
    'ap-comparative-government-and-politics', 'ap-computer-science-a',
    'ap-computer-science-principles', 'ap-english-language-composition',
    'ap-english-literature-composition', 'ap-environmental-science',
    'ap-european-history', 'ap-human-geography', 'ap-macroeconomics',
    'ap-microeconomics', 'ap-music-theory', 'ap-physics-1-2',
    'ap-physics-c-electricity-and-magnetism', 'ap-physics-c-mechanics',
    'ap-precalculus', 'ap-psychology', 'ap-u-s-government-politics',
    'ap-u-s-history', 'ap-world-history-modern',
    'college-algebra', 'college-trigonometry'
  ];
  var m = location.pathname.match(/\/(?:units|courses)\/([a-z0-9-]+)\.html$/);
  if (!m) return;
  var base = m[1], match = '';
  for (var i = 0; i < COURSES.length; i++) {
    var c = COURSES[i];
    if ((base === c || base.indexOf(c + '-') === 0) && c.length > match.length) match = c;
  }
  if (match) document.body.dataset.course = match;
})();

/* ── Motion layer (v6): progress bar + SVG light path + scroll reveals ─────
   Purely cosmetic. Everything is injected here, so no page HTML changes are
   needed and pages without JS render normally. Respects
   prefers-reduced-motion. Scroll work is rAF-gated with passive listeners;
   the only per-frame mutations are a transform and two dashoffset writes.
──────────────────────────────────────────────────────────────────────────── */
(function motionLayer() {
  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* reading progress bar */
  var bar = document.createElement('div');
  bar.id = 'fa-progress';
  document.body.appendChild(bar);

  /* Ambient glow layer - always present, sits deepest, never a hard line.
     This is the universal, always-safe brand atmosphere: soft course-colored
     corner glows that can never obstruct text. */
  var glowLayer = document.createElement('div');
  glowLayer.id = 'fa-glow';
  glowLayer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glowLayer);

  /* SVG light path */
  var NS = 'http://www.w3.org/2000/svg';
  var svg = null, glowEl = null, cometEl = null, pathLen = 0, cometLen = 0;
  var nodeHalo = null, nodeCore = null;
  var bandTop = 0, lpBandH = 0;   /* band geometry; SVG is fixed and slid by -scrollY */

  /* Text-bearing blocks the comet lane must never cross. We measure these
     (not full-width band wrappers) to find true whitespace gutters. */
  var LANE_SELS = '.mh-inner,.gateway,.lesson,.quiz-section,.dashboard,' +
    '.research-spotlight,.h5-section,.unit-review-wrap,.hero-inner,.cc-grid,' +
    '.feat-grid,.how-grid,.cta-band,.about-builder,.sr-inner,.iqbank';

  /* Smallest left/right whitespace gutter beside actual content. */
  function gutters(w) {
    var left = w, right = w, any = false;
    document.querySelectorAll(LANE_SELS).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 16) return;
      any = true;
      left = Math.min(left, Math.max(0, r.left));
      right = Math.min(right, Math.max(0, w - r.right));
    });
    return any ? { left: left, right: right } : { left: 0, right: 0 };
  }

  /* Vertical band between the page header (masthead/hero) and the footer -
     the only stretch of the document the light path may occupy. Measured in
     document coordinates. */
  function headerFooterBand() {
    var sy = window.scrollY || 0;
    var header = document.querySelector('.masthead, .hero, .top');
    var footer = document.querySelector('.site-footer, .footer-hub');
    var top = 0;
    if (header) {
      top = header.getBoundingClientRect().bottom + sy;
    } else {
      var tn = document.querySelector('.topnav, .navbar');
      if (tn) top = Math.min(tn.getBoundingClientRect().bottom + sy, 300); /* sticky-safe cap */
    }
    var docH = document.documentElement.scrollHeight;
    var bottom = footer ? footer.getBoundingClientRect().top + sy : docH;
    return { top: top + 28, bottom: Math.max(top, bottom - 28) };
  }

  /* Content-aware mode:
       'full' - flowing comet confined to a side gutter between the header
                and the footer (never crosses content). Needs a wide
                viewport, a real gutter, and enough travel distance.
       'glow' - ambient corner glow only (the safe default).
     Decided from measured layout, not viewport width alone. */
  function decideMode() {
    var w = window.innerWidth, h = window.innerHeight;
    if (document.documentElement.scrollWidth > w + 2) return 'glow'; // page already overflows → don't risk it
    if (w < 1000) return 'glow';                                   // no room beside content
    var g = gutters(w);
    if (Math.max(g.left, g.right) < 130) return 'glow';           // content too wide → no lane
    if (document.documentElement.scrollHeight - h < h * 0.6) return 'glow'; // too short to travel
    var band = headerFooterBand();
    if (band.bottom - band.top < h * 1.1) return 'glow';          // header→footer stretch too short
    return 'full';
  }

  /* deepen a #rrggbb / #rgb toward ink by amt (0..1); pass-through otherwise.
     On the light parchment theme the trail darkens (instead of whitening) so
     it stays visible against the bright background. */
  function shadeHex(hex, amt) {
    hex = (hex || '').trim();
    if (hex.charAt(0) !== '#') return hex || '#8b6914';
    hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    if (hex.length !== 6) return '#' + hex;
    var r = parseInt(hex.slice(0, 2), 16),
        g = parseInt(hex.slice(2, 4), 16),
        b = parseInt(hex.slice(4, 6), 16);
    r = Math.round(r + (26 - r) * amt);
    g = Math.round(g + (18 - g) * amt);
    b = Math.round(b + (8  - b) * amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function buildLightPath() {
    /* Tear down any existing comet first. */
    if (svg) { svg.remove(); svg = cometEl = glowEl = nodeHalo = nodeCore = null; pathLen = 0; }
    var mode = decideMode();
    document.body.dataset.lpMode = mode;
    glowLayer.classList.toggle('fa-glow-strong', mode !== 'full');
    if (mode !== 'full') return;   /* glow-only mode: no line at all */

    var w = window.innerWidth, h = window.innerHeight;
    var band = headerFooterBand();
    var bandH = Math.round(band.bottom - band.top);
    var g = gutters(w);
    var pad = 14, edge = 12;
    var side = g.right >= g.left ? 'right' : 'left';
    var contentEdge = side === 'right' ? (w - g.right) : g.left;
    var xOuter = side === 'right' ? (w - edge) : edge;
    var xInner = side === 'right' ? (contentEdge + pad) : (contentEdge - pad);
    var xMin = Math.min(xInner, xOuter), xMax = Math.max(xInner, xOuter);

    /* Derive the path styling from the active course accent (--AC) plus the
       course-family character tokens (--lp-*, set in site.css per family). */
    var bs     = getComputedStyle(document.body);
    var ac     = (bs.getPropertyValue('--AC') || '#8b6914').trim();
    var acDeep = shadeHex(ac, 0.30);
    var amp    = parseFloat(bs.getPropertyValue('--lp-amp'))   || 1;
    var cw     = parseFloat(bs.getPropertyValue('--lp-width')) || 3;
    var dash   = (bs.getPropertyValue('--lp-dash') || '').trim();

    /* Vertical meander spanning ONLY the header→footer band, in document
       coordinates: one sweep per ~viewport of travel, fluid families
       (amp ≥ 1.2) get extra sweeps. The inner extent scales with the family
       amplitude (capped so it can never leave the gutter). */
    var xOut = side === 'right' ? xMax : xMin;
    var xIn  = side === 'right' ? xMin : xMax;
    xIn = xOut + (xIn - xOut) * Math.min(amp, 1);
    var y0 = 14, y1 = bandH - 14;
    var span = y1 - y0;
    var waves = Math.max(2, Math.round(span / (h * 1.15)));
    if (amp >= 1.2) waves = Math.max(3, Math.round(waves * 1.3));
    var seg = span / waves;
    var d = 'M ' + xOut + ' ' + y0;
    for (var wv = 1; wv <= waves; wv++) {
      var xa = (wv - 1) % 2 === 0 ? xOut : xIn;
      var xb = wv % 2 === 0 ? xOut : xIn;
      var ya = y0 + (wv - 1) * seg, yb = y0 + wv * seg;
      d += ' C ' + xa + ' ' + (ya + seg * 0.55).toFixed(1) +
           ', '  + xb + ' ' + (yb - seg * 0.55).toFixed(1) +
           ', '  + xb + ' ' + yb.toFixed(1);
    }

    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'fa-lightpath');
    svg.setAttribute('width', w);
    svg.setAttribute('height', bandH);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + bandH);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.pointerEvents = 'none';   /* decorative: never intercept input */
    /* viewport-pinned: fixed at top:0, slid up by scroll so the band's current
       slice is always on screen (keeps the comet/rail in view while scrolling) */
    bandTop = band.top; lpBandH = bandH;
    svg.style.top = '0px';
    svg.style.height = bandH + 'px';
    svg.style.transform = 'translateY(' + (bandTop - window.scrollY) + 'px)';

    var defs = document.createElementNS(NS, 'defs');
    var grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', 'fa-lp-grad');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    [['0%', ac], ['100%', acDeep]].forEach(function(s) {
      var stop = document.createElementNS(NS, 'stop');
      stop.setAttribute('offset', s[0]);
      stop.setAttribute('stop-color', s[1]);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);

    var host = document.createElementNS(NS, 'g');
    svg.appendChild(host);

    function mkPath(cls, width) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-width', width);
      p.setAttribute('stroke-linecap', 'round');
      host.appendChild(p);
      return p;
    }
    var baseEl = mkPath('fa-lp-base', Math.max(2.5, cw * 0.9));
    if (dash && dash !== '0') baseEl.setAttribute('stroke-dasharray', dash);
    /* Soft glow = wide low-opacity stroke. No SVG blur filter here: a filter
       surface as tall as the whole document would be far too expensive, and
       the meander keeps a ≥14px pad from content so the wide stroke (≤9px
       half-width) still never touches text. */
    glowEl  = mkPath('fa-lp-glow', Math.max(12, cw * 5));
    cometEl = mkPath('fa-lp-comet', cw);
    glowEl.setAttribute('stroke', 'url(#fa-lp-grad)');
    cometEl.setAttribute('stroke', 'url(#fa-lp-grad)');

    /* glowing node at the head of the comet */
    function mkNode(r, cls) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', r);
      c.setAttribute('class', cls);
      host.appendChild(c);
      return c;
    }
    nodeHalo = mkNode(13, 'fa-lp-halo');
    nodeCore = mkNode(5, 'fa-lp-node');
    nodeHalo.style.fill = ac;          /* inline beats the stylesheet rule */
    nodeCore.style.fill = '#fff';

    /* Attach BEFORE measuring: getTotalLength() throws on detached geometry
       in Firefox, which previously killed the whole path. */
    document.body.prepend(svg);
    try {
      pathLen = cometEl.getTotalLength();
    } catch (e) {
      svg.remove(); svg = cometEl = glowEl = null; pathLen = 0;
      return;
    }
    cometLen = Math.min(460, pathLen * 0.3);
    [glowEl, cometEl].forEach(function(p) {
      p.setAttribute('stroke-dasharray', cometLen + ' ' + pathLen);
      p.setAttribute('stroke-dashoffset', 0);
    });
    placeNode(0);
  }

  function placeNode(offset) {
    if (!cometEl || !pathLen) return;
    var head = Math.min(pathLen, -offset + cometLen);
    var pt = cometEl.getPointAtLength(head);
    nodeHalo.setAttribute('cx', pt.x); nodeHalo.setAttribute('cy', pt.y);
    nodeCore.setAttribute('cx', pt.x); nodeCore.setAttribute('cy', pt.y);
  }

  /* rAF-driven updates; comet position is eased toward the target */
  var target = 0, current = 0, raf = null;

  function progress() {
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    return docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0;
  }

  /* Target dashoffset that places the comet's glowing node near the viewport
     centre (clamped to the band) — so the bright head is ALWAYS on screen
     while scrolling, regardless of how the band maps to document height. */
  function cometTarget() {
    if (!pathLen) return 0;
    var y0 = 14, y1 = lpBandH - 14;
    var localY = window.scrollY + window.innerHeight * 0.45 - bandTop;
    if (localY < y0) localY = y0; else if (localY > y1) localY = y1;
    var fracY = (y1 > y0) ? (localY - y0) / (y1 - y0) : 0;
    return -fracY * (pathLen - cometLen);
  }

  function tick() {
    raf = null;
    bar.style.transform = 'scaleX(' + progress() + ')';
    if (cometEl && pathLen) {
      target = cometTarget();
      if (reduced) {
        current = target;   /* no glide under reduced motion - direct set */
      } else {
        current += (target - current) * 0.14;
        if (Math.abs(target - current) < 0.5) current = target;
      }
      glowEl.setAttribute('stroke-dashoffset', current);
      cometEl.setAttribute('stroke-dashoffset', current);
      placeNode(current);
      if (current !== target) raf = requestAnimationFrame(tick);
    }
  }
  /* Slide the fixed SVG synchronously on every scroll event so the band always
     tracks the document and the comet/rail stay in view, independent of the
     rAF-driven easing (which can be throttled). */
  function onScroll() {
    if (svg) svg.style.transform = 'translateY(' + (bandTop - window.scrollY) + 'px)';
    if (!raf) raf = requestAnimationFrame(tick);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  var rsT = null;
  function rebuildSnap() {
    clearTimeout(rsT);
    rsT = setTimeout(function() {
      buildLightPath();
      /* snap easing state to the new geometry so the comet doesn't glide
         across the screen after a resize/relayout */
      if (pathLen) {
        current = target = cometTarget();
        glowEl.setAttribute('stroke-dashoffset', current);
        cometEl.setAttribute('stroke-dashoffset', current);
        placeNode(current);
        if (svg) svg.style.transform = 'translateY(' + (bandTop - window.scrollY) + 'px)';
      }
      onScroll();
    }, 150);
  }
  window.addEventListener('resize', rebuildSnap, { passive: true });
  /* Content height changes (lesson toggles, quiz explanations) move the
     footer - rebuild so the document-anchored path still ends above it. */
  if ('ResizeObserver' in window) {
    var lastDocH = document.documentElement.scrollHeight;
    new ResizeObserver(function() {
      var hNow = document.documentElement.scrollHeight;
      if (Math.abs(hNow - lastDocH) > 24) { lastDocH = hNow; rebuildSnap(); }
    }).observe(document.body);
  }

  buildLightPath();
  onScroll();

  /* scroll reveals */
  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('fa-in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0 });

    document.querySelectorAll(
      '.lesson,.quiz-section,.gateway,.dashboard,.cat-section,.about-builder,' +
      '.unit-review-wrap,.site-review-section,.feat,.how-step,.iqbank,.research-spotlight'
    ).forEach(function(el) {
      el.classList.add('fa-rv');
      io.observe(el);
    });
  }
})();
