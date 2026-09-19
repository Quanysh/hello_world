/* Домашняя библиотека - клиентское приложение без сборки. */
(() => {
  'use strict';

  const BOOKS = (window.LIBRARY || []).map(normalizeBook);
  const MAP = window.SHELF_MAP || { cols: 4, rows: 6, colNames: {}, empty: [] };

  const STATUS_LABEL = { read: 'Прочитана', reading: 'Читаю', unread: 'Не читана' };
  const LANG_LABEL = { ru: 'Русский', en: 'English', kk: 'Қазақша', de: 'Deutsch',
                       fr: 'Français', es: 'Español', tr: 'Türkçe', uk: 'Українська' };

  const state = {
    q: '',
    genres: new Set(),
    lang: '',
    status: '',
    cell: '',
    lowOnly: false,
    fitWall: localStorage.getItem('hl.fitWall') !== '0',
    sort: 'author',
    view: localStorage.getItem('hl.view') || 'wall'
  };

  /* ---------- утилиты ---------- */

  function normalizeBook(b, i) {
    const o = Object.assign({
      id: 'b' + String(i + 1).padStart(4, '0'),
      title: 'Без названия', author: 'Без автора', language: 'ru',
      genres: [], tags: [], status: 'unread', rating: 0, shelf: '',
      year: null, pages: null, isbn: '', publisher: '', series: null,
      seriesIndex: null, cover: '', notes: '', originalTitle: '', confidence: 'high'
    }, b);
    o.authorSort = o.authorSort || toSortName(o.author);
    o._hay = fold([o.title, o.originalTitle, o.author, o.publisher, o.series,
                   o.genres.join(' '), o.tags.join(' '), o.isbn, o.year, o.notes].join(' '));
    return o;
  }

  function toSortName(a) {
    const first = String(a).split(',')[0].trim().split(/\s+/);
    return first.length < 2 ? String(a) : first[first.length - 1] + ', ' + first.slice(0, -1).join(' ');
  }

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* Палитра корешков: приглушённые «книжные» тона, детерминированы по названию. */
  const HUES = [8, 18, 28, 42, 95, 145, 172, 200, 216, 250, 282, 330];
  function coverVars(b) {
    const h0 = hash(b.id + b.title);
    const hue = HUES[h0 % HUES.length];
    const sat = 26 + (h0 >> 4) % 22;
    const lig = 26 + (h0 >> 9) % 16;
    return `--c1:hsl(${hue} ${sat}% ${lig}%);--c2:hsl(${(hue + 22) % 360} ${sat + 8}% ${lig - 9}%)`;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const cellLabel = id => id ? `Секция ${id.split('-')[0]} · полка ${id.split('-')[1]}` : 'Без места';
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10;
    return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };

  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag);
    if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  /* ---------- фильтрация ---------- */

  function filtered() {
    const terms = fold(state.q).split(' ').filter(Boolean);
    let out = BOOKS.filter(b => {
      if (state.lang && b.language !== state.lang) return false;
      if (state.status && b.status !== state.status) return false;
      if (state.cell && b.shelf !== state.cell) return false;
      if (state.lowOnly && b.confidence !== 'low') return false;
      if (state.genres.size && !b.genres.some(g => state.genres.has(g))) return false;
      return terms.every(t => b._hay.includes(t));
    });
    const cmp = {
      author: (a, b) => a.authorSort.localeCompare(b.authorSort, 'ru') || a.title.localeCompare(b.title, 'ru'),
      title: (a, b) => a.title.localeCompare(b.title, 'ru'),
      year: (a, b) => (b.year || 0) - (a.year || 0),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'ru'),
      added: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')),
      shelf: (a, b) => String(a.shelf).localeCompare(String(b.shelf), undefined, { numeric: true })
    }[state.sort];
    return out.sort(cmp);
  }

  /* ---------- рендер: карточка / корешок ---------- */

  /* Инициалы для маленькой обложки. На 62px название не читается ни при
     каком кегле: остаток ширины после полей вмещает полтора символа,
     и заголовок разваливается на обрезанные слоги. */
  function monogram(b) {
    const words = String(b.author || b.title || '').trim().split(/\s+/)
      .filter(w => /\p{L}/u.test(w));
    if (!words.length) return '';
    const first = words[0].match(/\p{L}/u)[0];
    if (words.length === 1) return first.toUpperCase();
    return (first + words[words.length - 1].match(/\p{L}/u)[0]).toUpperCase();
  }

  function coverHTML(b, mode) {
    const img = b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy"
        onerror="this.remove()">` : '';
    if (mode === 'mini') {
      return `<div class="cover cover-mini" style="${coverVars(b)}"
        title="${esc(b.title)}" aria-hidden="true">${img}
        <span class="c-mono">${esc(monogram(b))}</span></div>`;
    }
    return `<div class="cover" style="${coverVars(b)}">${img}
      <div class="c-title">${esc(b.title)}</div>
      <div class="c-author">${esc(b.author)}</div></div>`;
  }

  function cardHTML(b) {
    const bits = [b.year || '', (b.genres[0] || '')].filter(Boolean).join(' · ');
    return `<button class="card" data-id="${b.id}">
      ${coverHTML(b)}
      <div class="m-title">${esc(b.title)}</div>
      <div class="m-author">${esc(b.author)}</div>
      <div class="m-meta"><span class="dot ${b.status}"></span>${esc(bits)}</div>
    </button>`;
  }

  /* На корешке помещается одна строка, поэтому берём самое информативное:
     у книги без прочитанного названия - автора, у тома собрания - автора с номером. */
  function spineLabel(b) {
    if (b.title === 'Название не читается') return b.author;
    const vol = b.title.match(/^Тома? ([\dIVXLC?-]+)/i);
    if (vol && b.author !== 'Автор не установлен') return `${b.author} · ${vol[1]}`;
    return b.title;
  }

  function spineHTML(b) {
    const h = hash(b.id);
    const w = Math.max(22, Math.min(54, Math.round((b.pages || 260) / 11)));
    const tall = 150 + (h % 46);
    return `<button class="spine" data-id="${b.id}" title="${esc(b.title + ' — ' + b.author)}"
      style="${coverVars(b)};width:${w}px;height:${tall}px">
      <span class="s-title">${esc(spineLabel(b))}</span><span class="s-mark"></span></button>`;
  }

  /* ---------- виды ---------- */

  /* Корешок для вида «Стеллаж»: уже, чем на полке, но с читаемым названием. */
  function wallSpineHTML(b) {
    const h = hash(b.id);
    const w = b.pages ? Math.max(20, Math.min(34, Math.round(b.pages / 18))) : 20 + h % 11;
    const tall = 74 + (h >> 3) % 22;
    return `<button class="wc-spine" data-id="${b.id}"
      title="${esc(b.author + ' — ' + b.title)}"
      style="${coverVars(b)};--w:${w}px;height:${tall}%">
      <span class="t">${esc(spineLabel(b))}</span></button>`;
  }

  /* Свечи Большого зала: парят над стеллажом, у каждой свой ритм. */
  function candlesHTML() {
    const at = [7, 19, 30, 43, 55, 68, 80, 91];
    return `<div class="candles${state.fitWall ? ' is-tight' : ''}" aria-hidden="true">${at.map((x, i) =>
      `<i style="--x:${x}%;--h:${18 + (i * 7) % 15}px;--d:-${(i * 0.9).toFixed(1)}s"></i>`).join('')}</div>`;
  }

  function renderWall(list) {
    const filtering = !!(state.q || state.genres.size || state.lang || state.status || state.lowOnly);
    const scroll = el('div', 'wall-scroll');
    const box = el('div', 'wall' + (state.fitWall ? ' is-fit' : ''));
    box.style.setProperty('--cols', MAP.cols);
    const byCell = new Map();
    list.forEach(b => { if (!byCell.has(b.shelf)) byCell.set(b.shelf, []); byCell.get(b.shelf).push(b); });
    for (let r = 1; r <= MAP.rows; r++) {
      for (let c = 1; c <= MAP.cols; c++) {
        const id = `${c}-${r}`;
        const books = byCell.get(id) || [];
        const isEmpty = (MAP.empty || []).includes(id);
        const cell = el('div', 'wall-cell' + (books.length ? '' : ' is-blank'));
        cell.innerHTML = `
          <div class="wc-shelf">${books.map(wallSpineHTML).join('')}</div>
          <div class="wc-foot">
            <button class="wc-id" data-cell="${id}"
              title="Показать полку ${c}-${r} целиком">${c}-${r}</button>
            <span class="wc-n">${
              books.length ? books.length + ' ' + plural(books.length, 'книга', 'книги', 'книг')
              : isEmpty ? 'декор'
              : filtering ? 'нет совпадений'
              : 'не оцифровано'}</span></div>`;
        box.append(cell);
      }
    }
    /* Ширина стеллажа считается от самой полной полки в текущей выборке:
       при поиске по одной книге незачем держать шкаф на 3000px. */
    const maxPer = Math.max(0, ...[...byCell.values()].map(a => a.length));
    const cellW = Math.max(200, Math.min(900, maxPer * 25 + 26));
    box.style.minWidth = (cellW * MAP.cols + (MAP.cols + 1) * 7 + 24) + 'px';

    scroll.append(box);
    const frag = document.createDocumentFragment();
    frag.append(el('div', '', candlesHTML()).firstElementChild, scroll);
    return frag;
  }

  function renderShelf(list) {
    const frag = document.createDocumentFragment();
    const groups = new Map();
    list.forEach(b => { const k = b.shelf || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); });
    [...groups.keys()].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .forEach(k => {
        const books = groups.get(k);
        const g = el('section', 'shelf-group');
        g.innerHTML = `<div class="shelf-head"><h3>${esc(cellLabel(k))}</h3>
            <span>${books.length} ${plural(books.length, 'книга', 'книги', 'книг')}</span></div>
          <div class="shelf">${books.map(spineHTML).join('')}</div>
          <div class="shelf-board"></div>`;
        frag.append(g);
      });
    return frag;
  }

  function renderList(list) {
    const rows = list.map(b => `<tr data-id="${b.id}">
      <td class="t">${esc(b.title)}</td>
      <td>${esc(b.author)}</td>
      <td class="dim hide-sm">${b.year || '—'}</td>
      <td class="hide-sm">${b.genres.map(g => `<span class="tag">${esc(g)}</span>`).join('')}</td>
      <td class="dim hide-sm">${esc(b.shelf || '—')}</td>
      <td><span class="dot ${b.status}"></span></td>
    </tr>`).join('');
    const w = el('div', 'table-wrap');
    w.innerHTML = `<table><thead><tr>
      <th>Название</th><th>Автор</th><th class="hide-sm">Год</th>
      <th class="hide-sm">Жанр</th><th class="hide-sm">Ячейка</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;
    return w;
  }

  /* ---------- модалка ---------- */

  function openBook(id) {
    const b = BOOKS.find(x => x.id === id); if (!b) return;
    const kv = [
      ['Автор', b.author],
      ['Оригинал', b.originalTitle],
      ['Цикл', b.series ? b.series + (b.seriesIndex ? ` #${b.seriesIndex}` : '') : ''],
      ['Год', b.year],
      ['Издательство', b.publisher],
      ['Язык', LANG_LABEL[b.language] || b.language],
      ['Жанры', b.genres.join(', ')],
      ['Объём', b.pages ? b.pages + ' с.' : ''],
      ['ISBN', b.isbn],
      ['Место', b.shelf ? cellLabel(b.shelf) : ''],
      ['Статус', STATUS_LABEL[b.status]],
      ['Метки', b.tags.join(', ')]
    ].filter(([, v]) => v !== '' && v != null);

    $('#detail .sheet').innerHTML = `
      <div class="sheet-body">
        <div class="cover-slot">${coverHTML(b, true)}</div>
        <div>
          <h2>${esc(b.title)}</h2>
          <div class="author">${esc(b.author)}</div>
          <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          ${b.notes ? `<div class="note">${esc(b.notes)}</div>` : ''}
          ${b.confidence === 'low' ? `<div class="note">Корешок на фото читается плохо - данные стоит перепроверить.</div>` : ''}
        </div>
      </div>
      <div class="sheet-foot">
        <span class="stars">${b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5 - b.rating) : ''}</span>
        <button class="icon-btn" data-close>Закрыть</button>
      </div>`;
    $('#detail').showModal();
  }

  /* ---------- сборка ---------- */

  function paint() {
    const list = filtered();
    const main = $('#library');
    main.innerHTML = '';
    main.dataset.view = state.view;

    if (state.view === 'wish') {
      const host = el('div', 'wish-host');
      main.append(host);
      if (window.Wishlist) window.Wishlist.render(host);
    } else if (!BOOKS.length) {
      main.append(el('div', 'empty', `<div class="big">Каталог пока пуст</div>
        Ниже - карта стеллажа. Ячейки заполняются по мере разбора фото.`));
      main.append(renderWall([]));
    } else if (!list.length) {
      main.append(el('div', 'empty', `<div class="big">Ничего не нашлось</div>
        Попробуй другой запрос или сбрось фильтры.`));
    } else if (state.view === 'wall') {
      main.append(renderWall(list));
    } else if (state.view === 'shelf') {
      main.append(renderShelf(list));
    } else if (state.view === 'list') {
      main.append(renderList(list));
    } else {
      const g = el('div', 'grid'); g.innerHTML = list.map(cardHTML).join(''); main.append(g);
    }

    $('#found').textContent = state.view === 'wish' ? '' : `${list.length} из ${BOOKS.length}`;
    document.querySelectorAll('.segmented [data-view]').forEach(btn =>
      btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view)));
    if (window.Wishlist) {
      const n = window.Wishlist.count();
      $('#tab-wish').textContent = n ? `Вишлист · ${n}` : 'Вишлист';
    }
    const lowN = BOOKS.filter(b => b.confidence === 'low').length;
    const isWish = state.view === 'wish';
    document.querySelector('.filters').hidden = isWish;
    $('#stats').hidden = isWish;
    $('#fit').hidden = isWish || state.view !== 'wall';
    $('#fit').textContent = state.fitWall ? 'Крупно' : 'Вся стенка';
    $('#fit').title = state.fitWall
      ? 'Показать названия на корешках'
      : 'Уместить все 532 книги на экран';
    $('#verify').hidden = !lowN;
    $('#verify').textContent = `Требуют проверки · ${lowN}`;
    $('#verify').setAttribute('aria-pressed', String(state.lowOnly));
    $('#reset').hidden = !(state.q || state.genres.size || state.lang || state.status || state.cell || state.lowOnly);
    $('#cell-note').hidden = !state.cell;
    if (state.cell) $('#cell-note').textContent = 'Ячейка: ' + cellLabel(state.cell);
    paintStats(list);
  }

  function paintStats(list) {
    const authors = new Set(list.map(b => b.author));
    const genres = new Set(list.flatMap(b => b.genres));
    const read = list.filter(b => b.status === 'read').length;
    const cells = new Set(BOOKS.map(b => b.shelf).filter(Boolean));
    const data = [
      [list.length, 'книг'], [authors.size, 'авторов'], [genres.size, 'жанров'],
      [read, 'прочитано'], [`${cells.size}/${MAP.cols * MAP.rows - (MAP.empty || []).length}`, 'ячеек оцифровано']
    ];
    $('#stats').innerHTML = data.map(([v, l]) =>
      `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
  }

  function buildFacets() {
    const counts = new Map();
    BOOKS.forEach(b => b.genres.forEach(g => counts.set(g, (counts.get(g) || 0) + 1)));
    $('#genres').innerHTML = [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `<button class="chip" data-genre="${esc(g)}" aria-pressed="false">${esc(g)}<span class="n">${n}</span></button>`).join('');

    const langs = [...new Set(BOOKS.map(b => b.language))].sort();
    $('#f-lang').innerHTML = '<option value="">Все языки</option>' +
      langs.map(l => `<option value="${esc(l)}">${esc(LANG_LABEL[l] || l)}</option>`).join('');
  }

  /* ---------- подсказки при наборе ----------
     Корешок обрезает длинные названия, поэтому при вводе показываем
     полное название, автора и место на стеллаже. */

  const suggest = { items: [], active: -1 };

  function renderSuggest() {
    const box = $('#suggest');
    const terms = fold(state.q).split(' ').filter(Boolean);
    if (terms.length === 0 || fold(state.q).length < 2) {
      box.hidden = true; suggest.items = []; suggest.active = -1; return;
    }
    // сначала те, у кого совпало начало названия, потом остальные
    const hit = BOOKS.filter(b => terms.every(t => b._hay.includes(t)));
    const head = fold(state.q);
    hit.sort((a, b) => {
      const ra = fold(a.title).startsWith(head) ? 0 : fold(a.author).startsWith(head) ? 1 : 2;
      const rb = fold(b.title).startsWith(head) ? 0 : fold(b.author).startsWith(head) ? 1 : 2;
      return ra - rb || a.title.localeCompare(b.title, 'ru');
    });
    suggest.items = hit.slice(0, 8);
    suggest.active = -1;
    if (!suggest.items.length) {
      box.innerHTML = `<div class="sg-empty">Ничего не найдено</div>`;
    } else {
      box.innerHTML = suggest.items.map((b, i) => `
        <button class="sg-row" data-id="${b.id}" data-i="${i}">
          <span class="sg-dot" style="${coverVars(b)}"></span>
          <span class="sg-text">
            <span class="sg-title">${esc(b.title)}</span>
            <span class="sg-sub">${esc(b.author)}${b.shelf ? ' · ' + esc(cellLabel(b.shelf)) : ''}</span>
          </span>
        </button>`).join('') +
        (hit.length > 8 ? `<div class="sg-more">и ещё ${hit.length - 8}</div>` : '');
    }
    box.hidden = false;
  }

  function moveSuggest(step) {
    if (!suggest.items.length) return;
    suggest.active = (suggest.active + step + suggest.items.length) % suggest.items.length;
    $('#suggest').querySelectorAll('.sg-row').forEach((r, i) =>
      r.classList.toggle('is-active', i === suggest.active));
  }

  function closeSuggest() { $('#suggest').hidden = true; suggest.active = -1; }

  /* ---------- экспорт ---------- */

  function exportCSV() {
    const cols = ['id', 'title', 'author', 'year', 'publisher', 'language', 'genres',
                  'tags', 'pages', 'isbn', 'series', 'shelf', 'status', 'rating', 'notes'];
    const q = v => `"${String(Array.isArray(v) ? v.join('; ') : (v == null ? '' : v)).replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.join(',')].concat(filtered().map(b => cols.map(c => q(b[c])).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'library.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  /* ---------- события ---------- */

  function wire() {
    $('#q').addEventListener('input', e => { state.q = e.target.value; renderSuggest(); paint(); });
    $('#q').addEventListener('focus', () => { if (state.q) renderSuggest(); });
    $('#q').addEventListener('blur', () => setTimeout(closeSuggest, 140));
    $('#q').addEventListener('keydown', e => {
      if ($('#suggest').hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(-1); }
      else if (e.key === 'Enter' && suggest.active >= 0) {
        e.preventDefault(); openBook(suggest.items[suggest.active].id); closeSuggest();
      } else if (e.key === 'Escape') { closeSuggest(); }
    });
    $('#suggest').addEventListener('mousedown', e => {
      const row = e.target.closest('[data-id]');
      if (row) { e.preventDefault(); openBook(row.dataset.id); closeSuggest(); }
    });

    $('#genres').addEventListener('click', e => {
      const b = e.target.closest('[data-genre]'); if (!b) return;
      const g = b.dataset.genre;
      state.genres.has(g) ? state.genres.delete(g) : state.genres.add(g);
      b.setAttribute('aria-pressed', String(state.genres.has(g)));
      paint();
    });

    $('#f-lang').addEventListener('change', e => { state.lang = e.target.value; paint(); });
    $('#f-status').addEventListener('change', e => { state.status = e.target.value; paint(); });
    $('#f-sort').addEventListener('change', e => { state.sort = e.target.value; paint(); });

    $('#reset').addEventListener('click', () => {
      state.q = ''; state.genres.clear(); state.lang = ''; state.status = ''; state.cell = ''; state.lowOnly = false;
      $('#q').value = ''; $('#f-lang').value = ''; $('#f-status').value = '';
      document.querySelectorAll('[data-genre]').forEach(b => b.setAttribute('aria-pressed', 'false'));
      paint();
    });

    document.querySelector('.segmented').addEventListener('click', e => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      state.view = b.dataset.view; localStorage.setItem('hl.view', state.view); paint();
    });

    $('#library').addEventListener('click', e => {
      const cell = e.target.closest('[data-cell]');
      if (cell) { state.cell = cell.dataset.cell; state.view = 'shelf'; paint(); return; }
      const item = e.target.closest('[data-id]');
      if (item) openBook(item.dataset.id);
    });

    $('#detail').addEventListener('click', e => {
      if (e.target.closest('[data-close]') || e.target.id === 'detail') $('#detail').close();
    });

    $('#fit').addEventListener('click', () => {
      state.fitWall = !state.fitWall;
      localStorage.setItem('hl.fitWall', state.fitWall ? '1' : '0');
      paint();
    });

    $('#verify').addEventListener('click', () => { state.lowOnly = !state.lowOnly; paint(); });

    $('#export').addEventListener('click', exportCSV);

    $('#theme').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('hl.theme', next);
    });

    addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
      if (e.key === 'Escape' && document.activeElement === $('#q')) { $('#q').value = ''; state.q = ''; paint(); }
    });
  }

  /* Тонкий мостик для модуля вишлиста: общие обложки и перерисовка. */
  window.HL = { esc, coverVars, coverHTML, repaint: paint };

  const saved = localStorage.getItem('hl.theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  buildFacets();
  wire();
  paint();

  if (window.Wishlist) window.Wishlist.connect(() => paint());
})();
