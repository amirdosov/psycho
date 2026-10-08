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

   ТРИ ВИДА МЕТОДИК (поле kind в KEYS):
     motivation — мотивация Лукьяновой: баллы по ключу, письмо с PDF;
     wellbeing  — шкала благополучия: сумма 0–36, письмо с PDF;
     survey     — анонимная анкета без ключа: письмо с PDF-протоколом
                  ответов без имени, строка в таблице, а сводку по классу
                  психолог строит сам из меню таблицы «Психодиагностика».
   ========================================================================= */

var EMAIL = 'ВАША_ПОЧТА@example.com';   // ← впишите сюда свой адрес
var SHEET = 'Результаты';             // лист-журнал мотивации (у других методик свой)

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

    kind:   'motivation',
    title:  'Методика изучения мотивации обучения старшеклассников',
    author: 'М.И. Лукьянова, Н.В. Калинина',
    filePrefix: 'Мотивация',

    /* Ключи ниже — раздел «для учащихся 10-11-го класса» первоисточника
       (таблицы 17/18/19/21). Максимумы блоков посчитаны как сумма двух
       лучших вариантов в каждом из трёх вопросов блока: I 10+9+10=29,
       II 10+10+8=28, III 10+8+10=28 — что совпадает с верхней границей
       уровня «I» в таблице 19.                                            */
    blocks: {
      I:   { name: 'Личностный смысл учения',                   qs: [1, 2, 3],    max: 29 },
      II:  { name: 'Способность к целеполаганию',               qs: [4, 5, 6],    max: 28 },
      III: { name: 'Виды мотивов',                              qs: [7, 8, 9],    max: 28 },
      IV:  { name: 'Внутренняя / внешняя мотивация',            qs: [10, 11, 12] },
      V:   { name: 'Стремление к успеху / недопущение неудачи', qs: [13, 14, 15] },
      VI:  { name: 'Реализация мотивов в поведении',            qs: [16, 17, 18] }
    },

    /* Таблица 18 методики («Ключ для показателей I, II, III мотивации»).
       Индекс = вариант ответа (0 = «а»).
       Балл соответствует мотиву: 0 внешний · 1 игровой · 2 отметка ·
       3 позиционный · 4 социальный · 5 учебный                            */
    points: {
      1: [4, 5, 5, 4, 3, 3, 3],
      2: [0, 4, 4, 5, 4],
      3: [5, 2, 3, 3, 5, 2],
      4: [5, 4, 3, 5, 3, 4, 4, 0],
      5: [3, 5, 5, 3, 0, 2, 1],
      6: [5, 1, 0, 3, 3],
      7: [3, 3, 5, 0, 5, 2, 1],
      8: [3, 3, 2, 5, 0, 1],
      9: [0, 3, 3, 5, 3, 1, 3, 5]
    },

    /* Полярная шкала блоков IV–VI: «+» = +5, «-» = −5.
       Таблица 21 методики («Ключ для показателей IV, V, VI мотивации»,
       раздел для 10-11-го класса) — та же раскладка приведена в документе
       дважды: перед анкетой (табл. 17) и в разборе результатов (табл. 21). */
    polar: {
      10: '+-+-+-',
      11: '-+-+-+',
      12: '+-+-+-',
      13: '-+-+-+',
      14: '+-+--+',
      15: '-+-+-+',
      16: '+-+-+-',
      17: '+-+-+-',
      18: '-+-+-+'
    },

    /* Таблица 19: минимальная сумма баллов для уровня (10–11 класс) */
    levels: [
      { level: 'I',   name: 'очень высокий',        I: 26, II: 24, III: 24, total: 72 },
      { level: 'II',  name: 'высокий',              I: 21, II: 18, III: 18, total: 55 },
      { level: 'III', name: 'нормальный (средний)', I: 18, II: 12, III: 14, total: 42 },
      { level: 'IV',  name: 'сниженный',            I: 15, II:  8, III:  9, total: 30 },
      { level: 'V',   name: 'низкий',               I:  0, II:  0, III:  0, total:  0 }
    ],
    totalMax: 85,

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
  },

  /* ----------------------------------------------------------------------
     ШКАЛА БЛАГОПОЛУЧИЯ ПОДРОСТКА — К. Рифф. Ключ и уровни — из сборника
     диагностических методик (раздел 1.2.7), одинаковые в казахской
     и русской версиях. Сами 18 утверждений по содержанию совпадают со
     шкалой депрессии Бирлесона (DSRS), но счёт в сборнике обратный: чем
     ВЫШЕ балл, тем лучше. Реализовано как в сборнике.
     ---------------------------------------------------------------------- */
  'blagopoluchie-riff': {

    kind:   'wellbeing',
    title:  'Шкала благополучия подростка',
    author: 'К. Рифф (адаптация Т.Д. Шевеленковой, П.П. Фесенко)',
    filePrefix: 'Благополучие',
    sheet:  'Благополучие',

    // позиция варианта: 0 — «большую часть времени», 1 — «иногда», 2 — «никогда»
    options: ['Большую часть времени', 'Иногда', 'Никогда'],

    /* Положительные утверждения: 2-1-0 по порядку вариантов.
       Остальные (3, 5, 6, 10, 14, 15, 17, 18) — обратные: 0-1-2. */
    positive: [1, 2, 4, 7, 8, 9, 11, 12, 13, 16],
    max: 36,
    maxPositive: 20,
    maxNegative: 16,

    items: [
      'Я, как и раньше, стремлюсь к чему-то позитивному',
      'Я сплю очень хорошо',
      'Мне хочется плакать',
      'Мне нравится ходить куда-нибудь',
      'Мне хочется уйти из дома',
      'У меня болит желудок / бывают судороги / головная боль',
      'У меня много энергии',
      'Мне нравится моя еда',
      'Я могу постоять за себя',
      'Я думаю, жизнь ничего не стоит',
      'Я хорош(а) в том, что я делаю',
      'Мне нравится то, что я делаю, так же, как и раньше',
      'Я люблю разговаривать с моими друзьями и семьёй',
      'У меня ужасные сны',
      'Я чувствую себя очень одиноким / одинокой',
      'Меня легко развеселить',
      'Я чувствую себя так грустно, что едва могу это вынести',
      'Мне очень скучно'
    ],

    // от верхнего уровня к нижнему; min — нижняя граница
    levels: [
      { min: 27, name: 'высокий', color: '#15803d',
        text: 'Подросток ощущает удовлетворение жизнью, имеет позитивное ' +
              'мировосприятие и устойчив к стрессам.' },
      { min: 14, name: 'средний', color: '#3b6ef5',
        text: 'Возможны колебания настроения, периодические трудности, но в целом ' +
              'подросток справляется с жизненными ситуациями.' },
      { min: 0,  name: 'низкий',  color: '#dc2626',
        text: 'Подросток может испытывать чувство неудовлетворённости, подавленности ' +
              'и нуждается в дополнительной поддержке.' }
    ],

    /* «Обратить внимание» — в сборнике этого нет, добавлено по просьбе
       психолога. Отдельный ответ здесь может значить больше общей суммы:
       при среднем балле ученик всё равно может написать, что жизнь ничего
       не стоит. picks — какие ответы отмечать (0 — «большую часть времени»,
       1 — «иногда»). */
    alerts: [
      { n: 3,  picks: [0],    short: 'хочется плакать' },
      { n: 5,  picks: [0],    short: 'хочется уйти из дома' },
      { n: 10, picks: [0, 1], short: 'жизнь ничего не стоит' },
      { n: 14, picks: [0],    short: 'ужасные сны' },
      { n: 15, picks: [0],    short: 'очень одиноко' },
      { n: 17, picks: [0, 1], short: 'так грустно, что едва может вынести' }
    ]
  },

  /* ----------------------------------------------------------------------
     ЭКСПРЕСС-АНКЕТИРОВАНИЕ «КАК С ТОБОЙ ОБРАЩАЮТСЯ» — ННПИБД «Өркен».
     Анонимная анкета без ключа (сборник, раздел 1.2.4). Тексты — русская
     редакция по полной казахской версии; должны совпадать по порядку
     вариантов с tests/kak-s-toboy-obrashchayutsya/data.js. Здесь они нужны
     для таблицы и сводки. «Свой вариант» всегда последний.
     ---------------------------------------------------------------------- */
  'kak-s-toboy-obrashchayutsya': {

    kind:   'survey',
    title:  'Экспресс-анкетирование «Как с тобой обращаются»',
    author: 'Авторский коллектив научных сотрудников ННПИБД «Өркен»',
    filePrefix: 'Обращение',
    sheet:  'Как с тобой обращаются',
    short:  'Обращение',

    questions: [
      { n: 1, multi: true, other: true, short: 'Где чаще жестокое обращение',
        stem: 'Где, по твоему мнению, ребёнок чаще всего сталкивается с жестоким обращением?',
        options: ['В семье', 'На улице', 'В школе', 'В социальных сетях', 'Свой вариант'] },

      { n: 2, other: true, short: 'Отношения с родителями',
        stem: 'Какие у тебя отношения с родителями?',
        options: ['Хорошие, они меня понимают и всегда поддерживают',
                  'Не очень хорошие, иногда ссоримся или не соглашаемся',
                  'Плохие, меня часто ругают',
                  'Очень плохие, меня часто ругают и бьют',
                  'Свой вариант'] },

      { n: 3, multi: true, other: true, short: 'Как наказывают',
        stem: 'Какие меры чаще всего используют, когда тебя наказывают?',
        options: ['Говорят резко или критикуют',
                  'Запрещают телефон, компьютер или телевизор',
                  'Не дают денег',
                  'Запрещают встречаться с друзьями',
                  'Объясняют, почему я был(а) неправ(а)',
                  'Стараются понять мои чувства или настроение',
                  'Используют физическое наказание',
                  'Меня никогда не наказывают',
                  'Свой вариант'] },

      { n: 4, other: true, short: 'Согласен ли со словами и действиями родителей',
        stem: 'Ты считаешь правильными слова и действия своих родителей в отношении тебя?',
        options: ['Да, согласен(а) с их действиями',
                  'Скорее да, но бывает, что не согласен(а)',
                  'Нет, не согласен(а)',
                  'Скорее нет, но понимаю их намерения',
                  'Свой вариант'] },

      { n: 5, other: true, short: 'Обижали ли родители',
        stem: 'Бывало ли, что родители поступили с тобой так, что ты почувствовал(а) себя обиженным(ой)?',
        options: ['Да, это случается часто', 'Иногда', 'Такое бывает редко', 'Никогда',
                  'Не могу сказать', 'Свой вариант'] },

      { n: 6, other: true, short: 'Защищённость в семье',
        stem: 'Ты чувствуешь себя защищённым(ой) в своей семье?',
        options: ['Да, всегда', 'Иногда', 'Полностью не ощущаю, но бывает поддержка',
                  'Нет, не чувствую себя защищённым(ой) или любимым(ой)', 'Свой вариант'] },

      { n: 7, other: true, short: 'Насилие или травля в соцсетях',
        stem: 'Сталкивался(-ась) ли ты с насилием или травлей в социальных сетях?',
        options: ['Да', 'Нет', 'Иногда', 'Свой ответ'] },

      { n: 8, multi: true, other: true, short: 'Насилие в школе',
        stem: 'С какими видами насилия ты сталкивался(-ась) в школе?',
        options: ['Физическое насилие (удары, толчки, рывки)',
                  'Эмоциональное насилие (оскорбления, унижения, крики)',
                  'Нарушение личных границ (неприятные прикосновения)',
                  'Игнорирование (учитель не обращает внимания на вопросы или проблемы)',
                  'Манипуляции (запугивание плохими оценками)',
                  'Не сталкивался(-ась)',
                  'Свой вариант'] },

      { n: 9, multi: true, other: true, skipIf: { n: 8, pick: 5 }, short: 'Кто проявлял насилие в школе',
        stem: 'Если ты столкнулся(-ась) с насилием в школе, кто проявлял его по отношению к тебе?',
        options: ['Учителя', 'Одноклассники', 'Друзья', 'Ученики других классов',
                  'Другие сотрудники школы', 'Свой вариант'] },

      { n: 10, multi: true, other: true, short: 'Что сделает в трудной ситуации',
        stem: 'Если ты окажешься в сложной ситуации (например, если тебя запугают или обидят), что ты сделаешь?',
        options: ['Попрошу помощи у родителей',
                  'Попробую решить проблему с помощью друзей',
                  'Попрошу помощи у родственников',
                  'Поговорю с классным руководителем',
                  'Обращусь к психологу',
                  'Обращусь к социальному педагогу',
                  'Схожу к директору',
                  'Обращусь в полицию',
                  'Поищу советы в интернете',
                  'Позвоню по телефону доверия',
                  'Попробую справиться самостоятельно',
                  'Свой вариант'] }
    ],

    /* Тревожные показатели — первым блоком в сводке: доля учеников
       (от всех анкет выборки), отметивших хотя бы один из вариантов picks. */
    signals: [
      { n: 2, picks: [2, 3], label: 'Отношения с родителями плохие или очень плохие' },
      { n: 2, picks: [3],    label: '…из них: «меня часто ругают и бьют»' },
      { n: 3, picks: [6],    label: 'Родители применяют физическое наказание' },
      { n: 5, picks: [0],    label: 'Родители часто обижают' },
      { n: 6, picks: [3],    label: 'Не чувствует себя защищённым(ой) или любимым(ой) в семье' },
      { n: 7, picks: [0, 2], label: 'Насилие или травля в соцсетях (да или иногда)' },
      { n: 8, picks: [0],    label: 'Физическое насилие в школе' },
      { n: 8, picks: [1],    label: 'Эмоциональное насилие в школе' },
      { n: 8, picks: [2],    label: 'Нарушение личных границ в школе' },
      { n: 9, picks: [0, 4], label: 'Насилие со стороны учителей или сотрудников школы' }
    ]
  }
};

/* Что делать с ответом методики каждого вида: подсчёт, тема и тело
   письма, текстовая версия, журнал. */
var KINDS = {
  motivation: {
    score: score,
    body: reportBody,
    plain: plainText,
    log: logToSheet,
    subject: function (K, d, res) {
      return 'Результат · ' + d.fio + ' · ' + d.klass + ' класс · уровень ' +
             res.levels.total.level + ' (' + res.levels.total.name + ')';
    },
    footer: function (K, res) {
      return 'Уровень ' + res.levels.total.level + ' · ' + res.total + ' из ' + K.totalMax + ' баллов';
    }
  },
  wellbeing: {
    score: scoreWellbeing,
    body: wbReportBody,
    plain: wbPlainText,
    log: wbLogToSheet,
    subject: function (K, d, res) {
      return 'Благополучие · ' + d.fio + ' · ' + d.klass + ' класс · ' + res.level.name +
             ' уровень' + (res.alerts.length ? ' · ⚠ обратить внимание' : '');
    },
    footer: function (K, res) {
      return 'Уровень благополучия: ' + res.level.name + ' · ' + res.total + ' из ' + K.max + ' баллов';
    }
  },
  survey: {
    score: scoreSurvey,
    body: svReportBody,
    plain: svPlainText,
    log: logSurvey,
    subject: function (K, d, res) {
      return 'Анонимная анкета · ' + (K.short || K.title) + ' · ' + d.klass + ' класс' +
             (res.alerts.length ? ' · ⚠ обратить внимание' : '');
    },
    footer: function (K, res) {
      return 'Анонимная анкета · ' + (res.alerts.length
        ? 'есть ответы, на которые стоит обратить внимание'
        : 'тревожных ответов нет');
    }
  }
};

/* ========================================================= ТОЧКА ВХОДА */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var K = KEYS[d.testId];
    if (!K) throw new Error('Неизвестная методика: ' + d.testId);
    var kind = KINDS[K.kind];
    validate(K, d);

    // Страница повторяет отправку при обрыве связи. Если первая попытка
    // на самом деле дошла, а ответ потерялся, второй раз считать и слать
    // письмо не нужно — но ученику отвечаем «принято», иначе он увидит
    // ошибку там, где на самом деле всё в порядке.
    if (isRepeat(d)) return json({ ok: true });

    var res = kind.score(K, d.answers);

    // Сначала журнал, потом почта: если письма упрутся в суточную квоту,
    // результат всё равно не пропадёт.
    kind.log(K, d, res);

    // Сбой почты — не ошибка ученика: строка уже в таблице, поэтому
    // отвечаем «принято», а не просим отправить ещё раз.
    try {
      if (mailQuotaLeft()) {
        MailApp.sendEmail({
          to: EMAIL,
          subject: kind.subject(K, d, res),
          htmlBody: emailHtml(K, d, res),
          body: kind.plain(K, d, res),
          attachments: [makePdf(K, d, res)],
          name: 'Психодиагностика'
        });
      }
    } catch (mailErr) {
      console.error('Письмо не ушло: ' + mailErr);
    }
    return json({ ok: true });

  } catch (err) {
    // письмо об ошибке, чтобы сбой не остался незамеченным
    try {
      if (mailQuotaLeft()) {
        MailApp.sendEmail(EMAIL, 'Ошибка приёма результата',
          String(err) + '\n\n' + (e && e.postData ? e.postData.contents : ''));
      }
    } catch (ignored) {}
    return json({ ok: false, error: String(err) });
  }
}

/* ====================================================== ЗАЩИТА ОТ МУСОРА
   Адрес приёмника виден в коде страницы — иначе браузер ученика не смог бы
   к нему обратиться. Значит слать выдуманные заявки может кто угодно,
   и пароль в коде сайта тут не помог бы: он лежал бы там же, рядом.
   Данные это не открывает (наружу отдаётся только «принято»), опасность
   одна — засорение почты и журнала. Ниже три недорогих ограничителя.
   ====================================================================== */

/* Заявка должна быть похожа на настоящую: столько ответов, сколько вопросов
   в методике, в каждом допустимое число вариантов, осмысленные ФИО
   и класс. Мусор отсекается до того, как будет отправлено письмо. */
function validate(K, d) {
  // Класс приходит из кнопок и уже имеет вид «7Б». Приводим к нему и то,
  // что могло прийти иначе, — иначе в таблице заводятся «7 б» и «7Б»
  // как разные значения, и фильтр по классам перестаёт работать.
  var klass = String(d.klass || '').replace(/\s+/g, '').toUpperCase();
  if (!klass || klass.length > 6) throw new Error('некорректный класс');
  d.klass = klass;

  if (K.kind === 'survey') return validateSurvey(K, d);

  var fio = String(d.fio || '').trim();
  if (fio.length < 3 || fio.length > 80) throw new Error('некорректное ФИО');

  var need = 0, picks = 2, nOpts = 99;
  if (K.kind === 'wellbeing') {
    need = K.items.length; picks = 1; nOpts = K.options.length;
  } else {
    for (var b in K.blocks) need += K.blocks[b].qs.length;
  }

  if (!d.answers || d.answers.length !== need) {
    throw new Error('ожидается ответов: ' + need);
  }
  for (var i = 0; i < d.answers.length; i++) {
    var a = d.answers[i];
    if (!a || !a.picks || a.picks.length !== picks) {
      throw new Error('в вопросе ' + (a && a.n) + ' должно быть вариантов: ' + picks);
    }
    if (K.kind === 'wellbeing' && (a.n !== i + 1 || !validPick(a.picks[0], nOpts))) {
      throw new Error('некорректный ответ на вопрос ' + a.n);
    }
  }
}

function validPick(p, nOpts) {
  return typeof p === 'number' && p % 1 === 0 && p >= 0 && p < nOpts;
}

/* Анонимная анкета: имени нет, зато есть случайный номер прохождения sid.
   Число вариантов — по правилам вопроса: один, или несколько у multi,
   или ни одного у пропущенного (skipIf) вопроса. */
function validateSurvey(K, d) {
  d.fio = '';
  d.school = '';
  var sid = String(d.sid || '');
  if (sid.length < 6 || sid.length > 40) throw new Error('нет номера прохождения');

  var Q = K.questions;
  if (!d.answers || d.answers.length !== Q.length) {
    throw new Error('ожидается ответов: ' + Q.length);
  }
  Q.forEach(function (q, i) {
    var a = d.answers[i];
    if (!a || a.n !== q.n) throw new Error('нарушен порядок вопросов');
    var picks = a.picks || [];
    if (a.skipped) {
      if (!q.skipIf || picks.length) throw new Error('вопрос ' + q.n + ' нельзя пропустить');
      return;
    }
    if (!picks.length || (!q.multi && picks.length !== 1)) {
      throw new Error('в вопросе ' + q.n + ' неверное число вариантов');
    }
    picks.forEach(function (p) {
      if (!validPick(p, q.options.length)) throw new Error('некорректный вариант в вопросе ' + q.n);
    });
    a.other = (q.other && picks.indexOf(q.options.length - 1) !== -1)
      ? String(a.other || '').trim().slice(0, 300) : '';
  });
}

/* Та же анкета от того же ученика в пределах минуты считается повтором.
   У анонимной анкеты «тот же ученик» — тот же номер прохождения sid. */
function isRepeat(d) {
  try {
    var cache = CacheService.getScriptCache();
    var key = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      d.testId + '|' + d.fio + '|' + d.klass + '|' + (d.sid || ''),
      Utilities.Charset.UTF_8));
    if (cache.get(key)) return true;
    cache.put(key, '1', 60);
  } catch (ignored) {}
  return false;
}

/* Остался ли запас писем на сегодня — по настоящей квоте Google
   (около 100 писем в сутки у обычного аккаунта). Свой счётчик с пределом 60
   был здесь раньше и 2026-10-08 отрезал письма целой школе, хотя квота
   Google была почти не тронута. Сверх квоты заявки по-прежнему попадают
   в таблицу, просто без письма. */
function mailQuotaLeft() {
  try {
    return MailApp.getRemainingDailyQuota() > 0;
  } catch (ignored) {}
  return true;
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
   Диаграммы собраны из ячеек таблицы, а цвет полосы задаётся ГРАНИЦЕЙ
   (border-top), а не фоном. Это не украшательство, а вынужденное решение:
   конвертер HTML → PDF в Apps Script выбрасывает любую заливку фона —
   и bgcolor, и background-color, и на ячейке, и на блоке, — а границы
   рисует. Проверено на семи вариантах разметки; граница оказалась
   единственным способом, который одинаково работает и в PDF, и в письме
   (картинка из data-URI выглядит в PDF так же, но её блокирует Gmail).
   Поэтому: фон в отчёте — только там, где он не несёт смысла.
   ====================================================================== */

function cell(w, color, h) {
  return '<td width="' + w + '%" style="border-top:' + h + 'px solid ' + color +
         ';font-size:1px;line-height:1px;">&nbsp;</td>';
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
  return tbl(s);
}

/* Двусторонняя полоса для полярной шкалы: значение от -max до +max,
   посередине риска нуля. Все секции — ячейки ОДНОЙ строки, без вложенных
   таблиц: вложенность сдвигала риску на высоту полосы вверх, а соседние
   ячейки стоят на одной линии по построению. */
function barDiverging(value, max) {
  var h = 15, half = 49, tick = 2;      // проценты ширины: 49 + 2 + 49
  var m = Math.round(half * Math.min(Math.abs(value), max) / max);
  var s = '';

  if (value < 0) {                      // заливка слева, вплотную к риске
    if (half - m > 0) s += cell(half - m, C.track, h);
    if (m > 0)        s += cell(m, C.neg, h);
    s += cell(tick, C.ink, h);
    s += cell(half, C.track, h);

  } else if (value > 0) {               // заливка справа, вплотную к риске
    s += cell(half, C.track, h);
    s += cell(tick, C.ink, h);
    if (m > 0)        s += cell(m, C.pos, h);
    if (half - m > 0) s += cell(half - m, C.track, h);

  } else {                              // ноль — только риска
    s += cell(half, C.track, h);
    s += cell(tick, C.ink, h);
    s += cell(half, C.track, h);
  }
  return tbl(s);
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
    'style="border-collapse:collapse;border:1px solid ' + C.line + ';">' +
    '<tr>' +
      '<td style="padding:14px 16px;border-left:6px solid ' + col + ';">' +
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
    '" style="background-color:' + C.soft + ';border:1px solid ' + C.line + ';"><tr>' +
    '<td style="padding:12px 16px;"><table cellpadding="0" cellspacing="0" border="0"><tr>' +
      item('УЧЕНИК', d.fio || 'анонимно') +
      item('КЛАСС', d.klass) +
      (d.school ? item('ШКОЛА', d.school) : '') +
      item('ДАТА', d.date) +
      item('ВРЕМЯ', d.duration) +
    '</tr></table></td></tr></table>';
}

/* Таблица ответов одной колонки — используется дважды бок о бок,
   чтобы весь список из 18 вопросов помещался на один лист PDF. */
function answersRows(rows) {
  var h = '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="border-collapse:collapse;font-size:9.5px;">';
  rows.forEach(function (r) {
    h += '<tr>' +
      '<td width="16" valign="top" style="padding:5px 0 5px 0;color:' + C.muted +
        ';border-top:1px solid ' + C.line + ';">' + r.n + '.</td>' +
      '<td valign="top" style="padding:5px 6px 5px 0;border-top:1px solid ' + C.line + ';">' +
        '<div style="color:' + (r.alert ? C.neg : C.ink) + ';font-weight:bold;">' +
          (r.alert ? '! ' : '') + esc(r.stem) + '</div>';
    for (var i = 0; i < r.letters.length; i++) {
      h += '<div style="color:' + C.muted + ';padding-top:1px;">' +
             r.letters[i] + ') ' + esc(r.texts[i]) +
             (r.values[i] !== ''
               ? ' <span style="color:' + C.accent + ';">[' + r.values[i] + ']</span>' : '') +
             '</div>';
    }
    h += '</td>' +
      '<td width="20" valign="top" align="right" style="padding:5px 0;color:' + C.muted +
        ';border-top:1px solid ' + C.line + ';">' + r.block + '</td>' +
    '</tr>';
  });
  return h + '</table>';
}

/* Таблица всех ответов — для перепроверки вручную. Две колонки бок о бок
   (первая половина вопросов слева, вторая справа), иначе список из 18
   вопросов не помещается на одну страницу PDF. */
function answersTable(res) {
  var rows = res.rows;
  var mid = Math.ceil(rows.length / 2);
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="49%" valign="top">' + answersRows(rows.slice(0, mid)) + '</td>' +
    '<td width="2%">&nbsp;</td>' +
    '<td width="49%" valign="top">' + answersRows(rows.slice(mid)) + '</td>' +
  '</tr></table>';
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

/* ------------------------------------------------------- HTML для PDF
   Вложение — только шапка с данными ученика и полный список его ответов.
   Диаграммы, итоговый уровень и интерпретация остаются в теле письма
   (emailHtml, через reportBody) и в Google-таблице (logToSheet) — здесь
   они намеренно не дублируются. */
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

    studentCard(d) +
    '<div style="height:16px;"></div>' +

    h2('ОТВЕТЫ ОБУЧАЮЩЕГОСЯ') +
    '<div style="font-size:11px;color:' + C.muted + ';padding-bottom:8px;">' +
      (K.kind === 'survey'
        ? 'Анкета анонимная, ключа у методики нет — ниже ответы как есть.'
        : 'В квадратных скобках — балл варианта по ключу методики.') +
      (res.alerts && res.alerts.length
        ? ' Красным с «!» — ответы из блока «Обратить внимание».' : '') + '</div>' +
    answersTable(res) +

    '<div style="margin-top:22px;padding-top:10px;border-top:1px solid ' + C.line +
      ';font-size:10px;color:' + C.muted + ';">' +
      esc(K.title) + ' · ' + esc(K.author) + ' · протокол сформирован ' +
      esc(d.date) + (d.fio ? '. Документ содержит персональные данные обучающегося.'
                           : '. Анкета анонимная.') + '</div>' +

    '</body></html>';
}

/* ---------------------------------------------------- HTML для письма */
function emailHtml(K, d, res) {
  var kind = KINDS[K.kind];
  return '<div style="background-color:' + C.soft + ';padding:22px 0;">' +
    '<table width="640" cellpadding="0" cellspacing="0" border="0" align="center" ' +
      'style="background-color:#ffffff;border:1px solid ' + C.line +
      ';border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:' + C.ink + ';">' +
    '<tr><td style="padding:24px 26px 26px 26px;">' +

      '<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:' +
        C.muted + ';">НОВЫЙ РЕЗУЛЬТАТ ТЕСТИРОВАНИЯ</div>' +
      '<div style="font-size:19px;font-weight:bold;padding:4px 0 2px 0;">' +
        (d.fio ? esc(d.fio) : 'Анонимная анкета') + ', ' + esc(d.klass) + ' класс</div>' +
      '<div style="font-size:12px;color:' + C.muted + ';padding-bottom:18px;">' +
        esc(K.title) + ' · ' + esc(K.author) + '</div>' +

      kind.body(K, d, res) +

      '<div style="margin-top:24px;padding:12px 14px;background-color:' + C.soft +
        ';border-radius:8px;font-size:12px;color:' + C.muted + ';">' +
        '📎 Полный протокол со всеми ответами — в PDF во вложении.</div>' +

      '<div style="margin-top:16px;padding-top:12px;border-top:1px solid ' + C.line +
        ';font-size:11px;color:' + C.muted + ';">' +
        kind.footer(K, res) + ' · ' + esc(d.date) + '</div>' +

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
  // у анонимной анкеты вместо имени — дата и хвост номера прохождения,
  // чтобы скачанные протоколы одного класса не затирали друг друга
  var name = d.fio
    ? K.filePrefix + '_' + safeName(d.fio) + '_' + safeName(d.klass) + '.pdf'
    : K.filePrefix + '_' + safeName(d.klass) + '_' + safeName(d.date) + '_' +
      String(d.sid || '').slice(-4) + '.pdf';
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

/* ================================================= ШКАЛА БЛАГОПОЛУЧИЯ */

function scoreWellbeing(K, answers) {
  var res = { total: 0, pos: 0, neg: 0, rows: [], alerts: [] };

  answers.forEach(function (a) {
    var i = a.picks[0];
    var direct = K.positive.indexOf(a.n) !== -1;
    var p = direct ? 2 - i : i;               // прямой пункт 2-1-0, обратный 0-1-2
    res.total += p;
    if (direct) res.pos += p; else res.neg += p;

    var al = null;
    K.alerts.forEach(function (x) {
      if (x.n === a.n && x.picks.indexOf(i) !== -1) al = x;
    });
    if (al) res.alerts.push({ n: a.n, short: al.short, stem: K.items[a.n - 1], answer: K.options[i] });

    // утверждения в отчёте — по-русски, на каком бы языке ни отвечал ученик
    res.rows.push({ n: a.n, block: '', stem: K.items[a.n - 1], letters: [a.letters[0]],
                    texts: [K.options[i]], values: [String(p)], alert: !!al });
  });

  for (var k = 0; k < K.levels.length; k++) {
    if (res.total >= K.levels[k].min) { res.level = K.levels[k]; break; }
  }
  return res;
}

/* Крупная плашка с уровнем и шкалой 0–36 */
function wbLevelCard(K, res) {
  var lv = res.level, col = lv.color;
  var zones = K.levels.slice().reverse().map(function (l, i, arr) {
    var top = i < arr.length - 1 ? arr[i + 1].min - 1 : K.max;
    return l.min + '–' + top + ' ' + l.name;
  }).join(' &nbsp;·&nbsp; ');
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="border-collapse:collapse;border:1px solid ' + C.line + ';">' +
    '<tr>' +
      '<td style="padding:14px 16px;border-left:6px solid ' + col + ';">' +
        '<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:' +
          C.muted + ';">УРОВЕНЬ ПСИХОЛОГИЧЕСКОГО БЛАГОПОЛУЧИЯ</div>' +
        '<div style="font-size:21px;font-weight:bold;color:' + col + ';padding-top:3px;">' +
          lv.name.charAt(0).toUpperCase() + lv.name.slice(1) + ' уровень</div>' +
        '<div style="font-size:12px;color:' + C.muted + ';padding-top:3px;">' +
          res.total + ' баллов из ' + K.max + '</div>' +
        '<div style="padding-top:9px;">' + barH(res.total / K.max * 100, col, 9) + '</div>' +
        '<div style="font-size:10px;color:' + C.muted + ';padding-top:5px;">' + zones + '</div>' +
      '</td>' +
    '</tr></table>';
}

/* Отдельные тревожные ответы — красной полосой слева, каждый строкой.
   Общий для шкалы благополучия и анонимной анкеты, отличается подписью. */
function wbAlerts(K, res) {
  return alertsBlock(res,
    'Тревожных ответов на отдельные утверждения нет.',
    'Блок отмечает отдельные ответы о плаче, желании уйти из дома, обесценивании жизни, ' +
    'страшных снах, одиночестве и сильной грусти. Такие ответы стоит обсудить с учеником ' +
    'лично, даже если общий балл средний или высокий.');
}

function alertsBlock(res, emptyText, note) {
  if (!res.alerts.length) {
    return '<div style="font-size:12px;color:' + C.muted + ';">' + emptyText + '</div>';
  }
  var h = '<table width="100%" cellpadding="0" cellspacing="0" border="0" ' +
          'style="border-collapse:collapse;">';
  res.alerts.forEach(function (a) {
    h += '<tr><td style="padding:7px 12px;border-left:4px solid ' + C.neg +
      ';border-bottom:1px solid ' + C.line + ';font-size:12px;color:' + C.ink + ';">' +
      '<b>' + a.n + '. ' + esc(a.stem) + '</b><br>' +
      '<span style="color:' + C.neg + ';">ответ: «' + esc(a.answer) + '»</span></td></tr>';
  });
  h += '</table>' +
    '<div style="font-size:11px;color:' + C.muted + ';padding-top:6px;">' + note + '</div>';
  return h;
}

function wbReportBody(K, d, res) {
  var pctPos = res.pos / K.maxPositive * 100, pctNeg = res.neg / K.maxNegative * 100;
  return studentCard(d) +
    '<div style="height:16px;"></div>' +
    wbLevelCard(K, res) +

    h2('ОБРАТИТЬ ВНИМАНИЕ') +
    wbAlerts(K, res) +

    h2('ИЗ ЧЕГО СЛОЖИЛСЯ БАЛЛ') +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      chartRow('Позитивные утверждения', '(1, 2, 4, 7, 8, 9, 11, 12, 13, 16)',
               barH(pctPos, C.accent), res.pos + ' / ' + K.maxPositive) +
      chartRow('Негативные утверждения', '(3, 5, 6, 10, 14, 15, 17, 18 — обратный счёт)',
               barH(pctNeg, C.accent), res.neg + ' / ' + K.maxNegative) +
    '</table>' +
    '<div style="font-size:11px;color:' + C.muted + ';padding-top:6px;">' +
      'Чем длиннее полоса, тем благополучнее ответы в этой группе: у негативных ' +
      'утверждений полный балл даёт ответ «Никогда».</div>' +

    h2('ИНТЕРПРЕТАЦИЯ') +
    '<div style="font-size:13px;color:' + C.ink + ';">' + esc(res.level.text) + '</div>' +
    '<div style="font-size:11px;color:' + C.muted + ';padding-top:8px;">' +
      'Опросник — инструмент предварительной оценки и не заменяет профессиональной ' +
      'диагностики. При низких показателях рекомендуется более детальное индивидуальное ' +
      'обследование и, при необходимости, коррекционная работа.</div>';
}

function wbPlainText(K, d, res) {
  var L = [];
  L.push(K.title + ' — ' + K.author);
  L.push('');
  L.push('Ученик: ' + d.fio + ', ' + d.klass + ' класс');
  L.push('Дата: ' + d.date + ' (время прохождения: ' + d.duration + ')');
  L.push('');
  L.push('ИТОГ: ' + res.total + ' из ' + K.max + ' — ' + res.level.name + ' уровень');
  L.push(res.level.text);
  L.push('');
  if (res.alerts.length) {
    L.push('ОБРАТИТЬ ВНИМАНИЕ:');
    res.alerts.forEach(function (a) { L.push('  ' + a.n + '. ' + a.stem + ' — «' + a.answer + '»'); });
  } else {
    L.push('Тревожных ответов на отдельные утверждения нет.');
  }
  L.push('');
  L.push('Подробный протокол — в PDF во вложении.');
  return L.join('\n');
}

/* Лист «Благополучие»: строка на ученика. В столбцах 1–18 — балл
   за утверждение (0–2) с учётом прямого и обратного счёта. */
function wbLogToSheet(K, d, res) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  var sh = ss.getSheetByName(K.sheet);
  if (!sh) {
    var head = ['Дата', 'ФИО', 'Класс', 'Школа', 'Балл (0–36)', 'Уровень',
                'Обратить внимание', 'Время'];
    for (var n = 1; n <= K.items.length; n++) head.push(String(n));
    sh = ss.insertSheet(K.sheet);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  }
  sh.appendRow([d.date, d.fio, d.klass, d.school || '', res.total, res.level.name,
                res.alerts.map(function (a) { return a.n + ' — ' + a.short + ' (' +
                  a.answer.toLowerCase() + ')'; }).join('; '),
                d.duration].concat(res.rows.map(function (r) { return Number(r.values[0]); })));
}

/* Протокол одной анонимной анкеты: ответы как есть (ключа нет) и блок
   «Обратить внимание» — вопросы, где ответ попал в тревожные показатели
   (K.signals, те же, что сверху в сводке по классу). */
var OPT_LETTERS = 'абвгдежзиклмн';

function scoreSurvey(K, answers) {
  var res = { rows: [], alerts: [] };
  K.questions.forEach(function (q, i) {
    var a = answers[i];
    var row = { n: q.n, block: '', stem: q.stem, letters: [], texts: [], values: [] };

    if (a.skipped) {
      row.letters.push('—');
      row.texts.push('вопрос пропущен: в вопросе ' + q.skipIf.n + ' ответ «' +
                     K.questions[q.skipIf.n - 1].options[q.skipIf.pick] + '»');
      row.values.push('');
    } else {
      a.picks.forEach(function (p) {
        row.letters.push(OPT_LETTERS.charAt(p));
        row.texts.push(q.other && p === q.options.length - 1
          ? q.options[p] + ': «' + a.other + '»' : q.options[p]);
        row.values.push('');
      });

      // все тревожные варианты этого вопроса, которые ученик отметил
      var hit = [];
      K.signals.forEach(function (sg) {
        if (sg.n !== q.n) return;
        sg.picks.forEach(function (p) {
          if (a.picks.indexOf(p) !== -1 && hit.indexOf(p) === -1) hit.push(p);
        });
      });
      if (hit.length) {
        hit.sort(function (x, y) { return x - y; });
        res.alerts.push({ n: q.n, stem: q.stem,
          answer: hit.map(function (p) { return q.options[p]; }).join('», «') });
        row.alert = true;
      }
    }
    res.rows.push(row);
  });
  return res;
}

function svReportBody(K, d, res) {
  return studentCard(d) +
    h2('ОБРАТИТЬ ВНИМАНИЕ') +
    alertsBlock(res,
      'Ответов из списка тревожных показателей нет.',
      'Отмечены ответы из списка тревожных показателей: плохие отношения с родителями, ' +
      'физическое наказание, незащищённость в семье, травля в соцсетях, насилие в школе. ' +
      'Анкета анонимная — ученика по ней не установить; такие ответы показывают, ' +
      'на что обратить внимание в классе.') +
    h2('ОТВЕТЫ') +
    answersTable(res);
}

function svPlainText(K, d, res) {
  var L = [];
  L.push(K.title + ' — ' + K.author);
  L.push('');
  L.push('Анонимная анкета, ' + d.klass + ' класс, ' + d.date);
  L.push('');
  if (res.alerts.length) {
    L.push('ОБРАТИТЬ ВНИМАНИЕ:');
    res.alerts.forEach(function (a) { L.push('  ' + a.n + '. ' + a.stem + ' — «' + a.answer + '»'); });
  } else {
    L.push('Ответов из списка тревожных показателей нет.');
  }
  L.push('');
  res.rows.forEach(function (r) {
    L.push(r.n + '. ' + r.stem);
    r.texts.forEach(function (t, i) { L.push('   ' + r.letters[i] + ') ' + t); });
  });
  L.push('');
  L.push('Протокол — в PDF во вложении.');
  return L.join('\n');
}

/* ==================================================== АНОНИМНАЯ АНКЕТА
   Журнал без имён. Две меры, чтобы анонимность была настоящей, а не только
   «имя не спрашиваем»:
   · дата без времени — по минуте отправки ученика в небольшом классе
     нетрудно вычислить;
   · строка встаёт в СЛУЧАЙНОЕ место листа, а не в конец — иначе порядок
     строк повторял бы порядок отправки («последним сдавал Петров»).
     Отсортировать по дате можно в любой момент: Данные → Сортировка.
   ====================================================================== */
var CODES_HEAD = 'Коды для сводки (не править)';

function surveyCell(q, a) {
  if (a.skipped) return '— (вопрос пропущен)';
  return a.picks.map(function (p) {
    if (q.other && p === q.options.length - 1) return q.options[p] + ': «' + a.other + '»';
    return q.options[p];
  }).join('; ');
}

function logSurvey(K, d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  // 30 учеников отправляют почти одновременно: вставка строки в середину —
  // две операции, и без замка две анкеты могли бы лечь в одну строку
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var sh = ss.getSheetByName(K.sheet);
    if (!sh) {
      var head = ['Дата', 'Класс', 'Язык', 'Время'];
      K.questions.forEach(function (q) { head.push(q.n + '. ' + q.short); });
      head.push(CODES_HEAD);
      sh = ss.insertSheet(K.sheet);
      sh.appendRow(head);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setWrap(true);
    }

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var codes = d.answers.map(function (a) {
      return a.skipped ? null : (a.other ? { p: a.picks, o: a.other } : { p: a.picks });
    });
    var row = [today, d.klass, d.lang === 'ru' ? 'рус' : 'қаз', d.duration];
    K.questions.forEach(function (q, i) { row.push(surveyCell(q, d.answers[i])); });
    row.push(JSON.stringify(codes));

    var last = sh.getLastRow();                         // вместе с шапкой
    var pos = 2 + Math.floor(Math.random() * last);     // от 2 до last + 1
    if (pos <= last) sh.insertRowBefore(pos);
    var range = sh.getRange(pos, 1, 1, row.length);
    range.setValues([row]).setFontWeight('normal');
    sh.getRange(pos, 1).setNumberFormat('dd.MM.yyyy');
  } finally {
    lock.releaseLock();
  }
}

/* ================================================= СВОДКА ИЗ МЕНЮ ТАБЛИЦЫ
   Меню «Психодиагностика» появляется в таблице при её открытии.
   Сводка строится на отдельном листе «Сводка · Обращение · 7А»: по каждому
   вопросу — сколько учеников и какой процент выбрали каждый вариант.
   Распечатать или сохранить: Файл → Скачать → PDF.
   ====================================================================== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Психодиагностика')
    .addItem('Сводка «Как с тобой обращаются»…', 'summaryKakSToboy')
    .addToUi();
}

// меню вызывает функцию без параметров — по обёртке на каждую анонимную анкету
function summaryKakSToboy() { openSurveyDialog('kak-s-toboy-obrashchayutsya'); }

function openSurveyDialog(testId) {
  var K = KEYS[testId];
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(K.sheet);
  if (!sh || sh.getLastRow() < 2) {
    ui.alert('Ответов пока нет',
             'Лист «' + K.sheet + '» появится, когда первый ученик отправит анкету.',
             ui.ButtonSet.OK);
    return;
  }

  // классы, которые есть в ответах: 5А, 5Б, …, 11М — по числу, потом по букве
  var seen = {};
  sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
    if (r[0]) seen[String(r[0])] = true;
  });
  var classes = Object.keys(seen).sort(function (a, b) {
    var na = parseInt(a, 10) || 0, nb = parseInt(b, 10) || 0;
    return na !== nb ? na - nb : a.localeCompare(b, 'ru');
  });

  var opts = '<option value="">Все классы</option>' + classes.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');

  var html =
    '<style>' +
      'body{font-family:Arial,sans-serif;font-size:14px;color:#1a2233;margin:4px 2px;}' +
      'label{display:block;margin:0 0 12px;color:#6b7689;font-size:13px;}' +
      'select,input{display:block;width:100%;box-sizing:border-box;margin-top:4px;' +
        'padding:8px;font-size:14px;border:1px solid #cfd6e3;border-radius:6px;}' +
      '.row{display:flex;gap:10px;} .row label{flex:1;}' +
      'button{background:#3b6ef5;color:#fff;border:0;border-radius:6px;padding:10px 18px;' +
        'font-size:14px;cursor:pointer;width:100%;}' +
      'button:disabled{opacity:.5;} #msg{color:#dc2626;margin-top:10px;font-size:13px;}' +
      '.tip{color:#6b7689;font-size:12px;margin:-4px 0 14px;}' +
    '</style>' +
    '<label>Класс<select id="k">' + opts + '</select></label>' +
    '<div class="row">' +
      '<label>С даты<input type="date" id="f"></label>' +
      '<label>По дату<input type="date" id="t"></label>' +
    '</div>' +
    '<div class="tip">Даты можно не заполнять — тогда в сводку войдут все ответы.</div>' +
    '<button id="go">Построить сводку</button>' +
    '<div id="msg"></div>' +
    '<script>' +
      'document.getElementById("go").onclick=function(){' +
        'var b=this;b.disabled=true;b.textContent="Строю…";' +
        'google.script.run' +
          '.withSuccessHandler(function(){google.script.host.close();})' +
          '.withFailureHandler(function(e){b.disabled=false;b.textContent="Построить сводку";' +
            'document.getElementById("msg").textContent=e.message||e;})' +
          '.buildSurveySummary("' + testId + '",' +
            'document.getElementById("k").value,' +
            'document.getElementById("f").value,' +
            'document.getElementById("t").value);' +
      '};' +
    '</script>';

  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(300),
                     'Сводка по классу');
}

function parseDay(s, endOfDay) {
  if (!s) return null;
  var p = String(s).split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2]);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function fmtDay(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd.MM.yyyy');
}

/* Вызывается из окна сводки. klass — '' для всех классов,
   from/to — 'гггг-мм-дд' или ''. */
function buildSurveySummary(testId, klass, from, to) {
  var K = KEYS[testId];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(K.sheet);
  var data = src.getDataRange().getValues();
  var codeCol = data[0].indexOf(CODES_HEAD);
  if (codeCol === -1) throw new Error('На листе «' + K.sheet + '» нет столбца «' + CODES_HEAD + '».');

  var dFrom = parseDay(from, false), dTo = parseDay(to, true);
  var forms = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (klass && String(row[1]) !== klass) continue;
    var day = row[0] instanceof Date ? row[0] : null;
    if ((dFrom || dTo) && !day) continue;
    if (dFrom && day < dFrom) continue;
    if (dTo && day > dTo) continue;
    try { forms.push(JSON.parse(row[codeCol])); } catch (ignored) {}
  }
  var N = forms.length;
  if (!N) throw new Error('За выбранный период анкет ' + (klass ? 'класса ' + klass : '') + ' нет.');

  // ------------------------------------------------------------- подсчёт
  var stat = K.questions.map(function (q, i) {
    var s = { answered: 0, counts: q.options.map(function () { return 0; }), others: [] };
    forms.forEach(function (codes) {
      var c = codes[i];
      if (!c) return;
      s.answered++;
      c.p.forEach(function (p) { if (p < s.counts.length) s.counts[p]++; });
      if (c.o) s.others.push(c.o);
    });
    return s;
  });

  function hasAny(codes, n, picks) {
    var c = codes[n - 1];
    return !!c && c.p.some(function (p) { return picks.indexOf(p) !== -1; });
  }

  // ------------------------------------------------------------- вёрстка
  // Всё собирается в массив строк из 4 столбцов, форматирование — списками
  // номеров строк, и пишется на лист одним вызовом.
  var rows = [], fmt = { title: [], head: [], note: [], q: [], data: [], other: [] };
  function add(type, a, b, c, d) {
    rows.push([a == null ? '' : a, b == null ? '' : b, c == null ? '' : c, d == null ? '' : d]);
    if (type) fmt[type].push(rows.length);
  }
  function bar(share) { return new Array(Math.round(share * 20) + 1).join('█'); }

  var period = (dFrom || dTo)
    ? (dFrom ? 'с ' + fmtDay(dFrom) + ' ' : '') + (dTo ? 'по ' + fmtDay(dTo) : '')
    : 'за всё время';

  add('title', 'Сводка: ' + K.title);
  add('note', (klass ? 'Класс ' + klass : 'Все классы') + ' · ' + period + ' · анкет: ' + N +
              ' · сформировано ' + fmtDay(new Date()));
  add(null);

  add('head', 'ТРЕВОЖНЫЕ ПОКАЗАТЕЛИ — доля учеников, отметивших вариант', 'Учеников', '%', '');
  K.signals.forEach(function (sg) {
    var c = 0;
    forms.forEach(function (codes) { if (hasAny(codes, sg.n, sg.picks)) c++; });
    add('data', sg.label + '  (вопрос ' + sg.n + ')', c, c / N, bar(c / N));
  });
  add(null);

  add('head', 'ОТВЕТЫ ПО ВОПРОСАМ', 'Учеников', '%', '');
  K.questions.forEach(function (q, i) {
    var s = stat[i];
    add('q', q.n + '. ' + q.stem);
    var note = 'Ответили: ' + s.answered + ' из ' + N;
    if (q.skipIf && s.answered < N) {
      note += ' (остальные в вопросе ' + q.skipIf.n + ' ответили «' +
              K.questions[q.skipIf.n - 1].options[q.skipIf.pick] + '»)';
    }
    if (q.multi) note += '. Можно было выбрать несколько вариантов — сумма может быть больше 100 %';
    add('note', note);
    q.options.forEach(function (o, k) {
      var share = s.answered ? s.counts[k] / s.answered : 0;
      add('data', o, s.counts[k], share, bar(share));
    });
    s.others.forEach(function (t) { add('other', '      «' + t + '»'); });
    add(null);
  });

  add('note', 'Опросник анонимный: по нему делают общие выводы и намечают направления работы ' +
              'в классе, школе и с семьями. Если высока вероятность школьного насилия, стресса, ' +
              'страхов и унижений, рекомендуется объединить усилия родителей и педагогов и провести ' +
              'более глубокое исследование учащихся (раздел 1.2.4 сборника).');

  // ---------------------------------------------------- запись на лист
  var name = 'Сводка · ' + (K.short || K.title) + ' · ' + (klass || 'все классы');
  var sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);

  sh.getRange(1, 1, rows.length, 4).setValues(rows)
    .setVerticalAlignment('top').setFontFamily('Arial').setFontSize(10);
  sh.setColumnWidth(1, 470);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 60);
  sh.setColumnWidth(4, 170);
  sh.getRange(1, 1, rows.length, 1).setWrap(true);

  function each(list, f) { list.forEach(function (r) { f(sh.getRange(r, 1, 1, 4)); }); }
  each(fmt.title, function (g) { g.setFontSize(14).setFontWeight('bold'); });
  each(fmt.head,  function (g) { g.setFontWeight('bold').setFontColor('#6b7689')
                                  .setBorder(false, false, true, false, false, false); });
  each(fmt.q,     function (g) { g.setFontWeight('bold'); });
  each(fmt.note,  function (g) { g.setFontColor('#6b7689').setFontStyle('italic'); });
  each(fmt.other, function (g) { g.setFontColor('#1a2233').setFontStyle('italic'); });
  each(fmt.data,  function (g) {
    g.offset(0, 2, 1, 1).setNumberFormat('0%');
    g.offset(0, 3, 1, 1).setFontColor('#3b6ef5');
  });
  ss.setActiveSheet(sh);
  return name;
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
    testId: 'motivaciya-lukyanova', fio: 'Пробный Ученик', klass: '11 А',
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

/* Пробное письмо по шкале благополучия: ответы подобраны так, чтобы
   сработал блок «Обратить внимание» (пункты 10 и 17). */
function testWellbeingSample() {
  var K = KEYS['blagopoluchie-riff'];
  var L = ['а', 'б', 'в'];
  var answers = K.items.map(function (stem, i) {
    var p = (i + 1 === 10 || i + 1 === 17) ? 1 : (i % 3);
    return { n: i + 1, picks: [p], letters: [L[p]], texts: [K.options[p]], stem: stem };
  });
  var d = {
    testId: 'blagopoluchie-riff', fio: 'Пробный Ученик', klass: '10А',
    school: '', date: 'проверка', duration: '3 мин'
  };
  var res = scoreWellbeing(K, answers);
  MailApp.sendEmail({
    to: EMAIL,
    subject: 'ПРОВЕРКА · ' + KINDS.wellbeing.subject(K, d, res),
    htmlBody: emailHtml(K, d, res),
    body: wbPlainText(K, d, res),
    attachments: [makePdf(K, d, res)],
    name: 'Психодиагностика'
  });
  Logger.log('Отправлено на ' + EMAIL + '. Итог: ' + res.total + ', уровень ' + res.level.name);
}

/* Проверка почты одним кликом: выберите в списке функций diagnoseMail,
   нажмите «Выполнить» и посмотрите «Журнал выполнения». Ничего не меняет
   и писем не отправляет — только показывает, почему письма могли не уйти. */
function diagnoseMail() {
  Logger.log('Получатель: ' + EMAIL);
  Logger.log('Остаток суточной квоты Google: ' + MailApp.getRemainingDailyQuota() +
    (MailApp.getRemainingDailyQuota() === 0 ? '  ← КВОТА GOOGLE ИСЧЕРПАНА' : ''));
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    var n = sh.getLastRow();
    Logger.log('Лист «' + sh.getName() + '»: строк ' + Math.max(n - 1, 0) +
      (n > 1 ? ', последняя запись: ' + sh.getRange(n, 1).getDisplayValue() : ''));
  });
}

/* ========================================== ДОСЛАТЬ ПРОТОКОЛЫ ЗА ДЕНЬ
   Если письма за какой-то день не ушли (квота, сбой почты), протоколы
   можно восстановить из таблицы. Выберите в списке функций resendDay
   и нажмите «Выполнить». Придёт по одному письму на методику: в нём
   список всех учеников за день и PDF-протокол каждого во вложении.

   Писем одно-два, а не по одному на ученика: квота Google считает письма,
   а не вложения. Какие из протоколов уже приходили, восстановить нельзя —
   анонимные анкеты лежат на листе вперемешку и без времени, — поэтому
   в письмо попадают ВСЕ протоколы дня, часть из них будет повтором.

   День — сегодняшний. Для другого дня впишите его в RESEND_DAY,
   например '07.10.2026'.
   ====================================================================== */
var RESEND_DAY = '';

function resendDay() {
  var day = RESEND_DAY ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sent = 0;

  Object.keys(KEYS).forEach(function (testId) {
    var K = KEYS[testId];
    var sh = ss.getSheetByName(K.sheet || SHEET);
    if (!sh || sh.getLastRow() < 2) return;
    var shown = sh.getDataRange().getDisplayValues();
    var raw = sh.getDataRange().getValues();

    var items = [];
    for (var r = 1; r < shown.length; r++) {
      if (String(shown[r][0]).indexOf(day) !== 0) continue;
      var it = K.kind === 'wellbeing' ? wbFromRow(K, testId, shown[0], shown[r])
             : K.kind === 'survey'    ? svFromRow(K, testId, shown[0], shown[r], raw[r], items.length + 1)
             : null;
      if (it) items.push(it);
      else if (K.kind === 'motivation') {
        Logger.log('Лист «' + sh.getName() + '», строка ' + (r + 1) + ': по анкете мотивации ' +
          'в таблице только итоговые баллы, протокол из них не собрать — пропущено.');
      }
    }
    if (!items.length) return;

    var kind = KINDS[K.kind];
    var list = items.map(function (it, i) {
      var who = it.d.fio ? it.d.fio + ', ' + it.d.klass : 'анкета ' + (i + 1) + ', ' + it.d.klass;
      return '<li style="padding:2px 0;">' + esc(who) + ' — ' + esc(kind.footer(K, it.res)) + '</li>';
    }).join('');

    MailApp.sendEmail({
      to: EMAIL,
      subject: 'Протоколы за ' + day + ' · ' + (K.short || K.title) + ' · ' + items.length + ' шт.',
      htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;color:' + C.ink + ';">' +
        '<p>Протоколы, которые ' + day + ' не дошли письмами по одному. ' +
        'Здесь все анкеты этого дня по методике «' + esc(K.title) + '», ' +
        'поэтому часть из них может повторять уже полученные письма.</p>' +
        '<ol style="font-size:13px;">' + list + '</ol>' +
        '<p style="font-size:12px;color:' + C.muted + ';">📎 PDF каждого протокола — во вложении.</p></div>',
      attachments: items.map(function (it) { return makePdf(K, it.d, it.res); }),
      name: 'Психодиагностика'
    });
    sent++;
    Logger.log('«' + K.title + '»: отправлено одним письмом, протоколов ' + items.length);
  });

  Logger.log(sent ? 'Готово, писем отправлено: ' + sent + ', получатель ' + EMAIL
                  : 'За ' + day + ' анкет в таблице не найдено.');
}

/* Строка листа «Благополучие» → данные анкеты. В таблице хранится балл
   за утверждение, а вариант ответа из него восстанавливается однозначно:
   у прямого пункта балл 2-1-0, у обратного 0-1-2. */
function wbFromRow(K, testId, head, row) {
  var L = ['а', 'б', 'в'];
  var first = head.indexOf('1');
  var answers = K.items.map(function (stem, i) {
    var p = Number(row[first + i]);
    var pick = K.positive.indexOf(i + 1) !== -1 ? 2 - p : p;
    return { n: i + 1, picks: [pick], letters: [L[pick]] };
  });
  var d = { testId: testId, fio: row[1], klass: row[2], school: row[3],
            date: row[0], duration: row[7] };
  return { d: d, res: scoreWellbeing(K, answers) };
}

/* Строка анонимной анкеты → данные анкеты, по столбцу с кодами ответов. */
function svFromRow(K, testId, head, row, rawRow, no) {
  var codes;
  try { codes = JSON.parse(rawRow[head.indexOf(CODES_HEAD)]); } catch (ignored) { return null; }
  var answers = codes.map(function (c) {
    return c ? { picks: c.p, other: c.o || '' } : { skipped: true, picks: [] };
  });
  var d = { testId: testId, fio: '', klass: row[1], school: '', date: row[0],
            duration: row[3], sid: '000' + no };
  return { d: d, res: scoreSurvey(K, answers) };
}
