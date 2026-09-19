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

  function coverHTML(b, big) {
    const img = b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy"
        onerror="this.remove()">` : '';
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

  function spineHTML(b) {
    const h = hash(b.id);
    const w = Math.max(22, Math.min(54, Math.round((b.pages || 260) / 11)));
    const tall = 150 + (h % 46);
    return `<button class="spine" data-id="${b.id}" title="${esc(b.title + ' — ' + b.author)}"
      style="${coverVars(b)};width:${w}px;height:${tall}px">
      <span class="s-title">${esc(b.title)}</span><span class="s-mark"></span></button>`;
  }

  /* ---------- виды ---------- */

  function renderWall(list) {
    const box = el('div', 'wall');
    box.style.setProperty('--cols', MAP.cols);
    const byCell = new Map();
    list.forEach(b => { if (!byCell.has(b.shelf)) byCell.set(b.shelf, []); byCell.get(b.shelf).push(b); });
    for (let r = 1; r <= MAP.rows; r++) {
      for (let c = 1; c <= MAP.cols; c++) {
        const id = `${c}-${r}`;
        const books = byCell.get(id) || [];
        const isEmpty = (MAP.empty || []).includes(id);
        const cell = el('button', 'wall-cell' + (books.length ? '' : ' is-blank'));
        cell.dataset.cell = id;
        cell.disabled = !books.length;
        cell.innerHTML = `
          <div class="wc-bar">${books.slice(0, 26).map(b =>
            `<i style="${coverVars(b)};height:${58 + hash(b.id) % 26}%"></i>`).join('')}</div>
          <div class="wc-foot"><span class="wc-id">${c}-${r}</span>
            <span class="wc-n">${books.length ? books.length + ' ' + plural(books.length, 'книга', 'книги', 'книг')
              : isEmpty ? 'декор' : 'не оцифровано'}</span></div>`;
        box.append(cell);
      }
    }
    return box;
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

    if (!BOOKS.length) {
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

    $('#found').textContent = `${list.length} из ${BOOKS.length}`;
    document.querySelectorAll('.segmented [data-view]').forEach(btn =>
      btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view)));
    const lowN = BOOKS.filter(b => b.confidence === 'low').length;
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
    $('#q').addEventListener('input', e => { state.q = e.target.value; paint(); });

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

  const saved = localStorage.getItem('hl.theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  buildFacets();
  wire();
  paint();
})();
