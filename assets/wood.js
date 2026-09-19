/* Процедурное дерево на canvas.
   SVG-фильтры в styles.css дают текстуру сразу, этот модуль заменяет её
   на более качественную, когда браузер освободится. Ничего не грузится
   извне: шум считается на месте, результат кладётся в CSS-переменные. */
(() => {
  'use strict';
  if (!document.createElement('canvas').getContext) return;

  /* ---------- сид-шум с интерполяцией ---------- */

  function makeNoise(seed) {
    const P = new Uint8Array(512);
    let x = seed >>> 0;
    const rnd = () => (x = (1103515245 * x + 12345) & 0x7fffffff) / 0x7fffffff;
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];

    const fade = t => t * t * (3 - 2 * t);
    const val = (xi, yi) => (P[(P[xi & 255] + (yi & 255)) & 255] / 255) * 2 - 1;

    return function noise(px, py) {
      const xi = Math.floor(px), yi = Math.floor(py);
      const xf = fade(px - xi), yf = fade(py - yi);
      const a = val(xi, yi),     b = val(xi + 1, yi);
      const c = val(xi, yi + 1), d = val(xi + 1, yi + 1);
      return (a + (b - a) * xf) + ((c + (d - c) * xf) - (a + (b - a) * xf)) * yf;
    };
  }

  function fbm(noise, x, y, octaves) {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x, y) * amp; norm += amp;
      amp *= 0.5; x *= 2.03; y *= 2.03;
    }
    return sum / norm;
  }

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- доска ---------- */

  const EARLY = [0x59, 0x3a, 0x1e];   // ранняя древесина, тёплая
  const LATE  = [0x24, 0x16, 0x0a];   // поздняя, узкие тёмные линии
  const PORE  = [0x16, 0x0c, 0x04];   // поры

  function renderBoard(w, h, seed, vertical) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { alpha: false });
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const n1 = makeNoise(seed), n2 = makeNoise(seed + 977), n3 = makeNoise(seed + 5501);

    // вдоль доски кольца тянутся, поперёк - сменяются
    const RINGS = 17;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (vertical ? y : x) / (vertical ? h : w);   // вдоль волокна
        const v = (vertical ? x : y) / (vertical ? w : h);   // поперёк

        // Искажение: длинные плавные волны вдоль доски дают «собор» на срезе.
        const warp = fbm(n1, u * 2.6, v * 1.1, 4) * 1.15
                   + fbm(n2, u * 7.0, v * 2.2, 3) * 0.22;

        const ring = (v * RINGS + warp * 2.4) % 1;
        const r = ring < 0 ? ring + 1 : ring;

        // широкая светлая зона, узкая тёмная в конце кольца
        const late = smooth(0.74, 0.93, r) * (1 - smooth(0.965, 1, r));

        // тонкое волокно вдоль доски
        const fiber = fbm(n3, u * 220, v * 6, 2) * 0.5 + 0.5;
        // поры: редкие короткие штрихи
        const pore  = Math.max(0, fbm(n2, u * 300, v * 90, 2)) ** 3;
        // медленный дрейф тона по доске
        const drift = fbm(n1, u * 1.3, v * 0.7, 2) * 0.16;

        let mix = late * 0.92 + fiber * 0.17 + drift;
        mix = clamp(mix, 0, 1);

        let R = EARLY[0] + (LATE[0] - EARLY[0]) * mix;
        let G = EARLY[1] + (LATE[1] - EARLY[1]) * mix;
        let B = EARLY[2] + (LATE[2] - EARLY[2]) * mix;

        R += (PORE[0] - R) * pore * 0.85;
        G += (PORE[1] - G) * pore * 0.85;
        B += (PORE[2] - B) * pore * 0.85;

        // лак: блик ближе к верхнему краю, затемнение к нижнему
        const sheen = 1 + (0.26 * (1 - v) - 0.20 * v);
        R *= sheen; G *= sheen; B *= sheen;

        const i = (y * w + x) * 4;
        d[i]     = clamp(R, 0, 255);
        d[i + 1] = clamp(G, 0, 255);
        d[i + 2] = clamp(B, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  function paint() {
    try {
      const root = document.documentElement.style;
      root.setProperty('--board-wood', `url("${renderBoard(560, 200, 1337, false)}")`);
      root.setProperty('--post-wood',  `url("${renderBoard(200, 560, 4211, true)}")`);
      document.documentElement.dataset.wood = 'canvas';
    } catch (e) {
      /* остаётся SVG-текстура из styles.css */
    }
  }

  if ('requestIdleCallback' in window) requestIdleCallback(paint, { timeout: 1200 });
  else setTimeout(paint, 60);
})();
