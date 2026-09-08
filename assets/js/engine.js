/* =========================================================================
   Движок психодиагностических анкет.

   Задача клиента — только показать вопросы и передать выбранные варианты.
   Подсчёт баллов, интерпретация и оформление отчёта живут на сервере
   (google-apps-script.gs): в браузере ученика нет ни ключей методики,
   ни результата.
   ========================================================================= */
(function () {
  'use strict';

  var T   = window.PSY_TEST;
  var CFG = window.PSY_CONFIG || {};
  var LETTERS = 'абвгдежзиклмн'.split('');

  var state = {
    student: null,
    answers: {},        // { номер вопроса: [индексы вариантов] }
    order:   {},        // порядок выбора внутри вопроса
    idx: 0,
    startedAt: null,
    sent: false
  };

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

  /* ====================================================== ЭКРАН 1: старт */
  function renderIntro(root) {
    var wrap = el('section', 'card');
    wrap.innerHTML =
      '<h1>' + esc(T.title) + '</h1>' +
      '<p class="sub">' + esc(T.author) + ' · ' + esc(T.audience) + '</p>' +
      '<p class="greet">' + esc(T.greeting) + '</p>' +
      '<p class="instr">' + T.instruction + '</p>' +
      '<p class="meta">Вопросов: ' + T.questions.length + ' · займёт около 7–10 минут</p>' +
      '<form id="startForm" novalidate>' +
        '<label>Фамилия и имя <span class="req">*</span>' +
          '<input name="fio" autocomplete="name" required placeholder="Иванов Иван">' +
        '</label>' +
        '<label>Класс <span class="req">*</span>' +
          '<input name="klass" required placeholder="7 Б">' +
        '</label>' +
        (CFG.askSchool ? '<label>Школа<input name="school" placeholder="МБОУ СОШ №1"></label>' : '') +
        '<p class="err" id="startErr" hidden></p>' +
        '<button class="btn primary" type="submit">Начать</button>' +
      '</form>';

    $('#startForm', wrap).addEventListener('submit', function (e) {
      e.preventDefault();
      var fio = this.fio.value.trim().replace(/\s+/g, ' ');
      var klass = this.klass.value.trim();
      var err = $('#startErr', wrap);
      if (fio.length < 3 || fio.indexOf(' ') === -1) {
        err.textContent = 'Напиши фамилию и имя полностью.';
        err.hidden = false;
        return;
      }
      if (!klass) {
        err.textContent = 'Укажи класс.';
        err.hidden = false;
        return;
      }
      state.student = {
        fio: fio, klass: klass,
        school: this.school ? this.school.value.trim() : ''
      };
      state.startedAt = Date.now();
      state.idx = 0;
      renderQuiz(root);
    });

    root.innerHTML = '';
    root.appendChild(wrap);
  }

  /* ====================================================== ЭКРАН 2: вопросы */
  function renderQuiz(root) {
    var q = T.questions[state.idx];
    var need = T.choicesRequired;
    if (!state.answers[q.n]) { state.answers[q.n] = []; state.order[q.n] = []; }

    var wrap = el('section', 'card quiz');
    var pct = Math.round(state.idx / T.questions.length * 100);

    wrap.innerHTML =
      '<div class="progress"><div class="bar" style="width:' + pct + '%"></div></div>' +
      '<p class="counter">Вопрос ' + (state.idx + 1) + ' из ' + T.questions.length + '</p>' +
      '<h2 class="stem">' + esc(q.stem) + '</h2>' +
      '<p class="hint">Выбери <b>ровно ' + need + '</b> варианта</p>' +
      '<ul class="opts" id="opts"></ul>' +
      '<div class="nav">' +
        '<button class="btn ghost" id="prev"' + (state.idx === 0 ? ' disabled' : '') + '>Назад</button>' +
        '<button class="btn primary" id="next">' +
          (state.idx === T.questions.length - 1 ? 'Завершить' : 'Далее') +
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
      if (state.idx === T.questions.length - 1) finish(root);
      else { state.idx++; renderQuiz(root); }
    });

    root.innerHTML = '';
    root.appendChild(wrap);
    refresh();
    window.scrollTo(0, 0);
  }

  /* ====================================================== ОТПРАВКА */
  function buildPayload() {
    var mins = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000));
    return {
      testId: T.id,
      fio:    state.student.fio,
      klass:  state.student.klass,
      school: state.student.school,
      date:   stamp(new Date()),
      duration: mins + ' мин',
      answers: T.questions.map(function (q) {
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
        '<h1 class="thanks">Отправляем ответы…</h1>' +
        '<p class="sub">Не закрывай страницу, это займёт несколько секунд.</p>';
    }

    function done() {
      state.sent = true;
      stage.innerHTML =
        '<div class="tick" aria-hidden="true">✓</div>' +
        '<h1 class="thanks">' + esc(T.finalNote) + '</h1>' +
        '<p class="sub">Ответы отправлены психологу. Страницу можно закрыть.</p>';
    }

    function failed(msg) {
      stage.innerHTML =
        '<div class="cross" aria-hidden="true">!</div>' +
        '<h1 class="thanks">Ответы не отправились</h1>' +
        '<p class="sub warn">Проверь подключение к интернету и попробуй ещё раз.<br>' +
          '<span class="tiny">' + esc(msg) + '</span></p>' +
        '<button class="btn primary" id="retry">Отправить ещё раз</button>' +
        '<p class="sub tiny">Если не получается — скажи психологу, ' +
          'не закрывая эту страницу.</p>';
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
  window.PSY_START = function (rootSel) {
    var root = $(rootSel);
    renderIntro(root);
    window.addEventListener('beforeunload', function (e) {
      if (state.startedAt && !state.sent) { e.preventDefault(); e.returnValue = ''; }
    });
  };
})();
