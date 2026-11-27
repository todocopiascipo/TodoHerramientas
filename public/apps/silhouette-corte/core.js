// ===== Núcleo: detección de fondo, agrupado de stickers, offset y contornos =====
var Core = (() => {
  const INF = 1e20;

  // Transformada de distancia euclidiana exacta (Felzenszwalb). feat[i]=1 => distancia 0.
  // Devuelve distancias AL CUADRADO (Float32Array).
  function edt(feat, w, h) {
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
    const v = new Int32Array(n);
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = feat[i] ? 0 : INF;
    const pass = (len, get, set) => {
      for (let q = 0; q < len; q++) f[q] = get(q);
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s;
        while (true) {
          const r = v[k];
          s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
          if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        d[q] = (q - r) * (q - r) + f[r];
      }
      for (let q = 0; q < len; q++) set(q, d[q]);
    };
    for (let x = 0; x < w; x++) pass(h, y => out[y * w + x], (y, val) => { out[y * w + x] = val; });
    for (let y = 0; y < h; y++) { const o = y * w; pass(w, x => out[o + x], (x, val) => { out[o + x] = val; }); }
    return out;
  }

  // Igual que edt, pero también devuelve el índice del píxel-figura más cercano.
  function edtIdx(feat, w, h) {
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
    const v = new Int32Array(n), am = new Int32Array(n);
    const N = w * h, out = new Float32Array(N), nearY = new Int32Array(N), idx = new Int32Array(N);
    for (let i = 0; i < N; i++) out[i] = feat[i] ? 0 : INF;
    const pass = (len, get) => {
      for (let q = 0; q < len; q++) f[q] = get(q);
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s;
        while (true) {
          const r = v[k];
          s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
          if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; am[q] = r; }
    };
    for (let x = 0; x < w; x++) { pass(h, y => out[y * w + x]); for (let y = 0; y < h; y++) { out[y * w + x] = d[y]; nearY[y * w + x] = am[y]; } }
    for (let y = 0; y < h; y++) { const o = y * w; pass(w, x => out[o + x]); for (let x = 0; x < w; x++) { out[o + x] = d[x]; idx[o + x] = nearY[o + am[x]] * w + am[x]; } }
    return { d: out, idx };
  }

  // Agrupa componentes hasta quedar exactamente en `target` grupos (enlace simple
  // sobre el grafo de vecinos de Voronoi: siempre une primero las piezas más cercanas).
  function clusterTo(lab, comps, w, h, target) {
    const N = w * h, feat = new Uint8Array(N);
    const ci = new Map(comps.map((c, k) => [c.id, k]));
    for (let i = 0; i < N; i++) if (ci.has(lab[i])) feat[i] = 1;
    const { d, idx } = edtIdx(feat, w, h);
    const own = new Int32Array(N);
    for (let i = 0; i < N; i++) { const k = ci.get(lab[idx[i]]); own[i] = k === undefined ? -1 : k; }
    const edges = new Map();
    const consider = (p, q) => {
      const a = own[p], b = own[q]; if (a === b || a < 0 || b < 0) return;
      const dist = Math.sqrt(d[p]) + Math.sqrt(d[q]) + 1;
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      const e = edges.get(key);
      if (!e || dist < e.dist) edges.set(key, { a, b, dist, p: idx[p], q: idx[q] });
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1) consider(i, i + 1);
      if (y < h - 1) consider(i, i + w);
    }
    const par = comps.map((_, k) => k), find = k => par[k] === k ? k : (par[k] = find(par[k]));
    const bridges = [];
    let groups = comps.length;
    for (const e of [...edges.values()].sort((u, v) => u.dist - v.dist)) {
      if (groups <= target) break;
      const ra = find(e.a), rb = find(e.b); if (ra === rb) continue;
      par[ra] = rb; groups--; bridges.push(e);
    }
    const map = new Map(), members = [], bridgeOf = [];
    comps.forEach((c, k) => { const r = find(k); if (!map.has(r)) { map.set(r, members.length); members.push([]); bridgeOf.push([]); } members[map.get(r)].push(c.id); });
    for (const e of bridges) bridgeOf[map.get(find(e.a))].push([e.p, e.q]);
    return { members, bridgeOf };
  }

  // Dibuja un "puente" grueso entre dos píxeles en una máscara.
  function stampLine(m, w, h, p, q, r) {
    const x0 = p % w, y0 = (p / w) | 0, x1 = q % w, y1 = (q / w) | 0;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const ri = Math.ceil(r), r2 = r * r;
    for (let s = 0; s <= steps; s++) {
      const cx = Math.round(x0 + (x1 - x0) * s / steps), cy = Math.round(y0 + (y1 - y0) * s / steps);
      for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
      }
    }
  }

  // Máscara de fondo: píxeles "casi blancos" o transparentes conectados al borde.
  function backgroundMask(rgba, w, h, tol) {
    const N = w * h, bgLike = new Uint8Array(N), bg = new Uint8Array(N);
    const t2 = tol * tol;
    for (let i = 0; i < N; i++) {
      const a = rgba[i * 4 + 3];
      if (a < 20) { bgLike[i] = 1; continue; }
      const r = 255 - rgba[i * 4], g = 255 - rgba[i * 4 + 1], b = 255 - rgba[i * 4 + 2];
      if (r * r + g * g + b * b < t2) bgLike[i] = 1;
    }
    const stack = new Int32Array(N); let sp = 0;
    const push = i => { if (bgLike[i] && !bg[i]) { bg[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    return bg;
  }

  // Rellena agujeros: todo lo no alcanzable desde el borde por píxeles 0 pasa a 1.
  function fillHoles(m, w, h) {
    const N = w * h, out = new Uint8Array(N), seen = new Uint8Array(N);
    const stack = new Int32Array(N); let sp = 0;
    const push = i => { if (!m[i] && !seen[i]) { seen[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    for (let i = 0; i < N; i++) out[i] = seen[i] ? 0 : 1;
    return out;
  }

  // Componentes conexas (8-vecindad).
  function label(m, w, h) {
    const N = w * h, lab = new Int32Array(N), stack = new Int32Array(N);
    const comps = [];
    let n = 0;
    for (let s = 0; s < N; s++) {
      if (!m[s] || lab[s]) continue;
      n++; let sp = 0; stack[sp++] = s; lab[s] = n;
      let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0;
        area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (m[j] && !lab[j]) { lab[j] = n; stack[sp++] = j; }
          }
        }
      }
      comps.push({ id: n, area, x0, y0, x1, y1 });
    }
    return { lab, comps };
  }

  // Desenfoque de caja separable (repetido 3 veces ≈ gaussiano).
  function boxBlur(src, w, h, r) {
    if (r < 1) return src;
    let a = Float32Array.from(src), b = new Float32Array(w * h);
    const one = (inp, out, horiz) => {
      const L = horiz ? w : h, M = horiz ? h : w, win = 2 * r + 1;
      for (let j = 0; j < M; j++) {
        const idx = k => horiz ? j * w + k : k * w + j;
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += inp[idx(Math.min(L - 1, Math.max(0, k)))];
        for (let k = 0; k < L; k++) {
          out[idx(k)] = acc / win;
          acc += inp[idx(Math.min(L - 1, k + r + 1))] - inp[idx(Math.max(0, k - r))];
        }
      }
    };
    for (let p = 0; p < 3; p++) { one(a, b, true); one(b, a, false); }
    return a;
  }

  // Marching squares sobre campo escalar con interpolación; devuelve lazos cerrados.
  function marching(f, w, h, iso) {
    const key = (x, y, e) => ((y * (w + 1) + x) * 2 + e); // e: 0 = arista horizontal, 1 = vertical
    const pos = new Map(), adj = new Map();
    const vert = (x, y, e) => {
      const k = key(x, y, e);
      if (!pos.has(k)) {
        let a, b, px, py;
        if (e === 0) { a = f[y * w + x]; b = f[y * w + x + 1]; const t = (iso - a) / (b - a); px = x + t; py = y; }
        else { a = f[y * w + x]; b = f[(y + 1) * w + x]; const t = (iso - a) / (b - a); px = x; py = y + t; }
        pos.set(k, [px, py]);
      }
      return k;
    };
    const link = (p, q) => {
      if (!adj.has(p)) adj.set(p, []); if (!adj.has(q)) adj.set(q, []);
      adj.get(p).push(q); adj.get(q).push(p);
    };
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const tl = f[y * w + x] > iso, tr = f[y * w + x + 1] > iso, br = f[(y + 1) * w + x + 1] > iso, bl = f[(y + 1) * w + x] > iso;
      const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const T = () => vert(x, y, 0), B = () => vert(x, y + 1, 0), L = () => vert(x, y, 1), R = () => vert(x + 1, y, 1);
      switch (c) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), R()); break;
        case 3: case 12: link(L(), R()); break;
        case 4: case 11: link(T(), R()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(L(), T()); break;
        case 5: link(L(), T()); link(B(), R()); break;
        case 10: link(T(), R()); link(L(), B()); break;
      }
    }
    const used = new Set(), loops = [];
    for (const start of adj.keys()) {
      if (used.has(start)) continue;
      const loop = []; let prev = -1, cur = start;
      while (cur !== undefined && !used.has(cur)) {
        used.add(cur); loop.push(pos.get(cur));
        const nb = adj.get(cur); const nxt = nb[0] !== prev ? nb[0] : nb[1];
        prev = cur; cur = nxt;
      }
      if (loop.length > 2) loops.push(loop);
    }
    return loops;
  }

  function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return a / 2; }

  // Simplificación Ramer–Douglas–Peucker para polígono cerrado.
  function rdp(pts, eps) {
    if (pts.length < 4) return pts;
    const e2 = eps * eps;
    const seg = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return x * x + y * y;
    };
    const rec = (s, e, out) => {
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) { const d = seg(pts[i], pts[s], pts[e]); if (d > md) { md = d; mi = i; } }
      if (md > e2) { rec(s, mi, out); rec(mi, e, out); } else out.push(pts[s]);
    };
    // partir el lazo en el punto más lejano del inicio
    let far = 0, fd = 0;
    for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1]; const d = dx * dx + dy * dy; if (d > fd) { fd = d; far = i; } }
    const closed = pts.concat([pts[0]]);
    const out = [];
    const tmp = pts; pts = closed;
    rec(0, far, out); rec(far, closed.length - 1, out);
    pts = tmp;
    return out;
  }

  /**
   * Procesa una imagen.
   * opts: { mmPerPx, offsetMm, joinMm, gapMm, tol, smooth (0..1), minPieceMm2 }
   * Devuelve { contours: [[ [x,y],... ], ...] en px de la imagen de trabajo, bg (máscara), count }
   */
  function process(rgba, w, h, o) {
    const pxmm = 1 / o.mmPerPx;
    const off = o.offsetMm * pxmm, join = o.joinMm * pxmm, gap = o.gapMm * pxmm;
    const prog = typeof o.progress === 'function' ? o.progress : () => {};
    prog(0.02, 'Quitando el fondo');
    const bg = backgroundMask(rgba, w, h, o.tol);
    const N = w * h, fg = new Uint8Array(N);
    for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 1;
    prog(0.1, 'Buscando figuras');
    const { lab, comps } = label(fg, w, h);
    if (!comps.length) return { contours: [], bg, count: 0 };
    const maxA = Math.max(...comps.map(c => c.area));
    const minA = o.minPieceMm2 * pxmm * pxmm;
    let members, bridgeOf = [];
    prog(0.15, 'Agrupando adornos');
    if (o.count > 0) {
      // Cantidad indicada: se ignoran solo motitas (< 0,5 mm²) y se agrupa hasta llegar a N.
      const sig = comps.filter(c => c.area >= Math.max(3, 0.5 * pxmm * pxmm));
      const r = clusterTo(lab, sig, w, h, o.count);
      members = r.members; bridgeOf = r.bridgeOf;
    } else {
    const mains = comps.filter(c => c.area >= o.mainFrac * maxA);
    const mainIdx = new Map(mains.map((c, k) => [c.id, k]));
    members = mains.map(c => [c.id]);
    const loose = comps.filter(c => !mainIdx.has(c.id));

    // Asignar decoraciones sueltas al personaje más cercano (si está a menos de 2×unir).
    if (loose.length) {
      const bestD = new Float32Array(loose.length).fill(INF), bestK = new Int32Array(loose.length).fill(-1);
      const looseIdx = new Map(loose.map((c, j) => [c.id, j]));
      mains.forEach((c, k) => {
        const feat = new Uint8Array(N); for (let i = 0; i < N; i++) if (lab[i] === c.id) feat[i] = 1;
        const d = edt(feat, w, h);
        for (let i = 0; i < N; i++) { const j = looseIdx.get(lab[i]); if (j !== undefined && d[i] < bestD[j]) { bestD[j] = d[i]; bestK[j] = k; } }
      });
      const rest = [];
      loose.forEach((c, j) => {
        if (bestK[j] >= 0 && Math.sqrt(bestD[j]) <= 2 * join) members[bestK[j]].push(c.id);
        else rest.push(j);
      });
      // Piezas sueltas cercanas entre sí (ej. letras "Zzz") forman un grupo.
      const par = rest.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
      const lim = 2 * join + 1;
      for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) {
        const A = loose[rest[a]], B = loose[rest[b]];
        const gx = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1)), gy = Math.max(0, Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1));
        if (Math.hypot(gx, gy) <= lim) par[find(a)] = find(b);
      }
      const clusters = new Map();
      rest.forEach((j, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(j); });
      for (const js of clusters.values()) {
        // grupo cerca de un personaje (un poco más de margen): se une a él
        let bj = js[0]; for (const j of js) if (bestD[j] < bestD[bj]) bj = j;
        const area = js.reduce((s, j) => s + loose[j].area, 0);
        if (bestK[bj] >= 0 && Math.sqrt(bestD[bj]) <= 3 * join) js.forEach(j => members[bestK[bj]].push(loose[j].id));
        else if (area >= minA) members.push(js.map(j => loose[j].id));
      }
    }

    }

    // Para cada sticker: cierre morfológico (une partes) y distancia.
    const best = new Float32Array(N).fill(INF), second = new Float32Array(N).fill(INF), owner = new Int32Array(N).fill(-1);
    const idToGroup = new Map(); members.forEach((ids, k) => ids.forEach(id => idToGroup.set(id, k)));
    members.forEach((ids, k) => {
      prog(0.25 + 0.5 * k / members.length, `Separando stickers (${k + 1} de ${members.length})`);
      const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (idToGroup.get(lab[i]) === k) m[i] = 1;
      for (const [pp, qq] of (bridgeOf[k] || [])) stampLine(m, w, h, pp, qq, Math.max(1.5, 1.2 * pxmm));
      let c = m;
      if (join > 0.5) {
        const d1 = edt(m, w, h), dil = new Uint8Array(N), j2 = join * join;
        for (let i = 0; i < N; i++) dil[i] = d1[i] <= j2 ? 1 : 0;
        const filled = fillHoles(dil, w, h), inv = new Uint8Array(N);
        for (let i = 0; i < N; i++) inv[i] = filled[i] ? 0 : 1;
        const d2 = edt(inv, w, h); c = new Uint8Array(N);
        for (let i = 0; i < N; i++) c[i] = (d2[i] > j2 || m[i]) ? 1 : 0;
      }
      const d = edt(c, w, h);
      for (let i = 0; i < N; i++) {
        const v = d[i];
        if (v < best[i]) { second[i] = best[i]; best[i] = v; owner[i] = k; } else if (v < second[i]) second[i] = v;
      }
    });

    // Regiones de corte: dentro del offset, del lado del sticker propio, dejando separación mínima.
    const off2 = off * off, contours = [];
    const smoothR = Math.max(0, Math.round(off * o.smooth * 0.35));
    const pad = Math.ceil(off + smoothR * 3 + 3);
    for (let k = 0; k < members.length; k++) {
      prog(0.75 + 0.25 * k / members.length, 'Trazando líneas de corte');
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let i = 0; i < N; i++) if (owner[i] === k && best[i] === 0) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) continue;
      const bx0 = x0 - pad, by0 = y0 - pad, bw = x1 - x0 + 1 + 2 * pad, bh = y1 - y0 + 1 + 2 * pad;
      const r = new Float32Array(bw * bh);
      for (let yy = 0; yy < bh; yy++) {
        const y = by0 + yy; if (y < 0 || y >= h) continue;
        for (let xx = 0; xx < bw; xx++) {
          const x = bx0 + xx; if (x < 0 || x >= w) continue;
          const i = y * w + x;
          if (owner[i] !== k) continue;
          const db = Math.sqrt(best[i]);
          if (best[i] === 0 || (best[i] <= off2 && Math.sqrt(second[i]) - db > gap)) r[yy * bw + xx] = 1;
        }
      }
      let fld = boxBlur(r, bw, bh, Math.round(smoothR / 1.7));
      const bin = new Uint8Array(bw * bh); for (let i = 0; i < bin.length; i++) bin[i] = fld[i] > 0.5 ? 1 : 0;
      const filled = fillHoles(bin, bw, bh);
      for (let i = 0; i < bin.length; i++) if (filled[i] && !bin[i]) fld[i] = 1;
      // borde a 0 para garantizar lazos cerrados
      for (let x = 0; x < bw; x++) { fld[x] = 0; fld[(bh - 1) * bw + x] = 0; }
      for (let y = 0; y < bh; y++) { fld[y * bw] = 0; fld[y * bw + bw - 1] = 0; }
      const loops = marching(fld, bw, bh, 0.5);
      for (const lp of loops) {
        if (Math.abs(polyArea(lp)) < Math.max(minA, 4)) continue;
        const simp = rdp(lp, 0.35).map(([x, y]) => [x + bx0, y + by0]);
        if (simp.length >= 3) contours.push(simp);
      }
    }
    return { contours, bg, count: contours.length };
  }

  // DXF R12 en mm (o pulgadas). pts en mm, eje Y hacia arriba.
  function toDXF(polys, units) {
    const L = [];
    const p = (c, v) => { L.push(String(c)); L.push(String(v)); };
    p(0, 'SECTION'); p(2, 'HEADER');
    p(9, '$ACADVER'); p(1, 'AC1009');
    p(9, '$INSUNITS'); p(70, units === 'in' ? 1 : 4);
    p(9, '$MEASUREMENT'); p(70, units === 'in' ? 0 : 1);
    p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'TABLES');
    p(0, 'TABLE'); p(2, 'LAYER'); p(70, 1);
    p(0, 'LAYER'); p(2, 'CORTE'); p(70, 0); p(62, 1); p(6, 'CONTINUOUS');
    p(0, 'ENDTAB'); p(0, 'ENDSEC');
    p(0, 'SECTION'); p(2, 'ENTITIES');
    const s = units === 'in' ? 1 / 25.4 : 1;
    for (const poly of polys) {
      p(0, 'POLYLINE'); p(8, 'CORTE'); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, 1);
      for (const [x, y] of poly) { p(0, 'VERTEX'); p(8, 'CORTE'); p(10, (x * s).toFixed(4)); p(20, (y * s).toFixed(4)); p(30, 0); }
      p(0, 'SEQEND'); p(8, 'CORTE');
    }
    p(0, 'ENDSEC'); p(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  return { process, toDXF, backgroundMask, edt };
})();
if (typeof self !== 'undefined') self.Core = Core;
