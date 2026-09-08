/* =========================================================================
   ПРИЁМНИК РЕЗУЛЬТАТОВ

   Здесь происходит всё, что ученик не должен видеть: ключи методики,
   подсчёт баллов, интерпретация, оформление PDF и отправка письма.
   Браузер ученика присылает только сырые ответы («выбраны варианты а и д»)
   и не знает, сколько они стоят.

   ────────────────────────────────────────────────────────────────────────
   КАК ПОДКЛЮЧИТЬ (один раз, ~3 минуты)

   1. Создайте Google-таблицу — она станет журналом результатов.
   2. В ней: Расширения → Apps Script. Удалите всё из редактора
      и вставьте этот файл целиком.
   3. Впишите свой адрес в строку EMAIL ниже (сейчас там заглушка).
   4. Развернуть → Новое развёртывание → шестерёнка → «Веб-приложение»:
          Описание:          приёмник результатов
          Запуск от имени:   Я
          Кто имеет доступ:  Все
      «Развернуть» → «Предоставить доступ» → выберите свой аккаунт.
      Google покажет предупреждение «Приложение не проверено» — это нормально
      для собственных скриптов: «Дополнительные настройки» → «Перейти…».
   5. Скопируйте выданный URL (оканчивается на /exec) и вставьте его
      в assets/js/config.js в поле gasUrl.

   ВАЖНО: после каждой правки этого скрипта нужно заново выпустить версию:
   Развернуть → Управление развёртываниями → карандаш → Версия: «Новая» →
   Развернуть. Иначе сайт продолжит работать со старым кодом.
   ========================================================================= */

var EMAIL = 'ВАША_ПОЧТА@example.com';   // ← впишите сюда свой адрес
var SHEET = 'Результаты';             // имя листа-журнала

/* ============================================================== ПАЛИТРА */
var C = {
  ink:    '#1a2233',
  muted:  '#6b7689',
  line:   '#e3e8f0',
  track:  '#eef1f7',
  accent: '#3b6ef5',
  soft:   '#f4f6fb',
  pos:    '#15803d',
  neg:    '#dc2626'
};

/* Цвет уровня: I очень высокий → V низкий */
var LEVEL_COLOR = {
  'I': '#15803d', 'II': '#4d9e3f', 'III': '#3b6ef5', 'IV': '#d97706', 'V': '#dc2626'
};

/* ================================================================ КЛЮЧИ
   Ключи всех методик. Чтобы добавить новую — допишите ещё один объект
   с id, совпадающим с полем id в data.js на сайте.
   ====================================================================== */
var KEYS = {

  'motivaciya-lukyanova': {

    title:  'Методика изучения мотивации обучения',
    author: 'М.И. Лукьянова, Н.В. Калинина',

    blocks: {
      I:   { name: 'Личностный смысл учения',                   qs: [1, 2, 3],    max: 29 },
      II:  { name: 'Способность к целеполаганию',               qs: [4, 5, 6],    max: 29 },
      III: { name: 'Виды мотивов',                              qs: [7, 8, 9],    max: 23 },
      IV:  { name: 'Внутренняя / внешняя мотивация',            qs: [10, 11, 12] },
      V:   { name: 'Стремление к успеху / недопущение неудачи', qs: [13, 14, 15] },
      VI:  { name: 'Реализация мотивов в поведении',            qs: [16, 17, 18] }
    },

    /* Таблица 1 методики. Индекс = вариант ответа (0 = «а»).
       Балл соответствует мотиву: 0 внешний · 1 игровой · 2 отметка ·
       3 позиционный · 4 социальный · 5 учебный                            */
    points: {
      1: [2, 5, 4, 3, 5, 0],
      2: [0, 0, 0, 5, 3, 4, 3, 4],
      3: [2, 5, 2, 4, 5, 3],
      4: [3, 0, 2, 5, 4, 4],
      5: [4, 5, 5, 0, 3, 2],
      6: [3, 5, 5, 3, 0, 1],
      7: [1, 4, 3, 3, 5, 1, 3],
      8: [3, 1, 3, 3, 0, 0, 2],
      9: [3, 1, 3, 3, 0, 5]
    },

    /* Полярная шкала блоков IV–VI: «+» = +5, «-» = −5.
       ВНИМАНИЕ: в исходном документе методики таблицы этого ключа нет —
       раскладка восстановлена по описанному правилу (внутренняя мотивация,
       стремление к успеху и активное поведение → +5). При наличии
       оригинальной таблицы поправьте эти девять строк.                    */
    polar: {
      10: '+---+-',
      11: '-+-+-+',
      12: '+-+-+-',
      13: '--++-+',
      14: '+++---',
      15: '---+-+',
      16: '+--+--',
      17: '+-+-+-',
      18: '-+-+++'
    },

    /* Таблица 2: минимальная сумма баллов для уровня */
    levels: [
      { level: 'I',   name: 'очень высокий',        I: 27, II: 25, III: 20, total: 70 },
      { level: 'II',  name: 'высокий',              I: 24, II: 20, III: 16, total: 58 },
      { level: 'III', name: 'нормальный (средний)', I: 18, II: 13, III: 10, total: 39 },
      { level: 'IV',  name: 'сниженный',            I: 10, II:  6, III:  4, total: 18 },
      { level: 'V',   name: 'низкий',               I:  0, II:  0, III:  0, total:  0 }
    ],
    totalMax: 81,

    motives: [
      { short: 'В', name: 'внешний',             color: '#94a3b8' },
      { short: 'И', name: 'игровой',             color: '#a78bfa' },
      { short: 'О', name: 'оценочный (отметка)', color: '#fbbf24' },
      { short: 'П', name: 'позиционный',         color: '#38bdf8' },
      { short: 'С', name: 'социальный',          color: '#34d399' },
      { short: 'У', name: 'учебный',             color: '#3b6ef5' }
    ],

    verdicts: {
      IV: { high: 'явное преобладание внутренних мотивов над внешними',
            mid:  'внешние и внутренние мотивы выражены примерно в равной степени',
            low:  'явное преобладание внешних мотивов над внутренними' },
      V:  { high: 'выраженное стремление к успеху в учебной деятельности',
            mid:  'присутствует как стремление к успеху, так и недопущение неудач',
            low:  'преобладает стремление к недопущению неудач над стремлением к успеху' },
      VI: { high: 'учебные мотивы активно реализуются в поведении',
            mid:  'учебные мотивы реализуются в поведении довольно редко',
            low:  'отсутствует поведенческая активность при реализации учебных мотивов' }
    },

    polarLabels: {
      IV: ['внешняя мотивация', 'внутренняя мотивация'],
      V:  ['недопущение неудачи', 'стремление к успеху'],
      VI: ['пассивность', 'активная реализация']
    }
  }
};

/* ========================================================= ТОЧКА ВХОДА */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var K = KEYS[d.testId];
    if (!K) throw new Error('Неизвестная методика: ' + d.testId);

    var res = score(K, d.answers);
    var pdf = makePdf(K, d, res);

    MailApp.sendEmail({
      to: EMAIL,
      subject: 'Результат · ' + d.fio + ' · ' + d.klass + ' класс · уровень ' +
               res.levels.total.level + ' (' + res.levels.total.name + ')',
      htmlBody: emailHtml(K, d, res),
      body: plainText(K, d, res),
      attachments: [pdf],
      name: 'Психодиагностика'
    });

    logToSheet(K, d, res);
    return json({ ok: true });

  } catch (err) {
    // письмо об ошибке, чтобы сбой не остался незамеченным
    try {
      MailApp.sendEmail(EMAIL, 'Ошибка приёма результата',
        String(err) + '\n\n' + (e && e.postData ? e.postData.contents : ''));
    } catch (ignored) {}
    return json({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json({ ok: true, info: 'Приёмник результатов работает.' });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================== ПОДСЧЁТ */
function levelFor(K, sum, column) {
  for (var i = 0; i < K.levels.length; i++) {
    if (sum >= K.levels[i][column]) return K.levels[i];
  }
  return K.levels[K.levels.length - 1];
}

function verdictFor(K, sum, block) {
  var v = K.verdicts[block];
  if (sum >= 20) return v.high;
  if (sum <= -20) return v.low;
  return v.mid;
}

function blockOf(K, n) {
  for (var b in K.blocks) {
    if (K.blocks[b].qs.indexOf(n) !== -1) return b;
  }
  return '';
}

function score(K, answers) {
  var res = {
    points: { I: 0, II: 0, III: 0 },
    polar:  { IV: 0, V: 0, VI: 0 },
    motivesIII: [0, 0, 0, 0, 0, 0],
    motivesAll: [0, 0, 0, 0, 0, 0],
    rows: []
  };

  answers.forEach(function (a) {
    var b = blockOf(K, a.n);
    var row = { n: a.n, block: b, stem: a.stem, letters: a.letters,
                texts: a.texts, values: [] };

    a.picks.forEach(function (i) {
      if (K.points[a.n]) {
        var p = K.points[a.n][i];
        res.points[b] += p;
        res.motivesAll[p]++;
        if (b === 'III') res.motivesIII[p]++;
        row.values.push(String(p));
      } else {
        var s = K.polar[a.n].charAt(i) === '+' ? 5 : -5;
        res.polar[b] += s;
        row.values.push(s > 0 ? '+5' : '−5');
      }
    });
    res.rows.push(row);
  });

  res.total = res.points.I + res.points.II + res.points.III;
  res.levels = {
    I:     levelFor(K, res.points.I,   'I'),
    II:    levelFor(K, res.points.II,  'II'),
    III:   levelFor(K, res.points.III, 'III'),
    total: levelFor(K, res.total,      'total')
  };
  res.verdicts = {
    IV: verdictFor(K, res.polar.IV, 'IV'),
    V:  verdictFor(K, res.polar.V,  'V'),
    VI: verdictFor(K, res.polar.VI, 'VI')
  };
  return res;
}

/* ==================================================== ГРАФИКА НА ТАБЛИЦАХ
   Конвертер HTML → PDF в Apps Script понимает только простую вёрстку:
   таблицы, атрибуты bgcolor/width и базовые inline-стили. Поэтому все
   диаграммы собраны из ячеек таблицы — так они одинаково выглядят
   и в PDF, и в письме.
   ====================================================================== */

function cell(w, color, h) {
  return '<td width="' + w + '%" bgcolor="' + color + '" ' +
         'style="background-color:' + color + ';height:' + h + 'px;' +
         'font-size:1px;line-height:' + h + 'px;">&nbsp;</td>';
}

function tbl(inner, extra) {
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
         'style="border-collapse:collapse;' + (extra || '') + '"><tr>' +
         inner + '</tr></table>';
}

/* Обычная полоса заполнения, 0–100 % */
function barH(pct, color, h) {
  h = h || 13;
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  var s = '';
  if (pct > 0)   s += cell(pct, color, h);
  if (pct < 100) s += cell(100 - pct, C.track, h);
  return tbl(s, 'border-radius:3px;');
}

/* Двусторонняя полоса для полярной шкалы, значение от -max до +max */
function barDiverging(value, max) {
  var mag = Math.round(Math.abs(value) / max * 100);
  var h = 15;
  var left, right;

  if (value < 0) {
    left = tbl(cell(100 - mag, C.track, h) + cell(mag, C.neg, h));
    right = tbl(cell(100, C.track, h));
  } else if (value > 0) {
    left = tbl(cell(100, C.track, h));
    right = tbl(cell(mag, C.pos, h) + cell(100 - mag, C.track, h));
  } else {
    left = tbl(cell(100, C.track, h));
    right = tbl(cell(100, C.track, h));
  }

  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
         'style="border-collapse:collapse;"><tr>' +
         '<td width="49%">' + left + '</td>' +
         '<td width="2%" bgcolor="' + C.ink + '" style="background-color:' + C.ink +
             ';height:' + h + 'px;font-size:1px;">&nbsp;</td>' +
         '<td width="49%">' + right + '</td>' +
         '</tr></table>';
}

/* Строка диаграммы: подпись слева, полоса, значение справа */
function chartRow(label, sub, barHtml, value, valueColor) {
  return '<tr>' +
    '<td style="padding:9px 0 3px 0;font-size:12px;color:' + C.ink + ';">' +
      '<b>' + label + '</b>' +
      (sub ? ' <span style="color:' + C.muted + ';">' + sub + '</span>' : '') +
    '</td>' +
    '<td align="right" style="padding:9px 0 3px 0;font-size:12px;' +
        'color:' + (valueColor || C.ink) + ';"><b>' + value + '</b></td>' +
  '</tr>' +
  '<tr><td colspan="2" style="padding:0 0 4px 0;">' + barHtml + '</td></tr>';
}

/* ------------------------------------- диаграмма показателей I, II, III */
function chartPoints(K, res) {
  var h = '<table width="100%" cellpadding="0" cellspacing="0" border="0">';
  ['I', 'II', 'III'].forEach(function (b) {
    var v = res.points[b], max = K.blocks[b].max, lv = res.levels[b];
    h += chartRow(
      b + '. ' + K.blocks[b].name,
      '',
      barH(v / max * 100, LEVEL_COLOR[lv.level]),
      v + ' / ' + max + ' &nbsp;·&nbsp; ' + lv.name,
      LEVEL_COLOR[lv.level]
    );
  });
  h += '</table>';
  return h;
}

/* ------------------------------------ диаграмма показателей IV, V, VI */
function chartPolar(K, res) {
  var h = '<table width="100%" cellpadding="0" cellspacing="0" border="0">';
  ['IV', 'V', 'VI'].forEach(function (b) {
    var v = res.polar[b];
    var lab = K.polarLabels[b];
    h += chartRow(
      b + '. ' + K.blocks[b].name, '',
      barDiverging(v, 30),
      (v > 0 ? '+' : '') + String(v).replace('-', '−'),
      v >= 20 ? C.pos : (v <= -20 ? C.neg : C.ink)
    );
    h += '<tr><td style="font-size:10px;color:' + C.muted + ';padding-bottom:6px;">← ' +
         lab[0] + '</td><td align="right" style="font-size:10px;color:' + C.muted +
         ';padding-bottom:6px;">' + lab[1] + ' →</td></tr>';
    h += '<tr><td colspan="2" style="font-size:11px;color:' + C.muted +
         ';padding-bottom:10px;">' + esc(res.verdicts[b]) + '</td></tr>';
  });
  h += '</table>';
  return h;
}

/* ------------------------------------------------ диаграмма мотивов */
function chartMotives(K, counts, caption) {
  var total = 0;
  counts.forEach(function (c) { total += c; });
  if (!total) total = 1;

  var h = '<p style="margin:0 0 6px 0;font-size:11px;color:' + C.muted + ';">' +
          caption + '</p>' +
          '<table width="100%" cellpadding="0" cellspacing="0" border="0">';

  // от самого частого к редкому — так картина читается сразу
  var idx = [0, 1, 2, 3, 4, 5].sort(function (a, b) { return counts[b] - counts[a]; });

  idx.forEach(function (i) {
    var m = K.motives[i], c = counts[i];
    var pct = Math.round(c * 100 / total);
    h += '<tr>' +
      '<td width="42%" style="font-size:11px;color:' + C.ink + ';padding:3px 8px 3px 0;">' +
        m.name + '</td>' +
      '<td width="43%" style="padding:3px 0;">' + barH(c / total * 100, m.color, 10) + '</td>' +
      '<td width="15%" align="right" style="font-size:11px;color:' + C.muted +
        ';padding:3px 0 3px 8px;">' + c + ' · ' + pct + '%</td>' +
    '</tr>';
  });
  h += '</table>';
  return h;
}

/* ============================================================ ОФОРМЛЕНИЕ */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Крупная плашка с итоговым уровнем */
function totalCard(K, res) {
  var lv = res.levels.total;
  var col = LEVEL_COLOR[lv.level];
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="border-collapse:collapse;border:1px solid ' + C.line + ';border-radius:8px;">' +
    '<tr>' +
      '<td width="6" bgcolor="' + col + '" style="background-color:' + col + ';">&nbsp;</td>' +
      '<td style="padding:14px 16px;">' +
        '<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:' +
          C.muted + ';">ИТОГОВЫЙ УРОВЕНЬ МОТИВАЦИИ</div>' +
        '<div style="font-size:21px;font-weight:bold;color:' + col + ';padding-top:3px;">' +
          'Уровень ' + lv.level + ' — ' + lv.name + '</div>' +
        '<div style="font-size:12px;color:' + C.muted + ';padding-top:3px;">' +
          res.total + ' баллов из ' + K.totalMax + ' (сумма показателей I, II, III)</div>' +
        '<div style="padding-top:9px;">' + barH(res.total / K.totalMax * 100, col, 9) + '</div>' +
      '</td>' +
    '</tr></table>';
}

function h2(text) {
  return '<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:' +
    C.muted + ';border-bottom:1px solid ' + C.line +
    ';padding:0 0 5px 0;margin:22px 0 10px 0;">' + text + '</div>';
}

/* Шапка с данными ученика */
function studentCard(d) {
  function item(k, v) {
    return '<td style="padding:0 16px 0 0;">' +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:' +
        C.muted + ';">' + k + '</div>' +
      '<div style="font-size:13px;color:' + C.ink + ';font-weight:bold;padding-top:2px;">' +
        esc(v) + '</div></td>';
  }
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.soft +
    '" style="background-color:' + C.soft + ';border-radius:8px;"><tr>' +
    '<td style="padding:12px 16px;"><table cellpadding="0" cellspacing="0" border="0"><tr>' +
      item('УЧЕНИК', d.fio) +
      item('КЛАСС', d.klass) +
      (d.school ? item('ШКОЛА', d.school) : '') +
      item('ДАТА', d.date) +
      item('ВРЕМЯ', d.duration) +
    '</tr></table></td></tr></table>';
}

/* Таблица всех ответов — для перепроверки вручную */
function answersTable(res) {
  var h = '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="border-collapse:collapse;font-size:11px;">';
  res.rows.forEach(function (r) {
    h += '<tr>' +
      '<td width="26" valign="top" style="padding:7px 0 7px 0;color:' + C.muted +
        ';border-top:1px solid ' + C.line + ';">' + r.n + '.</td>' +
      '<td valign="top" style="padding:7px 8px 7px 0;border-top:1px solid ' + C.line + ';">' +
        '<div style="color:' + C.ink + ';font-weight:bold;">' + esc(r.stem) + '</div>';
    for (var i = 0; i < r.letters.length; i++) {
      h += '<div style="color:' + C.muted + ';padding-top:2px;">' +
             r.letters[i] + ') ' + esc(r.texts[i]) +
             ' <span style="color:' + C.accent + ';">[' + r.values[i] + ']</span></div>';
    }
    h += '</td>' +
      '<td width="34" valign="top" align="right" style="padding:7px 0;color:' + C.muted +
        ';border-top:1px solid ' + C.line + ';">' + r.block + '</td>' +
    '</tr>';
  });
  return h + '</table>';
}

/* --------------------------------------------------------- тело отчёта */
function reportBody(K, d, res) {
  return studentCard(d) +
    '<div style="height:16px;"></div>' +
    totalCard(K, res) +

    h2('ПОКАЗАТЕЛИ I–III · БАЛЛЫ ПО КЛЮЧУ') +
    chartPoints(K, res) +
    '<div style="font-size:11px;color:' + C.muted + ';padding-top:6px;">' +
      'I — насколько сильным является личностный смысл обучения; ' +
      'II — степень развитости способности к целеполаганию; ' +
      'III — направленность мотивации.</div>' +

    h2('ПОКАЗАТЕЛИ IV–VI · ПОЛЯРНАЯ ШКАЛА ОТ −30 ДО +30') +
    chartPolar(K, res) +

    h2('СТРУКТУРА ВЫБРАННЫХ МОТИВОВ') +
    chartMotives(K, res.motivesIII, 'Блок III (6 выборов) — направленность мотивации:') +
    '<div style="height:12px;"></div>' +
    chartMotives(K, res.motivesAll, 'Блоки I–III (18 выборов) — общая картина:');
}

/* ------------------------------------------------------- HTML для PDF */
function pdfHtml(K, d, res) {
  return '<html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Arial,Helvetica,sans-serif;color:' + C.ink +
      ';margin:0;padding:28px 30px;">' +

    '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="border-bottom:2px solid ' + C.accent + ';padding-bottom:10px;"><tr>' +
      '<td><div style="font-size:17px;font-weight:bold;">' + esc(K.title) + '</div>' +
      '<div style="font-size:11px;color:' + C.muted + ';padding-top:3px;">' +
        esc(K.author) + '</div></td>' +
      '<td align="right" style="font-size:10px;color:' + C.muted + ';">' +
        'Протокол<br>обследования</td>' +
    '</tr></table>' +
    '<div style="height:16px;"></div>' +

    reportBody(K, d, res) +

    '<div style="page-break-before:always;"></div>' +
    h2('ОТВЕТЫ ОБУЧАЮЩЕГОСЯ') +
    '<div style="font-size:11px;color:' + C.muted + ';padding-bottom:8px;">' +
      'В квадратных скобках — балл варианта по ключу методики.</div>' +
    answersTable(res) +

    '<div style="margin-top:22px;padding-top:10px;border-top:1px solid ' + C.line +
      ';font-size:10px;color:' + C.muted + ';">' +
      esc(K.title) + ' · ' + esc(K.author) + ' · протокол сформирован ' +
      esc(d.date) + '. Документ содержит персональные данные обучающегося.</div>' +

    '</body></html>';
}

/* ---------------------------------------------------- HTML для письма */
function emailHtml(K, d, res) {
  var lv = res.levels.total;
  return '<div style="background-color:' + C.soft + ';padding:22px 0;">' +
    '<table width="640" cellpadding="0" cellspacing="0" border="0" align="center" ' +
      'style="background-color:#ffffff;border:1px solid ' + C.line +
      ';border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:' + C.ink + ';">' +
    '<tr><td style="padding:24px 26px 26px 26px;">' +

      '<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:' +
        C.muted + ';">НОВЫЙ РЕЗУЛЬТАТ ТЕСТИРОВАНИЯ</div>' +
      '<div style="font-size:19px;font-weight:bold;padding:4px 0 2px 0;">' +
        esc(d.fio) + ', ' + esc(d.klass) + ' класс</div>' +
      '<div style="font-size:12px;color:' + C.muted + ';padding-bottom:18px;">' +
        esc(K.title) + ' · ' + esc(K.author) + '</div>' +

      reportBody(K, d, res) +

      '<div style="margin-top:24px;padding:12px 14px;background-color:' + C.soft +
        ';border-radius:8px;font-size:12px;color:' + C.muted + ';">' +
        '📎 Полный протокол со всеми ответами — в PDF во вложении.</div>' +

      '<div style="margin-top:16px;padding-top:12px;border-top:1px solid ' + C.line +
        ';font-size:11px;color:' + C.muted + ';">' +
        'Уровень ' + lv.level + ' · ' + res.total + ' из ' + K.totalMax +
        ' баллов · ' + esc(d.date) + '</div>' +

    '</td></tr></table></div>';
}

/* --------------------------- текстовая версия (для почтовых клиентов
                                без HTML и для поиска по письмам) */
function plainText(K, d, res) {
  var L = [];
  L.push(K.title + ' — ' + K.author);
  L.push('');
  L.push('Ученик: ' + d.fio + ', ' + d.klass + ' класс');
  L.push('Дата: ' + d.date + ' (время прохождения: ' + d.duration + ')');
  L.push('');
  L.push('ИТОГ: ' + res.total + ' из ' + K.totalMax + ' — уровень ' +
         res.levels.total.level + ' (' + res.levels.total.name + ')');
  ['I', 'II', 'III'].forEach(function (b) {
    L.push(b + '. ' + K.blocks[b].name + ': ' + res.points[b] + ' / ' + K.blocks[b].max +
           ' — ' + res.levels[b].name);
  });
  ['IV', 'V', 'VI'].forEach(function (b) {
    L.push(b + '. ' + K.blocks[b].name + ': ' + (res.polar[b] > 0 ? '+' : '') +
           res.polar[b] + ' — ' + res.verdicts[b]);
  });
  L.push('');
  L.push('Подробный протокол — в PDF во вложении.');
  return L.join('\n');
}

/* ================================================================== PDF */
function safeName(s) {
  return String(s).replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
}

function makePdf(K, d, res) {
  var name = 'Мотивация_' + safeName(d.fio) + '_' + safeName(d.klass) + '.pdf';
  return Utilities.newBlob(pdfHtml(K, d, res), MimeType.HTML, name)
                  .getAs(MimeType.PDF).setName(name);
}

/* ============================================================== ЖУРНАЛ */
function logToSheet(K, d, res) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;                       // скрипт запущен отдельно от таблицы
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['Дата', 'Методика', 'ФИО', 'Класс', 'Школа',
                  'Итог, баллы', 'Итоговый уровень',
                  'I, балл', 'I, уровень', 'II, балл', 'II, уровень',
                  'III, балл', 'III, уровень', 'IV', 'V', 'VI', 'Время']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 17).setFontWeight('bold');
  }
  sh.appendRow([d.date, K.title, d.fio, d.klass, d.school || '',
                res.total, res.levels.total.level + ' — ' + res.levels.total.name,
                res.points.I,   res.levels.I.name,
                res.points.II,  res.levels.II.name,
                res.points.III, res.levels.III.name,
                res.polar.IV, res.polar.V, res.polar.VI, d.duration]);
}

/* ========================================================== САМОПРОВЕРКА
   Запустите эту функцию из редактора (кнопка «Выполнить»), чтобы получить
   на почту тестовое письмо с PDF и убедиться, что всё настроено.
   ====================================================================== */
function testSendSample() {
  var K = KEYS['motivaciya-lukyanova'];
  var answers = [];
  for (var n = 1; n <= 18; n++) {
    answers.push({
      n: n, picks: [0, 1], letters: ['а', 'б'],
      texts: ['первый выбранный вариант', 'второй выбранный вариант'],
      stem: 'Текст предложения №' + n
    });
  }
  var d = {
    testId: 'motivaciya-lukyanova', fio: 'Пробный Ученик', klass: '7 Б',
    school: '', date: 'проверка', duration: '1 мин'
  };
  var res = score(K, answers);
  MailApp.sendEmail({
    to: EMAIL,
    subject: 'ПРОВЕРКА · ' + d.fio + ' · уровень ' + res.levels.total.level,
    htmlBody: emailHtml(K, d, res),
    body: plainText(K, d, res),
    attachments: [makePdf(K, d, res)],
    name: 'Психодиагностика'
  });
  Logger.log('Отправлено на ' + EMAIL + '. Итог: ' + res.total +
             ', уровень ' + res.levels.total.level);
}
