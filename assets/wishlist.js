/* Вишлист: книги, которые хочется купить.

   Хранилище выбирается по обстановке. На артефакте доступна общая база
   claude.use("db") - записи синхронизируются между устройствами и их
   видит Claude. На статическом хостинге такой базы нет, поэтому список
   живёт в localStorage этого браузера. Страница честно говорит, какой
   режим сейчас работает. */
(() => {
  'use strict';

  const LS_KEY = 'hl.wishlist';
  const COL = 'wishlist';

  const store = {
    mode: 'local',      // 'db' | 'local'
    db: null,
    unsub: null,
    items: [],

    readLocal() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
      catch { return []; }
    },
    writeLocal(items) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
    },

    /* Подключение к базе идёт в фоне: страница рисуется сразу, а когда
       (и если) база ответит, список перечитывается из неё. */
    async connect(onChange) {
      this.items = this.readLocal();
      onChange();
      let db = null;
      try { db = await window.claude?.use?.('db'); } catch {}
      if (!db) return;
      this.db = db; this.mode = 'db';
      // первый перенос: если в базе пусто, а в браузере что-то есть
      try {
        const snap = await db.collection(COL).get();
        if (snap.empty && this.items.length) {
          for (const it of this.items) await db.collection(COL).doc(it.id).set(strip(it));
        }
      } catch {}
      this.unsub = db.collection(COL).orderBy('addedAt', 'desc').onSnapshot(
        snap => {
          this.items = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
          onChange();
        },
        () => { this.mode = 'local'; this.items = this.readLocal(); onChange(); }
      );
      onChange();
    },

    async add(item) {
      if (this.mode === 'db') {
        await this.db.collection(COL).doc(item.id).set(strip(item));
      } else {
        this.items = [item, ...this.items];
        this.writeLocal(this.items);
      }
    },
    async remove(id) {
      if (this.mode === 'db') {
        await this.db.collection(COL).doc(id).delete();
      } else {
        this.items = this.items.filter(x => x.id !== id);
        this.writeLocal(this.items);
      }
    },
    async patch(id, fields) {
      if (this.mode === 'db') {
        await this.db.collection(COL).doc(id).update(fields);
      } else {
        this.items = this.items.map(x => x.id === id ? Object.assign({}, x, fields) : x);
        this.writeLocal(this.items);
      }
    },
  };

  const strip = it => { const { id, ...rest } = it; return rest; };
  const esc = s => window.HL.esc(s);
  const coverVars = b => window.HL.coverVars(b);

  const PRIORITY = { soon: 'Скоро', later: 'Потом', someday: 'Когда-нибудь' };

  function itemHTML(it) {
    const fake = { id: it.id, title: it.title, author: it.author || '' };
    return `<article class="wish-card">
      <div class="wish-cover">${window.HL.coverHTML(fake)}</div>
      <div class="wish-body">
        <h3>${esc(it.title)}</h3>
        <div class="wish-author">${esc(it.author || 'Автор не указан')}</div>
        ${it.note ? `<p class="wish-note">${esc(it.note)}</p>` : ''}
        <div class="wish-meta">
          <span class="wish-pri wish-pri-${esc(it.priority || 'later')}">${esc(PRIORITY[it.priority] || PRIORITY.later)}</span>
          <span class="wish-date">${esc(it.addedAt || '')}</span>
        </div>
      </div>
      <div class="wish-acts">
        <button class="icon-btn" data-act="bought" data-id="${esc(it.id)}"
          title="Книга куплена, убрать из списка">Куплено</button>
        <button class="icon-btn" data-act="drop" data-id="${esc(it.id)}"
          title="Удалить из списка">Убрать</button>
      </div>
    </article>`;
  }

  function render(host) {
    const n = store.items.length;
    const badge = store.mode === 'db'
      ? 'Список синхронизируется между устройствами'
      : 'Список хранится только в этом браузере';

    host.innerHTML = `
      <section class="wish">
        <form class="wish-form" id="wish-form" autocomplete="off">
          <div class="wish-fields">
            <label class="wish-field wish-grow">
              <span>Название</span>
              <input id="w-title" required maxlength="200" placeholder="Что хочется купить">
            </label>
            <label class="wish-field wish-grow">
              <span>Автор</span>
              <input id="w-author" maxlength="160" placeholder="Необязательно">
            </label>
            <label class="wish-field">
              <span>Когда</span>
              <select id="w-pri">
                <option value="soon">Скоро</option>
                <option value="later" selected>Потом</option>
                <option value="someday">Когда-нибудь</option>
              </select>
            </label>
          </div>
          <label class="wish-field">
            <span>Заметка</span>
            <input id="w-note" maxlength="300" placeholder="Кто посоветовал, где видел, почему хочется">
          </label>
          <div class="wish-submit">
            <button class="wish-add" type="submit">Добавить в вишлист</button>
            <span class="wish-hint">${esc(badge)}</span>
          </div>
        </form>

        ${n ? `<div class="wish-list">${store.items.map(itemHTML).join('')}</div>`
            : `<div class="empty"><div class="big">Вишлист пуст</div>
                 Добавь книгу сверху, и она появится здесь.</div>`}
      </section>`;

    const form = host.querySelector('#wish-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = host.querySelector('#w-title').value.trim();
      if (!title) return;
      const item = {
        id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title,
        author: host.querySelector('#w-author').value.trim(),
        note: host.querySelector('#w-note').value.trim(),
        priority: host.querySelector('#w-pri').value,
        addedAt: new Date().toISOString().slice(0, 10),
      };
      await store.add(item);
      form.reset();
      host.querySelector('#w-pri').value = item.priority;
      host.querySelector('#w-title').focus();
      window.HL.repaint();
    });

    host.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const it = store.items.find(x => x.id === b.dataset.id);
      if (b.dataset.act === 'drop' || b.dataset.act === 'bought') {
        if (b.dataset.act === 'bought' && it &&
            !confirm(`Убрать «${it.title}» из вишлиста?\n\nВ каталог книга не попадёт: её место на стеллаже пока неизвестно.`)) return;
        await store.remove(b.dataset.id);
        window.HL.repaint();
      }
    });
  }

  window.Wishlist = {
    render,
    count: () => store.items.length,
    connect: onChange => store.connect(onChange),
  };
})();
