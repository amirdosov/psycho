/* =========================================================================
   Движок психодиагностических анкет.

   Задача клиента — только показать вопросы и передать выбранные варианты.
   Подсчёт баллов, интерпретация и оформление отчёта живут на сервере
   (google-apps-script.gs): в браузере ученика нет ни ключей методики,
   ни результата.

   ЯЗЫК. Если в data.js методики есть T.i18n (объект { код: {...текст} }),
   движок показывает переключатель языка и хранит выбор в localStorage —
   так следующий ученик на этом же телефоне попадает сразу в свой язык.
   Без T.i18n методика считается одноязычной, переключатель не показывается,
   а весь текст читается прямо с T (как раньше). Порядок и число вариантов
   в question.options должны совпадать между языками — сервер считает баллы
   по позиции варианта, а не по его тексту.
   ========================================================================= */
(function () {
  'use strict';

  var T   = window.PSY_TEST;
  var CFG = window.PSY_CONFIG || {};
  var LETTERS = 'абвгдежзиклмн'.split('');
  var LANG_KEY = 'psy_lang';
  var LANGS = T.i18n ? Object.keys(T.i18n) : null;
  var LANG_LABEL = { kk: 'ҚАЗ', ru: 'РУС' };

  var UI = {
    ru: {
      fioLabel: 'Имя и фамилия', fioPlaceholder: 'Имя Фамилия',
      classLabel: 'Класс',
      schoolLabel: 'Школа', schoolPlaceholder: 'МБОУ СОШ №1',
      startBtn: 'Начать',
      meta: function (n) { return 'Вопросов: ' + n + ' · займёт около 7–10 минут'; },
      errFio: 'Напиши имя и фамилию полностью.',
      errGrade: 'Выбери цифру класса.',
      errLetter: 'Выбери букву класса.',
      counter: function (i, total) { return 'Вопрос ' + i + ' из ' + total; },
      hint: function (need) { return 'Выбери <b>ровно ' + need + '</b> варианта'; },
      back: 'Назад', next: 'Далее', finishBtn: 'Завершить',
      sendingTitle: 'Отправляем ответы…',
      sendingSub: 'Не закрывай страницу, это займёт несколько секунд.',
      doneSub: 'Ответы отправлены психологу. Страницу можно закрыть.',
      failedTitle: 'Ответы не отправились',
      failedSub: 'Проверь подключение к интернету и попробуй ещё раз.',
      retryBtn: 'Отправить ещё раз',
      failedHint: 'Если не получается — скажи психологу, не закрывая эту страницу.'
    },
    kk: {
      fioLabel: 'Аты-жөні', fioPlaceholder: 'Аты Тегі',
      classLabel: 'Сынып',
      schoolLabel: 'Мектеп', schoolPlaceholder: 'Мектеп атауы',
      startBtn: 'Бастау',
      meta: function (n) { return 'Сұрақтар саны: ' + n + ' · шамамен 7–10 минут алады'; },
      errFio: 'Атыңды және тегіңді толық жаз.',
      errGrade: 'Сынып санын таңда.',
      errLetter: 'Сынып әрпін таңда.',
      counter: function (i, total) { return 'Сұрақ ' + i + ' / ' + total; },
      hint: function (need) { return '<b>Дәл ' + need + '</b> жауап нұсқасын таңда'; },
      back: 'Артқа', next: 'Келесі', finishBtn: 'Аяқтау',
      sendingTitle: 'Жауаптар жіберілуде…',
      sendingSub: 'Бетті жаппа, бұл бірнеше секунд алады.',
      doneSub: 'Жауаптар психологқа жіберілді. Бетті жабуға болады.',
      failedTitle: 'Жауаптар жіберілмеді',
      failedSub: 'Интернет байланысын тексеріп, қайта көріп көр.',
      retryBtn: 'Қайта жіберу',
      failedHint: 'Болмай жатса — бұл бетті жаппай, психологқа айт.'
    }
  };

  var state = {
    lang: pickInitialLang(),
    student: null,
    answers: {},        // { номер вопроса: [индексы вариантов] }
    order:   {},        // порядок выбора внутри вопроса
    idx: 0,
    startedAt: null,
    sent: false
  };

  function pickInitialLang() {
    if (!LANGS) return null;
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && T.i18n[saved]) return saved;
    } catch (ignored) {}
    return (T.defaultLang && T.i18n[T.defaultLang]) ? T.defaultLang : LANGS[0];
  }

  /* Текст методики на текущем языке; без T.i18n методика одноязычная —
     тогда весь текст лежит прямо на T. */
  function TT() { return T.i18n ? T.i18n[state.lang] : T; }
  function ui() { return UI[state.lang] || UI.ru; }

  /* ------------------------------------------------------------ утилиты */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp(d) {
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* Переключатель языка — рисуется первым в карточке, если методика
     двуязычная. rerender вызывается после смены языка, чтобы перерисовать
     текущий экран заново на новом языке, не теряя прогресс. */
  function renderLangSwitch(wrap, rerender) {
    if (!LANGS || LANGS.length < 2) return;
    var box = el('div', 'langswitch');
    LANGS.forEach(function (code) {
      var b = el('button', code === state.lang ? 'on' : '', LANG_LABEL[code] || code.toUpperCase());
      b.type = 'button';
      b.setAttribute('aria-pressed', code === state.lang ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (state.lang === code) return;
        state.lang = code;
        try { localStorage.setItem(LANG_KEY, code); } catch (ignored) {}
        try { document.documentElement.lang = code; } catch (ignored) {}
        rerender();
      });
      box.appendChild(b);
    });
    wrap.insertBefore(box, wrap.firstChild);
  }

  /* ====================================================== ЭКРАН 1: старт */
  function renderIntro(root) {
    var Tx = TT(), Ux = ui();
    try { document.title = Tx.title + ' — ' + Tx.author; } catch (ignored) {}
    var wrap = el('section', 'card');
    var picked = { grade: null, letter: null };

    wrap.innerHTML =
      '<h1>' + esc(Tx.title) + '</h1>' +
      '<p class="sub">' + esc(Tx.author) + ' · ' + esc(Tx.audience) + '</p>' +
      '<p class="greet">' + esc(Tx.greeting) + '</p>' +
      '<p class="instr">' + Tx.instruction + '</p>' +
      '<p class="meta">' + Ux.meta(Tx.questions.length) + '</p>' +
      '<form id="startForm" novalidate>' +
        '<label>' + esc(Ux.fioLabel) + ' <span class="req">*</span>' +
          '<input name="fio" autocomplete="name" required placeholder="' + esc(Ux.fioPlaceholder) + '">' +
        '</label>' +
        '<div class="field">' +
          '<span class="lab">' + esc(Ux.classLabel) + ' <span class="req">*</span></span>' +
          '<div class="chips" id="grades"></div>' +
          '<div class="chips" id="letters"></div>' +
        '</div>' +
        (CFG.askSchool ? '<label>' + esc(Ux.schoolLabel) +
          '<input name="school" placeholder="' + esc(Ux.schoolPlaceholder) + '"></label>' : '') +
        '<p class="err" id="startErr" hidden></p>' +
        '<button class="btn primary" type="submit">' + esc(Ux.startBtn) + '</button>' +
      '</form>';

    /* Ряд кнопок с единственным выбором */
    function chipRow(box, values, labels, onPick) {
      values.forEach(function (v, i) {
        var b = el('button', 'chip', esc(labels[i]));
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(box.children, function (c) {
            c.classList.remove('on');
            c.setAttribute('aria-pressed', 'false');
          });
          b.classList.add('on');
          b.setAttribute('aria-pressed', 'true');
          onPick(v);
        });
        box.appendChild(b);
      });
    }

    // наборы задаются в data.js — у другой методики они могут быть иными
    var grades = T.grades || [6, 7, 8, 9, 10, 11];
    var letters = T.letters || ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

    chipRow($('#grades', wrap), grades, grades, function (v) { picked.grade = v; });
    chipRow($('#letters', wrap), letters, letters, function (v) { picked.letter = v; });

    $('#startForm', wrap).addEventListener('submit', function (e) {
      e.preventDefault();
      var fio = this.fio.value.trim().replace(/\s+/g, ' ');
      var err = $('#startErr', wrap);

      function fail(msg) { err.textContent = msg; err.hidden = false; }

      if (fio.length < 3 || fio.indexOf(' ') === -1) {
        return fail(Ux.errFio);
      }
      if (picked.grade === null) return fail(Ux.errGrade);
      if (picked.letter === null) return fail(Ux.errLetter);

      state.student = {
        fio: fio,
        klass: String(picked.grade) + picked.letter,   // всегда вида «7Б» или «7»
        school: this.school ? this.school.value.trim() : ''
      };
      state.startedAt = Date.now();
      state.idx = 0;
      renderQuiz(root);
    });

    renderLangSwitch(wrap, function () { renderIntro(root); });

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  /* ====================================================== ЭКРАН 2: вопросы */
  function renderQuiz(root) {
    var Tx = TT(), Ux = ui();
    var q = Tx.questions[state.idx];
    var need = T.choicesRequired;
    if (!state.answers[q.n]) { state.answers[q.n] = []; state.order[q.n] = []; }

    var wrap = el('section', 'card quiz');
    var pct = Math.round(state.idx / Tx.questions.length * 100);

    wrap.innerHTML =
      '<div class="progress"><div class="bar" style="width:' + pct + '%"></div></div>' +
      '<p class="counter">' + esc(Ux.counter(state.idx + 1, Tx.questions.length)) + '</p>' +
      '<h2 class="stem">' + esc(q.stem) + '</h2>' +
      '<p class="hint">' + Ux.hint(need) + '</p>' +
      '<ul class="opts" id="opts"></ul>' +
      '<div class="nav">' +
        '<button class="btn ghost" id="prev"' + (state.idx === 0 ? ' disabled' : '') + '>' + esc(Ux.back) + '</button>' +
        '<button class="btn primary" id="next">' +
          (state.idx === Tx.questions.length - 1 ? esc(Ux.finishBtn) : esc(Ux.next)) +
        '</button>' +
      '</div>';

    var list = $('#opts', wrap);
    var nextBtn = $('#next', wrap);

    function refresh() {
      var sel = state.answers[q.n];
      Array.prototype.forEach.call(list.children, function (li, i) {
        var on = sel.indexOf(i) !== -1;
        li.classList.toggle('on', on);
        li.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      nextBtn.disabled = sel.length !== need;
    }

    q.options.forEach(function (text, i) {
      var li = el('li', 'opt');
      li.setAttribute('role', 'checkbox');
      li.setAttribute('tabindex', '0');
      li.innerHTML = '<span class="mark">' + LETTERS[i] + '</span>' +
                     '<span class="txt">' + esc(text) + '</span>';
      function toggle() {
        var sel = state.answers[q.n];
        var at = sel.indexOf(i);
        if (at !== -1) {
          sel.splice(at, 1);
          state.order[q.n] = state.order[q.n].filter(function (x) { return x !== i; });
        } else {
          if (sel.length >= need) {
            // заменяем вариант, выбранный раньше остальных
            var oldest = state.order[q.n].shift();
            sel.splice(sel.indexOf(oldest), 1);
          }
          sel.push(i);
          state.order[q.n].push(i);
        }
        refresh();
      }
      li.addEventListener('click', toggle);
      li.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
      });
      list.appendChild(li);
    });

    $('#prev', wrap).addEventListener('click', function () {
      if (state.idx > 0) { state.idx--; renderQuiz(root); }
    });
    nextBtn.addEventListener('click', function () {
      if (state.answers[q.n].length !== need) return;
      if (state.idx === Tx.questions.length - 1) finish(root);
      else { state.idx++; renderQuiz(root); }
    });

    renderLangSwitch(wrap, function () { renderQuiz(root); });

    root.innerHTML = '';
    root.appendChild(wrap);
    refresh();
    window.scrollTo(0, 0);
  }

  /* ====================================================== ОТПРАВКА */
  function buildPayload() {
    var Tx = TT();
    var mins = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
    return {
      testId: T.id,
      fio:    state.student.fio,
      klass:  state.student.klass,
      school: state.student.school,
      date:   stamp(new Date()),
      duration: mins + ' мин',
      answers: Tx.questions.map(function (q) {
        var picks = (state.answers[q.n] || []).slice().sort(function (a, b) { return a - b; });
        return {
          n: q.n,
          picks: picks,
          letters: picks.map(function (i) { return LETTERS[i]; }),
          texts:   picks.map(function (i) { return q.options[i]; }),
          stem:    q.stem
        };
      })
    };
  }

  function post(payload) {
    // text/plain — «простой» запрос: браузер не шлёт preflight,
    // и Apps Script принимает его без настройки CORS
    return fetch(CFG.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('сервер ответил ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'сервер отклонил ответы');
    });
  }

  function postWithRetry(payload, left) {
    return post(payload).catch(function (e) {
      if (left > 0) return postWithRetry(payload, left - 1);
      throw e;
    });
  }

  /* ====================================================== ЭКРАН 3: финал */
  function finish(root) {
    var Tx = TT(), Ux = ui();
    var payload = buildPayload();

    var wrap = el('section', 'card center');
    wrap.innerHTML =
      '<div class="progress"><div class="bar" style="width:100%"></div></div>' +
      '<div id="stage"></div>';
    root.innerHTML = '';
    root.appendChild(wrap);
    window.scrollTo(0, 0);

    var stage = $('#stage', wrap);

    function sending() {
      stage.innerHTML =
        '<div class="spinner" aria-hidden="true"></div>' +
        '<h1 class="thanks">' + esc(Ux.sendingTitle) + '</h1>' +
        '<p class="sub">' + esc(Ux.sendingSub) + '</p>';
    }

    function done() {
      state.sent = true;
      stage.innerHTML =
        '<div class="tick" aria-hidden="true">✓</div>' +
        '<h1 class="thanks">' + esc(Tx.finalNote) + '</h1>' +
        '<p class="sub">' + esc(Ux.doneSub) + '</p>';
    }

    function failed(msg) {
      stage.innerHTML =
        '<div class="cross" aria-hidden="true">!</div>' +
        '<h1 class="thanks">' + esc(Ux.failedTitle) + '</h1>' +
        '<p class="sub warn">' + esc(Ux.failedSub) + '<br>' +
          '<span class="tiny">' + esc(msg) + '</span></p>' +
        '<button class="btn primary" id="retry">' + esc(Ux.retryBtn) + '</button>' +
        '<p class="sub tiny">' + esc(Ux.failedHint) + '</p>';
      $('#retry', stage).addEventListener('click', attempt);
    }

    function attempt() {
      sending();
      postWithRetry(payload, CFG.retries == null ? 2 : CFG.retries)
        .then(done)
        .catch(function (e) { failed(e.message); });
    }

    attempt();
  }

  /* ====================================================== запуск */

  /* Safari на iOS намеренно игнорирует user-scalable в мета-теге, поэтому
     щипок гасим событиями жестов. Двойной тап убирает touch-action в CSS.
     Оговорка: масштабирование — средство доступности, и мы его отбираем;
     ради этого весь текст в анкете набран крупно и контрастно. */
  function lockZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
  }

  window.PSY_START = function (rootSel) {
    var root = $(rootSel);
    lockZoom();
    if (state.lang) { try { document.documentElement.lang = state.lang; } catch (ignored) {} }
    renderIntro(root);
    window.addEventListener('beforeunload', function (e) {
      if (state.startedAt && !state.sent) { e.preventDefault(); e.returnValue = ''; }
    });
  };
})();
