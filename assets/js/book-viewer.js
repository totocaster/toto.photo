// The book viewer for one book, full window (layouts/_default/book-viewer.html).
// Everything book-specific comes from #book-data. The book is drawn in 3D with three.js
// (static/js/vendor/three-r158.min.js); without WebGL the same viewer shows the pages flat.
// Positions: 0 is the cover, 1 … N the openings, N + 1 the back cover. With pairing
// "first-alone" page 1 stands alone on the right, then 2–3, 4–5 …, the last page alone on the left.
(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('book-data').textContent);
  const $ = (sel, el = document) => el.querySelector(sel);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(hover: none) and (pointer: coarse)');

  // The openings, from the page list.
  const P = data.pages;
  const page = (n) => P[n - 1];
  const openings = [];
  const first = data.pairing === 'first-alone' ? 2 : 1;
  if (first === 2) openings.push([null, 1]);
  for (let n = first; n <= P.length; n += 2) openings.push([n, n + 1 <= P.length ? n + 1 : null]);
  const N = openings.length;
  const labelOf = (v) => {
    if (v <= 0) return 'Cover';
    if (v >= N + 1) return 'Back cover';
    const [l, r] = openings[v - 1];
    return l && r ? 'Pages ' + l + '–' + r : 'Page ' + (l || r);
  };
  const ariaOf = (v) => (v <= 0 ? 'Front cover' : labelOf(v));

  // The book, in the shape the 3D scene expects (inches / 10; t is the closed thickness).
  const book = {
    title: data.title, byline: data.byline, binding: 'hard', jacket: false,
    cloth: '#F3EFE4', w: data.trimMm[0] / 254, h: data.trimMm[1] / 254, t: data.depth * data.trimMm[0] / 254, pages: P.length,
    cover: null, insert: data.insert.src, insertW: data.insert.widthRatio, insertTop: 0.45, insertPxW: data.insert.width, insertPxH: data.insert.height,
    back: null, backCloth: true, spine: '#F3EFE4', ink: '#A47D2D', gilt: true, spineTitle: data.title.toUpperCase(), spineSub: data.spineSub,
    spreads: openings.map(([l, r], i) => ({ id: { L: l ? page(l).src : null, R: r ? page(r).src : null }, label: labelOf(i + 1) }))
  };

  // A clock's figures fade through: each position (from the right) keeps its last figure; a changed one
  // gets a fresh pair of spans, the old figure fading out and the new one in, 100 ms each.
  const fadeClock = (el) => {
    let last = '';
    return (text) => {
      if (text === last) return;
      const now = text.split('').reverse(), was = last.split('').reverse();
      el.setAttribute('aria-label', text);
      while (el.children.length < now.length) el.prepend(Object.assign(document.createElement('span'), { className: 'fd-c' }));
      while (el.children.length > now.length) el.firstElementChild.remove();
      const cells = [...el.children].reverse();
      now.forEach((ch, i) => {
        if (was[i] === ch) return;
        const cell = cells[i];
        cell.replaceChildren(Object.assign(document.createElement('span'), { className: 'fd-in', textContent: ch }));
        if (was[i] !== undefined && !reduce.matches) cell.append(Object.assign(document.createElement('span'), { className: 'fd-out', textContent: was[i] }));
      });
      last = text;
    };
  };
  const clockText = (ms) => {
    const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const two = (x) => String(x).padStart(2, '0');
    return h ? h + ':' + two(m) + ':' + two(s) : m + ':' + two(s);
  };

  class Viewer {
    constructor(root) {
      this.root = root;
      this.cv = $('canvas', root);
      this.state = { book: 0 };
      this.view = 0;
      this.spine = false;
      this.born = Date.now();
      this.entered = Date.now();
      this.ms = new Array(N + 2).fill(0);
      this.el = {
        stage: $('.v-stage', root), hint: $('.v-hint', root), open: $('.v-open', root), openText: $('.v-open .v-u', root),
        label: $('.v-label', root), range: $('.v-range', root), map: $('.v-map', root), prev: $('.v-arrow.prev', root), next: $('.v-arrow.next', root),
        pages: $('[data-tool="pages"]', root), spineBtn: $('[data-tool="spine"]', root), full: $('.v-full', root),
        veil: $('.v-veil', root), sheet: $('.cs', root), flat: $('.v-flat', root)
      };
      this.tick = fadeClock($('.v-clock .fd', root));
      this.cells = Array.from({ length: N + 2 }, () => this.el.map.appendChild(document.createElement('span')));
      this.el.map.style.gridTemplateColumns = 'repeat(' + (N + 2) + ', minmax(0, 1fr))';
      this.el.range.max = String(N + 1);
      this.buildSheet();
      this.wire();
      setInterval(() => this.clock(), 1000);
      this.clock();
      const T = window.THREE;
      let ok = false;
      if (T && this.cv) { try { this.initThree(T); ok = true; } catch (e) { console.error(e); } }
      if (!ok) this.flatMode();
      this.report(0);
    }
    books() { return [book]; }
    setState(o) { if (o && 'spine' in o) { this.spine = !!o.spine; this.paint(); } }

    // Where the book is now: label, slider, caption, arrows, time boxes; fetch the neighbours ahead.
    report(view) {
      const now = Date.now();
      this.ms[this.view] += now - this.entered;
      this.entered = now;
      this.view = view;
      this.paint();
      [view - 1, view + 1, view + 2].forEach((v) => {
        const o = book.spreads[v - 1];
        if (o) [o.id.L, o.id.R].forEach((u) => { if (u && !this.seen?.has(u)) { (this.seen ||= new Set()).add(u); const i = new Image(); i.crossOrigin = 'anonymous'; i.src = u; } });
      });
      if (this.flat) this.flatShow();
      try { history.replaceState(null, '', view ? '#page=' + view : location.pathname + location.search); } catch (e) { /* framed where the address can't change */ }
    }
    paint() {
      const v = this.view, atCover = v === 0, atBack = v === N + 1;
      this.el.label.textContent = labelOf(v);
      this.el.range.value = String(v);
      this.el.range.setAttribute('aria-valuetext', ariaOf(v));
      this.el.hint.textContent = atCover ? data.hint : atBack ? 'Thank you for spending time here.'
        : touch.matches ? 'Tap either page, or swipe.' : 'Click either page, or use the arrow keys.';
      this.el.open.hidden = !(atCover || atBack);
      this.el.openText.textContent = atBack ? 'Return to the beginning' : 'Open the book';
      this.el.prev.setAttribute('aria-disabled', String(atCover));
      this.el.next.setAttribute('aria-disabled', String(atBack));
      this.el.spineBtn.setAttribute('aria-pressed', String(this.spine && atCover));
      this.el.spineBtn.setAttribute('aria-label', this.spine && atCover ? 'View front cover' : 'View spine');
      this.root.setAttribute('aria-label', data.title + ', ' + ariaOf(v) + '. Use the left and right arrow keys to turn the pages.');
      this.boxes();
      [...this.el.sheet.children].forEach((b, i) => { b.setAttribute('aria-current', String(i === v)); b.classList.toggle('here', i === v); });
    }
    boxes() {
      const live = this.ms.slice(); live[this.view] += Date.now() - this.entered;
      const mx = Math.max(...live);
      this.cells.forEach((c, i) => {
        const t = live[i];
        c.style.background = t > 1500 && mx > 0 ? 'rgba(28,28,27,' + (Math.round((0.12 + 0.88 * (t / mx)) * 100) / 100) + ')' : 'transparent';
        c.classList.toggle('on', i === this.view);
      });
    }
    clock() { this.tick(clockText(Date.now() - this.born)); this.boxes(); }

    step(d) { if (this.g) this.g.step(d); else this.flatGo(this.view + d); }
    jump(v) { if (this.g) this.g.jump(v); else this.flatGo(v); }
    toggleSpine() { this.spine = !this.spine; if (this.g) this.g.setSpine(this.spine); this.paint(); }
    openPages(on) {
      this.el.veil.hidden = !on;
      if (on) { const here = this.el.sheet.children[this.view]; (here || this.el.sheet.firstElementChild).focus({ preventScroll: true }); here?.scrollIntoView({ block: 'center' }); }
      else this.root.focus({ preventScroll: true });
    }
    fullscreen() {
      try { if (document.fullscreenElement) document.exitFullscreen(); else this.root.requestFullscreen?.().catch(() => {}); } catch (e) { /* not available */ }
    }

    // Every opening at once: the contact sheet (no frames; a spread comes forward when pointed at).
    buildSheet() {
      const thumb = (n) => (n ? page(n).thumb : null);
      const add = (v, html) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cs-item'; b.setAttribute('aria-label', ariaOf(v));
        b.innerHTML = '<span class="cs-slot">' + html + '</span><span class="cs-lab"><span class="cs-dot" aria-hidden="true"></span>' + labelOf(v) + '</span>';
        b.addEventListener('click', () => { this.openPages(false); this.jump(v); });
        this.el.sheet.appendChild(b);
      };
      const ratio = data.trimMm[0] / data.trimMm[1];
      // Each thumbnail keeps the book's proportions (--ar); the stylesheet sizes it to fit its column.
      add(0, '<span class="cs-sp cs-cloth" style="--ar:' + ratio.toFixed(4) + '"><img src="' + data.insert.thumb + '" alt="" loading="lazy" style="width:' + (data.insert.widthRatio * 100).toFixed(2) + '%"></span>');
      openings.forEach(([l, r], i) => {
        const half = (n) => (n ? '<img src="' + thumb(n) + '" alt="" loading="lazy">' : '<span class="cs-blank"></span>');
        add(i + 1, '<span class="cs-sp cs-two" style="--ar:' + (2 * ratio).toFixed(4) + '">' + half(l) + half(r) + '<span class="cs-gut"></span></span>');
      });
      add(N + 1, '<span class="cs-sp cs-cloth" style="--ar:' + ratio.toFixed(4) + '"></span>');
    }

    // Without WebGL: the same viewer, the pages flat.
    flatMode() {
      this.flat = true;
      this.cv.hidden = true;
      this.el.flat.hidden = false;
      this.el.spineBtn.hidden = true;
      this.el.flat.addEventListener('click', (e) => { const r = this.el.flat.getBoundingClientRect(); this.flatGo(this.view + (this.view === 0 || e.clientX > r.left + r.width / 2 ? 1 : -1)); });
    }
    flatGo(v) { v = Math.max(0, Math.min(N + 1, v)); if (v !== this.view) this.report(v); }
    flatShow() {
      const v = this.view, f = this.el.flat;
      const img = (n) => (n ? '<img src="' + page(n).src + '" alt="' + (page(n).alt || '').replace(/"/g, '&quot;') + '" crossorigin="anonymous">' : '<span class="v-paper"></span>');
      if (v === 0) f.innerHTML = '<span class="v-cover"><img src="' + data.insert.src + '" alt="' + data.insert.alt.replace(/"/g, '&quot;') + '"></span>';
      else if (v === N + 1) f.innerHTML = '<span class="v-cover"></span>';
      else { const [l, r] = openings[v - 1]; f.innerHTML = '<span class="v-spread">' + img(l) + img(r) + '<span class="cs-gut"></span></span>'; }
    }

    wire() {
      const r = this.root, e = this.el, cv = this.cv;
      e.prev.addEventListener('click', () => this.step(-1));
      e.next.addEventListener('click', () => this.step(1));
      // The button hides itself once the book opens; the book keeps the focus so the keys go on turning.
      e.open.addEventListener('click', () => { if (this.view === 0) this.step(1); else this.jump(0); r.focus({ preventScroll: true }); });
      e.range.addEventListener('input', () => this.jump(Number(e.range.value)));
      e.pages.addEventListener('click', () => this.openPages(true));
      $('.v-x', r).addEventListener('click', () => this.openPages(false));
      e.spineBtn.addEventListener('click', () => this.toggleSpine());
      e.full.addEventListener('click', () => this.fullscreen());
      r.addEventListener('focus', () => { if (this.g) this.g.hover = true; });
      // Keys turn the pages while the book has the focus, or nothing does and the book fills most of the window.
      document.addEventListener('keydown', (ev) => {
        if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const t = ev.target;
        if (!r.contains(t) && !(t === document.body && r.getBoundingClientRect().bottom > innerHeight / 2)) return;
        if (t.closest && t.closest('input, .v-veil') && ev.key !== 'Escape') return;
        if (!e.veil.hidden) { if (ev.key === 'Escape') { ev.preventDefault(); this.openPages(false); } return; }
        const k = ev.key;
        if (k === 'ArrowRight' || k === 'PageDown') { ev.preventDefault(); this.step(1); }
        else if (k === 'ArrowLeft' || k === 'PageUp') { ev.preventDefault(); this.step(-1); }
        else if (k === ' ' && ev.target === r) { ev.preventDefault(); this.step(ev.shiftKey ? -1 : 1); }
        else if (k === 'Home') { ev.preventDefault(); this.jump(0); }
        else if (k === 'End') { ev.preventDefault(); this.jump(N + 1); }
        else if (k === 'f' || k === 'F') { ev.preventDefault(); this.fullscreen(); }
        else if (k === 'Escape') {
          if (this.spine) this.toggleSpine();
        }
      });
      // Pointer on the book: a corner grab turns the page under the finger; otherwise point to settle,
      // click a page to turn, swipe to turn.
      cv.addEventListener('pointermove', (ev) => {
        const g = this.g; if (!g) return;
        if (g.grabbing) { g.grabMove(ev); return; }
        if (g.grabHover) g.grabHover(ev);
        const p = g.pick(ev);
        g.hover = true; g.ptr = { x: p.x, y: p.y };
      });
      cv.addEventListener('pointerleave', () => { const g = this.g; if (g) g.ptr = { x: 0, y: 0 }; });
      cv.addEventListener('pointerdown', (ev) => {
        const g = this.g; if (!g) return;
        if (g.grabStart && g.grabStart(ev)) { try { cv.setPointerCapture(ev.pointerId); } catch (x) { /* fine */ } return; }
        g.down = { x: ev.clientX, y: ev.clientY };
      });
      cv.addEventListener('pointercancel', (ev) => { const g = this.g; if (g && g.grabbing) g.grabEnd(ev, true); if (g) g.down = null; });
      cv.addEventListener('pointerup', (ev) => {
        const g = this.g; if (!g) return;
        if (g.grabbing) { g.grabEnd(ev, false); return; }
        if (!g.down) return;
        const dx = ev.clientX - g.down.x, dy = ev.clientY - g.down.y;
        g.down = null;
        if (Math.abs(dx) > 40) { g.step(dx < 0 ? 1 : -1); return; }
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { const p = g.pick(ev); g.step(g.view === 0 ? 1 : (p.right ? 1 : -1)); }
      });
      touch.addEventListener?.('change', () => this.paint());
      document.addEventListener('fullscreenchange', () => e.full.setAttribute('aria-label', document.fullscreenElement ? 'Leave full screen' : 'Enter full screen'));
    }

    // ===== 3D SCENE (from the standards board 10b; spreads are pairs of page images here) =====
    initThree(T) {
      const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      let disposed = false, drawFrame = null;
      this.raf = null;
      const invalidate = () => {
        if (!disposed && drawFrame && !this.raf) this.raf = requestAnimationFrame(drawFrame);
      };
      const renderer = new T.WebGLRenderer({ canvas: this.cv, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(22, 2, 0.05, 100);
      scene.add(new T.HemisphereLight(0xffffff, 0xffffff, Math.PI * 0.84));
      const sun = new T.DirectionalLight(0xffffff, Math.PI * 0.20);
      sun.position.set(-1.0, 6, -1.4);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.bias = -0.00008;
      sun.shadow.normalBias = 0.001;
      const sc = sun.shadow.camera;
      sc.left = -2.4; sc.right = 2.4; sc.top = 2.4; sc.bottom = -2.4; sc.near = 0.5; sc.far = 12;
      scene.add(sun);
      // No table: only a transparent, nine-slice drop shadow below the book.
      // The directional light still casts the moving leaf's shadow onto the pages.
      const shadowRoot = new T.Group(); scene.add(shadowRoot);

      const loader = new T.TextureLoader();
      const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const cache = {}, parts = {}, inserts = {};
      const blankCanvas = () => { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 2, 2); return c; };
      const base = (id) => {
        if (!cache[id]) {
          const t = loader.load(id, () => { t.userData.clones.forEach((c) => { c.needsUpdate = true; }); invalidate(); }, undefined, () => {
            const blank = blankCanvas();
            t.image = blank; t.needsUpdate = true;
            t.userData.clones.forEach((c) => { c.image = blank; c.needsUpdate = true; }); invalidate();
          });
          t.colorSpace = T.SRGBColorSpace; t.anisotropy = maxAniso; t.userData.clones = [];
          cache[id] = t;
        }
        return cache[id];
      };
      // On the site a spread is two page images: { L: url, R: url }; a missing side is plain paper.
      // A string is one image (a cover): 'full' uses all of it, 'L'/'R' its halves.
      const part = (id, side, mirror) => {
        if (!id) return null;
        if (typeof id === 'object') { id = side === 'full' ? (id.R || id.L) : id[side]; if (!id) return null; side = 'full'; }
        const key = id + side + (mirror ? 'm' : '');
        if (parts[key]) return parts[key];
        const b = base(id);
        const c = b.clone();
        c.userData = {};
        if (side === 'full') { c.repeat.set(mirror ? -1 : 1, 1); c.offset.set(mirror ? 1 : 0, 0); }
        else { c.repeat.set(mirror ? -0.5 : 0.5, 1); c.offset.set(side === 'L' ? (mirror ? 0.5 : 0) : (mirror ? 1 : 0.5), 0); }
        b.userData.clones.push(c);
        if (b.image && b.image.complete && b.image.naturalWidth) c.needsUpdate = true;
        parts[key] = c;
        return c;
      };
      // The cover insert, a photograph laid on the cloth.
      const insertTexture = (url) => {
        if (!url) return null;
        if (!inserts[url]) {
          const t = loader.load(url, invalidate, undefined, () => {
            if (disposed) return;
            t.image = blankCanvas(); t.needsUpdate = true; invalidate();
          });
          t.colorSpace = T.SRGBColorSpace; t.anisotropy = maxAniso; inserts[url] = t;
        }
        return inserts[url];
      };
      const paper = 0xFFFFFF;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const mix = (a, b, p) => a + (b - a) * p;
      const smooth = (v) => { const p = clamp(v, 0, 1); return p * p * (3 - 2 * p); };
      // Solve cubic-bezier(.3,0,.2,1); geometry and centring share the same clock.
      const ease = (p) => {
        p = clamp(p, 0, 1);
        let a = 0, b = 1, t = p;
        for (let i = 0; i < 12; i++) {
          const x = 0.9 * t - 1.2 * t * t + 1.3 * t * t * t;
          if (Math.abs(x - p) < 0.00001) break;
          if (x < p) a = t; else b = t;
          const next = t - (x - p) / (0.9 - 2.4 * t + 3.9 * t * t);
          t = next > a && next < b ? next : (a + b) / 2;
        }
        return smooth(t);
      };
      const std = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
      const setMap = (m, t, fallback) => {
        if (m.map !== t) { m.map = t; m.needsUpdate = true; }
        m.color.set(t ? 0xffffff : (fallback == null ? paper : fallback));
      };
      const canvasTexture = (w, h, paint, color) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        paint(c.getContext('2d'), w, h);
        const t = new T.CanvasTexture(c);
        if (color) t.colorSpace = T.SRGBColorSpace;
        t.anisotropy = maxAniso;
        return t;
      };
      // Fine, deterministic horizontal sheet lines. UV height is measured in scene units.
      const edgeTex = canvasTexture(64, 128, (x, w, h) => {
        x.fillStyle = '#F7F6F2'; x.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 8) {
          x.fillStyle = y % 24 ? 'rgba(125,119,108,0.13)' : 'rgba(125,119,108,0.21)';
          x.fillRect(0, y, w, 1);
          x.fillStyle = 'rgba(255,255,255,0.65)'; x.fillRect(0, y + 1, w, 1);
        }
      }, true);
      edgeTex.wrapS = edgeTex.wrapT = T.RepeatWrapping;
      const weave = canvasTexture(64, 64, (x, w, h) => {
        x.fillStyle = '#888888'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 64; i += 4) {
          x.fillStyle = '#999999'; x.fillRect(i, 0, 1, h);
          x.fillStyle = '#757575'; x.fillRect(0, i, w, 1);
          for (let j = 0; j < 64; j += 8) {
            x.fillStyle = '#aaaaaa'; x.fillRect(i, j + (i % 8), 2, 1);
          }
        }
      }, false);
      weave.wrapS = weave.wrapT = T.RepeatWrapping;
      weave.repeat.set(64, 64);
      // Cloth is a color texture as well as a very shallow bump: three CSS pixels per thread.
      const paintCloth = (x, w, h, color, hinge, alongSpine) => {
        x.fillStyle = color; x.fillRect(0, 0, w, h);
        const pitch = (alongSpine ? w : h) * 3 / 509;
        const diagonal = Math.hypot(w, h);
        [[24, 'rgba(255,255,255,0.14)'], [114, 'rgba(147,133,106,0.04)']].forEach((line) => {
          x.save(); x.translate(w/2,h/2); x.rotate(line[0]*Math.PI/180);
          x.fillStyle=line[1];
          for(let i=-diagonal;i<diagonal;i+=pitch) x.fillRect(i,-diagonal,pitch/3,2*diagonal);
          x.restore();
        });
        if (hinge) {
          const gradient=x.createLinearGradient(w*0.02,0,w*0.04,0);
          gradient.addColorStop(0,'#8d816411'); gradient.addColorStop(0.48,'#ffffff55'); gradient.addColorStop(1,'#ffffff00');
          x.fillStyle=gradient; x.fillRect(w*0.02,0,w*0.02,h);
        }
      };
      const spineTex = (b) => canvasTexture(2048, Math.max(64, Math.round(2048*b.t/b.h)), (x,w,h) => {
        if(b.cloth&&!b.jacket) paintCloth(x,w,h,b.spine||b.cloth,false,true);
        else {x.fillStyle=b.spine||'#E8E2D2';x.fillRect(0,0,w,h);}
        x.textBaseline='middle';
        if(b.gilt) {
          const gold=x.createLinearGradient(0,0,w*0.07,h);
          ['#856019','#d0af5a','#997125','#e0c982','#967022','#b89746'].forEach((color,i)=>gold.addColorStop([0,.22,.46,.64,.83,1][i],color));
          x.fillStyle=gold;
        } else x.fillStyle=b.ink||'#292925';
        // The texture's long axis runs from head to tail: vertical text on the actual spine.
        const lettering=(text,size,atFoot)=>{
          text=String(text||'');x.font=(b.gilt?'400 ':'500 ')+size+'px Georgia, "Times New Roman", serif';
          const gap=size*0.14, widths=Array.from(text,(c)=>x.measureText(c).width);
          const total=widths.reduce((a,b)=>a+b,0)+Math.max(0,text.length-1)*gap;
          const scale=Math.min(1,w*(atFoot?0.40:0.55)/Math.max(1,total));
          let at=atFoot?w*0.95-total*scale:w*0.05;
          x.save();x.translate(at,h*0.51);x.scale(scale,1);
          at=0;Array.from(text).forEach((c,i)=>{x.fillText(c,at,0);at+=widths[i]+gap;});x.restore();
        };
        lettering(b.spineTitle,Math.min(w*0.023,h*0.55),false);
        lettering(b.spineSub,Math.min(w*0.0185,h*0.45),true);
      },true);
      // Nine-slicing keeps the blur in screen pixels while the footprint changes during a turn.
      const softShadow = canvasTexture(128,128,(x,w,h)=>{
        const pixels=x.createImageData(w,h);
        for(let y=0;y<h;y++) for(let xx=0;xx<w;xx++) {
          const dx=Math.max(0,Math.abs((xx+0.5)/w-0.5)-0.25)/0.0625;
          const dy=Math.max(0,Math.abs((y+0.5)/h-0.5)-0.25)/0.0625;
          const i=(y*w+xx)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
          pixels.data[i+3]=Math.round(255*Math.exp(-(dx*dx+dy*dy)/2));
        }
        x.putImageData(pixels,0,0);
      },true);
      const foldShade = canvasTexture(128,2,(x,w,h)=>{
        const pixels=x.createImageData(w,h);
        for(let j=0;j<h;j++) for(let i=0;i<w;i++){
          const k=(j*w+i)*4,d=(i/(w-1)-0.5)*7;
          pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=255;
          pixels.data[k+3]=(i===0||i===w-1)?0:Math.round(255*Math.exp(-d*d));
        }
        x.putImageData(pixels,0,0);
      },true);
      const gutter = (u, side) => {
        // Slightly stronger than the site's CSS, with an especially narrow right-hand fold.
        const stops=side<0?[[0,.15],[.005,.11],[.07,.018],[.15,0]]:[[0,.135],[.02,.032],[.10,0]];
        let alpha=0;
        for(let i=1;i<stops.length;i++) if(u<=stops[i][0]) {
          alpha=mix(stops[i-1][1],stops[i][1],(u-stops[i-1][0])/(stops[i][0]-stops[i-1][0]));break;
        }
        // Vertex colors are linear; convert the CSS-like black overlay to linear reflectance.
        return Math.pow(1-alpha,2.2);
      };

      const holder = new T.Group(), slide = new T.Group();
      scene.add(holder); holder.add(slide);
      const g = { T, renderer, scene, camera, reduce, holder, slide, b: null, bi: 0, view: 0, anim: null, grabbing: false,
        ver: 'G', closer: false, closerFollow: false, spine: false, hover: false, ptr: { x: 0, y: 0 }, down: null, cam: null };
      this.g = g;
      let hovered=false;
      const pointer={x:0,y:0};
      Object.defineProperty(g,'hover',{enumerable:true,get:()=>hovered,set:(v)=>{
        v=!!v;if(v!==hovered){hovered=v;invalidate();}
      }});
      Object.defineProperty(g,'ptr',{enumerable:true,get:()=>pointer,set:(v)=>{
        pointer.x=clamp(Number(v&&v.x)||0,-1,1);pointer.y=clamp(Number(v&&v.y)||0,-1,1);invalidate();
      }});
      const B = this.books();
      const frac = (v) => { const n = g.b.spreads.length; return Math.min(1, Math.max(0, v / (n + 1))); };
      const thick = (v) => ({ l: Math.max(0.003, g.b.t * frac(v)), r: Math.max(0.003, g.b.t * (1 - frac(v))) });
      const half = (s, side, mirror) => (g.b.spreads[s] ? part(g.b.spreads[s].id, side, mirror) : null);
      let model = null;
      let geometries = [], materials = [], bookTextures = [];
      const ownGeo = (geo) => { geometries.push(geo); return geo; };
      const mat = (o) => { const m = std(o); materials.push(m); return m; };
      const mesh = (parent, geo, material, cast) => {
        const m = new T.Mesh(geo, material); m.castShadow = cast !== false; m.receiveShadow = true; parent.add(m); return m;
      };
      const disposeBook = () => {
        slide.clear(); shadowRoot.clear();
        geometries.forEach((x) => x.dispose()); materials.forEach((x) => x.dispose()); bookTextures.forEach((x) => x.dispose());
        geometries = []; materials = []; bookTextures = [];
      };
      const geometry = (positions, uvs, indices, colors, dynamic) => {
        const geo = ownGeo(new T.BufferGeometry());
        geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        if (colors) geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        if (dynamic) geo.attributes.position.setUsage(T.DynamicDrawUsage);
        geo.computeVertexNormals();
        return geo;
      };
      // All canonical sheets: u=0 at the hinge, v=1 at the head (-z), front normal +y.
      const grid = (xs, rows, height, yAt, down, leftUV) => {
        const p = [], uv = [], ix = [], colors = [];
        for (let j = 0; j <= rows; j++) for (let i = 0; i < xs.length; i++) {
          const u = (xs[i]-xs[0])/(xs[xs.length-1]-xs[0] || 1), v = j / rows;
          p.push(xs[i], yAt(xs[i], u), (v - 0.5) * height);
          uv.push(leftUV ? 1 - u : u, 1 - v); colors.push(1, 1, 1);
        }
        const n = xs.length;
        for (let j = 0; j < rows; j++) for (let i = 0; i < n - 1; i++) {
          const a = j * n + i, c = a + n;
          if (down) ix.push(a, a + 1, c, a + 1, c + 1, c);
          else ix.push(a, c, a + 1, a + 1, c, c + 1);
        }
        return geometry(p, uv, ix, colors, true);
      };
      const shadowMesh = (parent, color, opacity) => {
        const positions=[],uv=[],indices=[],cuts=[0,.25,.75,1];
        for(let j=0;j<4;j++) for(let i=0;i<4;i++) {
          positions.push(i,0,j);uv.push(cuts[i],1-cuts[j]);
          if(i<3&&j<3){const a=j*4+i;indices.push(a,a+4,a+1,a+1,a+4,a+5);}
        }
        const material=new T.MeshBasicMaterial({map:softShadow,color,opacity,transparent:true,depthWrite:false,toneMapped:false});
        materials.push(material);
        const result=mesh(parent,geometry(positions,uv,indices,null,true),material,false);
        result.receiveShadow=false;result.renderOrder=-1;
        return result;
      };
      const sizeShadow = (obj,w,h,pad,level,zOffset) => {
        const x=[-w/2-pad,-w/2,w/2,w/2+pad],z=[-h/2-pad,-h/2,h/2,h/2+pad];
        const pos=obj.geometry.attributes.position;
        for(let j=0;j<4;j++) for(let i=0;i<4;i++) pos.setXYZ(j*4+i,x[i],level,z[j]+zOffset);
        pos.needsUpdate=true;obj.geometry.computeBoundingSphere();
      };
      const depthAt = (v) => {
        const k = thick(v), scale = model.paperDepth / (k.l + k.r);
        return { l: k.l * scale, r: k.r * scale };
      };
      const profile = (u, depth, curve) => depth - (depth - Math.min(0.0015, depth * 0.4)) * (1 - smooth(u / 0.19)) * curve
        + 0.0012 * Math.sin(Math.PI * u) * (1 - u) * curve;

      const buildBook = () => {
        disposeBook();
        const b = g.b, hard = b.binding === 'hard';
        const boardT = hard ? Math.min(0.01, b.t * 0.2) : Math.min(0.0018, b.t * 0.08);
        const over = hard ? 0.012 : 0;
        model = { boardT, over, width: b.w + over, height: b.h + 2 * over,
          pageW: b.w - (hard ? 0.006 : 0), pageH: b.h - (hard ? 0.012 : 0), paperDepth: Math.max(0.006, b.t - 2 * boardT), open: 0, unitPx: 509/b.h };
        const m = model;
        const clothColor = b.cloth || b.spine || '#E8E2D2';
        const clothMap=(hinge)=>{
          const texture=canvasTexture(Math.round(1024*m.width/m.height),1024,
            (x,w,h)=>paintCloth(x,w,h,clothColor,hinge,false),true);
          bookTextures.push(texture);return texture;
        };
        const frontCloth=!b.cover?clothMap(true):null;
        const backCloth=(b.backCloth||!b.back)?clothMap(false):null;
        // The standard's object shadow (.obj): a faint contact edge and a short, soft drop.
        m.drop=shadowMesh(shadowRoot,0x1C1C1B,0.30);m.contact=shadowMesh(shadowRoot,0x1C1C1B,0.10);
        const cloth = mat({ color: clothColor, bumpMap: hard ? weave : null, bumpScale: 0.00014, roughness: 0.97 });
        const lining = mat({ color: 0xF5F3ED, roughness: 1 });
        const jacketEdge = mat({ color: b.spine || clothColor, roughness: 0.76 });
        const rim = (parent, w, h, bottom, top, material) => {
          const pts = [[0,-h/2],[w,-h/2],[w,h/2],[0,h/2],[0,-h/2]], p = [], uv = [], ix = [];
          for (let i = 0; i < pts.length; i++) {
            const x = pts[i][0], z = pts[i][1];
            p.push(x,bottom,z,x,top,z); uv.push(i/4,0,i/4,1);
            if (i < pts.length-1) { const k=i*2; ix.push(k,k+1,k+2,k+1,k+3,k+2); }
          }
          return mesh(parent, geometry(p,uv,ix), material);
        };
        const board = (front) => {
          const group = new T.Group(); slide.add(group);
          const sign = front ? 1 : -1, t = boardT / 2;
          const groove = (x) => hard ? 0.0007 * Math.exp(-Math.pow((x - m.width*0.03) / (m.width*0.005), 2)) : 0;
          const surface = (inset, offset, material) => {
            const xs = Array.from({ length: 65 }, (_, i) => inset + (m.width - 2 * inset) * i / 64);
            // Extra samples capture the narrow pressed hinge instead of drawing a dark stripe.
            if (hard) [0.02,0.025,0.03,0.035,0.04].forEach((u) => { const x=u*m.width; if (x > inset && x < m.width-inset) xs.push(x); });
            xs.sort((a,b) => a-b);
            const geo = grid(xs, 2, m.height - 2 * inset, (x) => sign * (t + offset - groove(x)), !front, false);
            const uv = geo.attributes.uv, color = geo.attributes.color;
            for (let j=0;j<=2;j++) for (let i=0;i<xs.length;i++) {
              const k=j*xs.length+i, shade=1-groove(xs[i])*38;
              uv.setX(k,(xs[i]-inset)/(m.width-2*inset)); color.setXYZ(k,shade,shade,shade);
            }
            return mesh(group, geo, material);
          };
          surface(0,0,cloth);
          mesh(group, grid([0,m.width],1,m.height,()=>-sign*t,front,false),lining);
          rim(group,m.width,m.height,-t,t,cloth);
          const imageMat = mat({ vertexColors: true, side: front ? T.FrontSide : T.BackSide, roughness: b.jacket ? 0.78 : 0.92,
            bumpMap: hard && (front ? !b.cover : (b.backCloth || !b.back)) ? weave : null, bumpScale: 0.00014 });
          // BackSide uses the same mirrored full-cover mapping as a turning leaf's back.
          setMap(imageMat, front ? (part(b.cover,'full') || frontCloth) : (b.backCloth ? backCloth : (part(b.back,'full',true) || backCloth)),clothColor);
          const inset = hard && !b.jacket ? 0.0015 : 0;
          // The back image is intentionally wound +y and drawn from its back (-y).
          const image = surface(inset,b.jacket ? 0.00045 : 0.00014,imageMat);
          if (!front) {
            const index=image.geometry.index;
            for (let i=0;i<index.count;i+=3) { const a=index.getX(i); index.setX(i,index.getX(i+2)); index.setX(i+2,a); }
            index.needsUpdate=true; image.geometry.computeVertexNormals();
          }
          if (b.jacket) {
            rim(group,m.width,m.height,-t-0.00035,t+0.00035,jacketEdge);
            // Thin folded flap on the inside, tucked underneath the endpaper packet.
            const flap = mesh(group,grid([m.width-Math.min(0.16,m.width*0.2),m.width],1,m.height,
              ()=>-sign*(t+0.0004),front,false),jacketEdge,false);
            flap.material.side = T.DoubleSide;
          }
          if(front&&b.insert) {
            const iw=m.width*clamp(Number(b.insertW)||0.3572,0.05,0.9);
            const ih=iw*(Number(b.insertPxH)||760)/(Number(b.insertPxW)||520);
            const z=(clamp(Number(b.insertTop)||0.45,0,1)-0.5)*m.height;
            const insert=mesh(group,grid([(m.width-iw)/2,(m.width+iw)/2],1,ih,()=>t+0.00065,false,false),
              mat({map:insertTexture(b.insert),roughness:0.94}),false);
            insert.name='cover-insert';insert.geometry.translate(0,0,z);
            const shadow=shadowMesh(group,0x85785d,0.23);shadow.position.x=m.width/2;
            m.insertShadow={mesh:shadow,width:iw,height:ih,z,level:t+0.00035};
          }
          return group;
        };
        m.front = board(true); m.back = board(false);

        const block = (side) => {
          const group = new T.Group(); slide.add(group);
          const cols=64, rows=6, xs=Array.from({length:cols+1},(_,i)=>side*m.pageW*Math.pow(i/cols,1.35));
          // A settled left image reads left-to-right; its UVs equal the mirrored back of a landed leaf.
          const topGeo=grid(xs,rows,m.pageH,()=>boardT/2,side<0,side<0);
          const top=mesh(group,topGeo,mat({color:paper,vertexColors:true,roughness:0.96}));
          const ring=[];
          for(let i=0;i<=cols;i++) ring.push(i);
          for(let j=1;j<=rows;j++) ring.push(j*(cols+1)+cols);
          for(let i=cols-1;i>=0;i--) ring.push(rows*(cols+1)+i);
          for(let j=rows-1;j>=0;j--) ring.push(j*(cols+1));
          const p=[],uv=[],ix=[];
          ring.forEach((k,i)=>{
            p.push(0,0,0,0,0,0); uv.push(i/cols,0,i/cols,1);
            if(i<ring.length-1) { const a=i*2; if(side>0) ix.push(a,a+1,a+2,a+1,a+3,a+2); else ix.push(a,a+2,a+1,a+1,a+2,a+3); }
          });
          const edgeGeo=geometry(p,uv,ix,null,true);
          mesh(group,edgeGeo,mat({map:edgeTex,roughness:1}));
          mesh(group,grid([0,side*m.pageW],1,m.pageH,()=>boardT/2,side>0,false),lining);
          const update=(depth,curve)=>{
            const pos=topGeo.attributes.position, color=topGeo.attributes.color;
            for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
              const k=j*(cols+1)+i,u=Math.pow(i/cols,1.35);
              pos.setY(k,boardT/2+profile(u,depth,curve));
              const shade=mix(1,gutter(u,side),curve);
              color.setXYZ(k,shade,shade,shade);
            }
            pos.needsUpdate=true; color.needsUpdate=true; topGeo.computeVertexNormals(); topGeo.computeBoundingSphere();
            const ep=edgeGeo.attributes.position, eu=edgeGeo.attributes.uv;
            ring.forEach((k,i)=>{
              const x=pos.getX(k),z=pos.getZ(k),y=pos.getY(k);
              ep.setXYZ(i*2,x,boardT/2,z); ep.setXYZ(i*2+1,x,y,z);
              // One line per physical sheet, independent of how many preview spreads are available.
              const stripePeriod=m.paperDepth/Math.max(2,(Number(b.pages)||80)/2)*16;
              eu.setY(i*2,0); eu.setY(i*2+1,(y-boardT/2)/stripePeriod);
            });
            ep.needsUpdate=true; eu.needsUpdate=true; edgeGeo.computeVertexNormals(); edgeGeo.computeBoundingSphere();
            group.position.set(0,boardT/2,0); group.rotation.set(0,0,0);
          };
          return {group,top,update};
        };
        m.L=block(-1); m.R=block(1); g.L=m.L.group; g.R=m.R.group;
        // A continuous half-elliptic spine becomes a shallow arch under the open gutter.
        const sections=hard?32:3, spineP=[], spineUV=[], spineIX=[];
        for(let j=0;j<2;j++) for(let i=0;i<=sections;i++) {
          spineP.push(0,0,(j-0.5)*m.height); spineUV.push(j,1-i/sections);
          if(j===0&&i<sections) { const a=i,c=i+sections+1; spineIX.push(a,a+1,c,a+1,c+1,c); }
        }
        const spineGeo=geometry(spineP,spineUV,spineIX,null,true);
        const lettering=spineTex(b); bookTextures.push(lettering);
        mesh(slide,spineGeo,mat({map:lettering,side:T.DoubleSide,roughness:b.jacket?0.78:0.96,
          bumpMap:hard&&!b.jacket?weave:null,bumpScale:0.0001}));
        const capP=[],capUV=[],capIX=[];
        for(let j=0;j<2;j++) {
          const start=capP.length/3;
          capP.push(0,0,(j-0.5)*m.height); capUV.push(0.5,0.5);
          for(let i=0;i<=sections;i++) {
            capP.push(0,0,(j-0.5)*m.height);capUV.push(i/sections,0);
            if(i<sections) { if(j===0) capIX.push(start,start+i+2,start+i+1); else capIX.push(start,start+i+1,start+i+2); }
          }
        }
        const capGeo=geometry(capP,capUV,capIX,null,true);
        mesh(slide,capGeo,mat({color:b.spine||clothColor,side:T.DoubleSide,roughness:0.95}));
        m.spineShape=(frontClosed,backClosed)=>{
          const pos=spineGeo.attributes.position,cap=capGeo.attributes.position;
          const r=hard?Math.min(0.023,b.t*0.38):0.002;
          const open=1-frontClosed-backClosed, mid=b.t/2;
          for(let j=0;j<2;j++) {
            cap.setXYZ(j*(sections+2),0,open*boardT/2+(1-open)*mid,(j-0.5)*m.height);
            for(let i=0;i<=sections;i++) {
              const u=i/sections,th=Math.PI*u;
              let fx,fy,ox,oy;
              if(hard) {
                fx=-r*Math.sin(th); fy=mid+mid*Math.cos(th);
                ox=-r*Math.cos(th); oy=boardT/2-Math.min(0.004,boardT/2-0.0006)*Math.sin(th);
              } else {
                fx=(i===0||i===sections)?0:-r; fy=i<2?b.t:0;
                ox=i<2?-0.003:0.003; oy=(i===0||i===sections)?boardT:0.0004;
              }
              const x=fx*frontClosed-fx*backClosed+ox*open;
              const y=fy*frontClosed+(b.t-fy)*backClosed+oy*open,z=(j-0.5)*m.height;
              pos.setXYZ(j*(sections+1)+i,x,y,z); cap.setXYZ(j*(sections+2)+i+1,x,y,z);
            }
          }
          [spineGeo,capGeo].forEach((geo)=>{geo.attributes.position.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();});
        };
        const leafCols=64,leafRows=32;
        const leafGeo=grid(Array.from({length:leafCols+1},(_,i)=>m.pageW*Math.pow(i/leafCols,1.35)),leafRows,m.pageH,()=>0,false,false);
        const leafF=mesh(slide,leafGeo,mat({color:paper,side:T.FrontSide,shadowSide:T.DoubleSide,vertexColors:true,roughness:0.96}));
        const backGeo=ownGeo(new T.BufferGeometry());
        backGeo.setIndex(leafGeo.index);
        ['position','normal','uv'].forEach((key)=>backGeo.setAttribute(key,leafGeo.attributes[key]));
        backGeo.setAttribute('color',leafGeo.attributes.color.clone());
        const leafB=mesh(slide,backGeo,mat({color:paper,side:T.BackSide,vertexColors:true,roughness:0.96}),false);
        leafF.visible=leafB.visible=false;
        // One double-sided shadow caster avoids two coincident sheet shadows.
        leafF.receiveShadow=leafB.receiveShadow=false;
        leafF.frustumCulled=leafB.frustumCulled=false;
        m.leafF=leafF;m.leafB=leafB;g.leafF=leafF;g.leafB=leafB;
        const contactGeo=grid(Array.from({length:leafCols+1},(_,i)=>m.pageW*Math.pow(i/leafCols,1.35)),leafRows,m.pageH,()=>0,false,false);
        const contactMat=new T.MeshBasicMaterial({map:foldShade,color:0x292925,transparent:true,opacity:0.22,depthWrite:false,side:T.DoubleSide,toneMapped:false});
        materials.push(contactMat);
        m.foldShadow=mesh(slide,contactGeo,contactMat,false);m.foldShadow.receiveShadow=false;
        m.foldShadow.visible=false;m.foldShadow.frustumCulled=false;
        const cornerBase=new Float32Array(leafGeo.attributes.position.count),cornerLift=new Float32Array(leafGeo.attributes.position.count);
        m.shapeCorner=(d)=>{
          const pos=leafGeo.attributes.position,colors=leafGeo.attributes.color,backColors=backGeo.attributes.color;
          const cp=contactGeo.attributes.position,cu=contactGeo.attributes.uv;
          const w=d.width,h=d.height,c=d.cornerZ,dx=w-d.point.x,dz=c-d.point.y;
          const distance=Math.hypot(dx,dz),nx=distance>1e-8?dx/distance:1,nz=distance>1e-8?dz/distance:0;
          const mx=(w+d.point.x)/2,mz=(c+d.point.y)/2;
          // The rounded fold is a cylindrical isometry in the sheet plane. Outside the
          // roll it is exactly the perpendicular-bisector reflection C -> pointer.
          const margin=Math.max(0,mx*nx+Math.min((-h/2-mz)*-nz,(h/2-mz)*-nz));
          const length=Math.min(w*0.12,distance*0.72,margin*1.96);
          const radius=length/Math.PI,progress=d.progress;
          const q=d.a.dir>0?progress:1-progress;
          const source=d.sourceSurface,target=d.targetSurface;
          const under=d.a.dir>0?mix(d.a.ka.r,d.a.kb.r,smooth(q/0.45)):mix(d.a.ka.l,d.a.kb.l,smooth((q-0.55)/0.45));
          for(let j=0;j<=leafRows;j++)for(let i=0;i<=leafCols;i++){
            const k=j*(leafCols+1)+i,u=Math.pow(i/leafCols,1.35),x=u*w,z=(j/leafRows-0.5)*h;
            const signed=(x-mx)*nx+(z-mz)*nz,t=signed+length/2;
            let offset=0,lift=0,angle=0;
            if(t>0){
              if(length>1e-7&&t<length){angle=t/radius;offset=radius*Math.sin(angle)-t;lift=radius*(1-Math.cos(angle));}
              else {angle=Math.PI;offset=-2*signed;lift=2*radius;}
            }
            const y0=source.flat?source.y:boardT+profile(u,source.depth,1);
            const y1=target.flat?target.y:boardT+profile(u,target.depth,1);
            // The unturned face must stay above the source stack. Blending its height
            // toward the destination would bury it under the next page before it folds.
            // Only the rolled portion settles toward the destination. A flexible cover's
            // inner hinge still follows the changing closed/open binding height.
            const folded=smooth(angle/Math.PI),anchored=d.a.kind==='page'?1:smooth(u/0.19);
            cornerBase[k]=mix(y0,y1,progress*(1-anchored*(1-folded)))+0.00035;cornerLift[k]=lift;
            pos.setXYZ(k,d.side*(x+nx*offset),cornerBase[k]+lift,z+nz*offset);
            const round=1-0.09*Math.sin(angle)*Math.sin(angle)+0.025*Math.sin(2*angle);
            const f=(d.a.kind==='front'?1:gutter(u,1))*round;
            const b=(d.a.kind==='back'?1:gutter(u,-1))*round;
            colors.setXYZ(k,f,f,f);backColors.setXYZ(k,b,b,b);
            // The contact shadow lies on the retained face, above its 0.00035 clearance,
            // so restoring that face cannot hide the shadow under the source stack.
            cp.setXYZ(k,d.side*x,Math.max(y0,boardT+profile(u,under,1))+0.00055,z);
            cu.setXY(k,0.5+(signed+length/2)/Math.max(w*0.045,length*0.9),0.5);
          }
          // Adding the resting gutter height to a cylindrical sheet can lengthen its rows.
          // Solve only the roll's height to retain each unscaled row's arc length. This
          // leaves the bisector, the pinned spine and the corner's x/z target untouched.
          for(let j=0;j<=leafRows;j++){
            const first=j*(leafCols+1);let rest=0;
            for(let i=1;i<=leafCols;i++){
              const k=first+i,ds=w*(Math.pow(i/leafCols,1.35)-Math.pow((i-1)/leafCols,1.35));
              rest+=Math.hypot(ds,cornerBase[k]-cornerBase[k-1]);
            }
            const rowLength=(scale)=>{
              let sum=0;
              for(let i=1;i<=leafCols;i++){
                const k=first+i;
                sum+=Math.hypot(pos.getX(k)-pos.getX(k-1),pos.getZ(k)-pos.getZ(k-1),
                  cornerBase[k]-cornerBase[k-1]+scale*(cornerLift[k]-cornerLift[k-1]));
              }
              return sum;
            };
            if(Math.abs(rowLength(1)-rest)>w*0.00001){
              let low=0,high=1.25;
              for(let i=0;i<12;i++){const mid=(low+high)/2;if(rowLength(mid)>rest)high=mid;else low=mid;}
              const scale=(low+high)/2;
              for(let i=0;i<=leafCols;i++){const k=first+i;pos.setY(k,cornerBase[k]+scale*cornerLift[k]);}
            }
          }
          pos.needsUpdate=true;colors.needsUpdate=true;backColors.needsUpdate=true;
          leafGeo.computeVertexNormals();leafGeo.computeBoundingSphere();backGeo.boundingSphere=leafGeo.boundingSphere;
          cp.needsUpdate=true;cu.needsUpdate=true;contactGeo.computeBoundingSphere();
          contactMat.opacity=0.22*Math.sin(Math.PI*progress);
          m.foldShadow.visible=d.a.kind==='page'&&progress>0.001&&progress<0.999;
        };
        m.shapeLeaf=(q,ka,kb,dir)=>{
          const th=Math.PI*q, sin=Math.sin(th), curl=g.reduce?0:0.30*sin*dir;
          const depth=mix(ka.r,kb.l,q),root=boardT+profile(0,depth,1)+0.00035+0.007*sin;
          const pos=leafGeo.attributes.position,color=leafGeo.attributes.color;
          let x=0,y=0;
          for(let i=0;i<=leafCols;i++) {
            const u=Math.pow(i/leafCols,1.35);
            if(i) {
              const prev=Math.pow((i-1)/leafCols,1.35),ds=(u-prev)*m.pageW;
              const phi=th-curl*Math.pow((u+prev)/2,0.85);
              x+=Math.cos(phi)*ds; y+=Math.sin(phi)*ds;
            }
            const rise=(profile(u,depth,1)-profile(0,depth,1))*Math.cos(th)*Math.cos(th);
            for(let j=0;j<=leafRows;j++) {
              const k=j*(leafCols+1)+i,v=j/leafRows;
              const corner=g.reduce?0:0.004*sin*u*u*(2*v-1);
              pos.setXYZ(k,x,root+y+rise+corner,(v-0.5)*m.pageH);
              const shade=gutter(u,1),backShade=gutter(u,-1);color.setXYZ(k,shade,shade,shade);
              backGeo.attributes.color.setXYZ(k,backShade,backShade,backShade);
            }
          }
          pos.needsUpdate=true;color.needsUpdate=true;backGeo.attributes.color.needsUpdate=true;leafGeo.computeVertexNormals();leafGeo.computeBoundingSphere();backGeo.boundingSphere=leafGeo.boundingSphere;
        };
      };

      const openBoards = () => {
        const m=model;
        m.front.position.set(0,m.boardT/2,0);m.front.rotation.set(0,0,Math.PI);
        m.back.position.set(0,m.boardT/2,0);m.back.rotation.set(0,0,0);
        m.spineShape(0,0);
      };
      const coverPose = (front,q) => {
        const m=model, k=depthAt(front?1:g.b.spreads.length);
        openBoards();
        const open=front?q:1-q; m.open=open;
        m.L.update(k.l,open);m.R.update(k.r,open);
        const board=front?m.front:m.back,packet=front?m.L.group:m.R.group;
        const angle=Math.PI*q,level=m.boardT/2+(m.paperDepth+m.boardT)*(front?1-q:q);
        board.rotation.z=angle;board.position.y=level;
        packet.rotation.z=front?angle-Math.PI:angle;packet.position.y=level;
        m.spineShape(front?1-q:0,front?0:q);
        slide.position.x=front?-g.b.w/2*(1-q):g.b.w/2*q;
      };
      const show = (v) => {
        const m=model,n=g.b.spreads.length;
        m.leafF.visible=m.leafB.visible=m.foldShadow.visible=false;
        m.front.visible=m.back.visible=m.L.group.visible=m.R.group.visible=true;
        const spread=clamp(v-1,0,Math.max(0,n-1));
        setMap(m.L.top.material,half(spread,'L'));setMap(m.R.top.material,half(spread,'R'));
        if(v===0) coverPose(true,0);
        else if(v===n+1) coverPose(false,1);
        else {
          const k=depthAt(v);m.open=1;openBoards();m.L.update(k.l,1);m.R.update(k.r,1);slide.position.x=0;
        }
      };
      const finish = () => {
        const a=g.anim;if(!a)return;
        g.anim=null;g.view=a.to;show(g.view);if(!a.grab||a.to!==a.from)this.report(g.view);invalidate();
      };
      const animate = (a,p) => {
        if(a.grab){
          const d=a.grab,e=ease(p);
          d.progress=mix(a.release.from,a.release.to,e);
          d.point.copy(a.release.point).lerp(a.release.target,e);
          applyGrab(d);return;
        }
        const q=a.dir>0?ease(p):1-ease(p),m=model;
        if(a.kind==='front') coverPose(true,q);
        else if(a.kind==='back') coverPose(false,q);
        else {
          // The represented stack transfer happens under the lifting/landing leaf.
          m.L.update(mix(a.ka.l,a.kb.l,smooth((q-0.55)/0.45)),1);
          m.R.update(mix(a.ka.r,a.kb.r,smooth(q/0.45)),1);
          m.shapeLeaf(q,a.ka,a.kb,a.dir);
        }
      };
      let grab=null;
      const cursor=(value)=>{if(this.cv.style)this.cv.style.cursor=value;};
      const abandonGrab=()=>{
        if(!grab)return;
        grab=null;g.grabbing=false;g.down=null;cursor('');show(g.view);invalidate();
      };
      const prepareTurn=(dir)=>{
        show(g.view);
        const from=g.view,to=from+dir,n=g.b.spreads.length;
        if(to<0||to>n+1)return null;
        if(g.spine){g.spine=false;this.setState({spine:false});}
        const lo=Math.min(from,to),hi=Math.max(from,to),m=model;
        const kind=lo===0?'front':hi===n+1?'back':'page';
        const a={from,to,dir,kind,t0:performance.now(),dur:g.reduce?0:760,ka:depthAt(lo),kb:depthAt(hi)};
        if(kind==='page') {
          m.open=1;openBoards();slide.position.x=0;
          setMap(m.L.top.material,half(lo-1,'L'));setMap(m.R.top.material,half(hi-1,'R'));
          setMap(m.leafF.material,half(lo-1,'R'));setMap(m.leafB.material,half(hi-1,'L',true));
          m.leafF.visible=m.leafB.visible=!g.reduce;
        } else {
          const s=kind==='front'?0:n-1;
          setMap(m.L.top.material,half(s,'L'));setMap(m.R.top.material,half(s,'R'));
          m.leafF.visible=m.leafB.visible=false;
        }
        return a;
      };
      g.step = (dir) => {
        abandonGrab();if(g.anim)finish();
        dir=dir>0?1:dir<0?-1:0;if(!dir||!g.b)return;
        const a=prepareTurn(dir);if(!a)return;
        g.anim=a;
        if(g.reduce)finish();else animate(a,0);invalidate();
      };

      const grabRay=new T.Raycaster(),grabPlane=new T.Plane(new T.Vector3(0,1,0),0);
      const localRay=new T.Ray(),rayPoint=new T.Vector3(),screenPoint=new T.Vector3();
      const planePoint=(e,inverse,level)=>{
        const rect=this.cv.getBoundingClientRect();
        if(!rect.width||!rect.height||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return null;
        camera.updateMatrixWorld(true);
        grabRay.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
        localRay.copy(grabRay.ray).applyMatrix4(inverse);grabPlane.constant=-level;
        return localRay.intersectPlane(grabPlane,rayPoint)?rayPoint.clone():null;
      };
      const screen=(x,y,z)=>{
        const rect=this.cv.getBoundingClientRect();
        screenPoint.set(x,y,z).applyMatrix4(holder.matrixWorld).project(camera);
        return new T.Vector2((screenPoint.x+1)*rect.width/2,(1-screenPoint.y)*rect.height/2);
      };
      const grabZone=(e)=>{
        if(disposed||g.closer||g.spine||g.grabbing||!g.b)return null;
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const inverse=holder.matrixWorld.clone().invert(),n=g.b.spreads.length;
        const closed=g.view===0||g.view===n+1;
        const sides=closed?[g.view===0?1:-1]:[1,-1],k=depthAt(g.view);
        const w=closed?model.width:model.pageW,h=closed?model.height:model.pageH;
        for(const side of sides){
          const level=closed?g.b.t:model.boardT+(side>0?k.r:k.l);
          const p=planePoint(e,inverse,level);if(!p)continue;
          const x=side*(p.x-slide.position.x),z=p.z,cornerZ=z<0?-h/2:h/2;
          const at=screen(slide.position.x+side*w,level,cornerZ);
          const across=screen(slide.position.x+side*w*0.88,level,cornerZ);
          const along=screen(slide.position.x+side*w,level,cornerZ*(1-0.24));
          const zoneW=Math.min(w,Math.max(w*0.12,44*w*0.12/Math.max(1,at.distanceTo(across))));
          const zoneH=Math.min(h/2,Math.max(h*0.12,44*h*0.12/Math.max(1,at.distanceTo(along))));
          if(x>=w-zoneW&&x<=w+1e-6&&Math.abs(z)<=h/2+1e-6&&Math.abs(z)>=h/2-zoneH){
            return {side,width:w,height:h,cornerZ,inverse,level,start:p,slideStart:slide.position.x};
          }
        }
        return null;
      };
      const slideAt=(d,r)=>mix(d.slideStart,d.slideEnd,smooth(r));
      const clampCorner=(d,p)=>{
        const w=d.width,c=d.cornerZ;
        p.x=clamp(p.x,-w,w);p.y=clamp(p.y,-d.height/2,d.height/2);
        // Intersection of the two spine-end reach disks. Constraining z to the sheet's
        // head/tail interval makes the nearest corner's disk sufficient for both anchors.
        const dz=p.y-c,rough=clamp((w-p.x)/(2*w),0,1);
        const reach=w*(1-0.012*Math.sin(Math.PI*rough));
        const length=Math.hypot(p.x,dz);
        if(length>reach){p.x*=reach/length;p.y=c+dz*reach/length;}
        return p;
      };
      const applyGrab=(d)=>{
        if(g.reduce)return;
        const a=d.a,q=a.dir>0?d.progress:1-d.progress,m=model;
        if(a.kind==='page'){
          m.L.update(mix(a.ka.l,a.kb.l,smooth((q-0.55)/0.45)),1);
          m.R.update(mix(a.ka.r,a.kb.r,smooth(q/0.45)),1);
        }else{
          coverPose(a.kind==='front',q);slide.position.x=slideAt(d,d.progress);
          if(d.rigid)return;
          (a.kind==='front'?m.front:m.back).visible=false;
          (a.kind==='front'?m.L.group:m.R.group).visible=false;
        }
        m.leafF.visible=m.leafB.visible=true;m.shapeCorner(d);
      };
      const updateGrab=(e,record)=>{
        const d=grab;if(!d||e.pointerId!==undefined&&d.pointerId!==undefined&&e.pointerId!==d.pointerId)return false;
        const p=planePoint(e,d.inverse,d.level);if(!p)return false;
        const targetX=p.x+d.offsetX,targetZ=p.z+d.offsetZ;
        // Include the centring slide in the inverse hinge calculation. The smooth slide
        // has zero end velocity, so corner x stays monotonic and cannot jump on contact.
        let lo=0,hi=1;
        for(let i=0;i<28;i++){
          const mid=(lo+hi)/2;
          const x=slideAt(d,mid)+d.side*d.width*(d.rigid?Math.cos(Math.PI*mid):1-2*mid);
          if(d.side*(x-targetX)>0)lo=mid;else hi=mid;
        }
        d.progress=(lo+hi)/2;
        if(d.rigid)d.point.set(d.width*Math.cos(Math.PI*d.progress),d.cornerZ);
        else{
          d.point.set(d.side*(targetX-slideAt(d,d.progress)),targetZ);clampCorner(d,d.point);
          d.progress=clamp((d.width-d.point.x)/(2*d.width),0,1);
        }
        if(record){
          const now=performance.now();d.samples.push({x:p.x,t:now});
          while(d.samples.length>2&&d.samples[1].t<now-120)d.samples.shift();
          d.samples=d.samples.slice(-16);
        }
        applyGrab(d);invalidate();return true;
      };
      g.grabHover=(e)=>{if(!g.grabbing)cursor(!g.anim&&grabZone(e)?'grab':'');};
      g.grabStart=(e)=>{
        if(disposed||g.grabbing||g.closer||g.spine||e.isPrimary===false||(e.button!==undefined&&e.button!==0))return false;
        if(g.anim)finish();
        const hit=grabZone(e);if(!hit){cursor('');return false;}
        const a=prepareTurn(hit.side);if(!a)return false;
        const n=g.b.spreads.length,closed=g.view===0||g.view===n+1;
        const targetClosed=a.to===0||a.to===n+1;
        const sourceK=depthAt(a.from),targetK=depthAt(a.to);
        grab=Object.assign(hit,{a,pointerId:e.pointerId,progress:0,point:new T.Vector2(hit.width,hit.cornerZ),
          rigid:a.kind!=='page'&&g.b.binding==='hard',
          slideEnd:a.to===0?-g.b.w/2:a.to===n+1?g.b.w/2:0,
          offsetX:hit.slideStart+hit.side*hit.width-hit.start.x,offsetZ:hit.cornerZ-hit.start.z,
          sourceSurface:{flat:closed,y:g.b.t,depth:hit.side>0?sourceK.r:sourceK.l},
          targetSurface:{flat:targetClosed,y:g.b.t,depth:hit.side>0?targetK.l:targetK.r},
          samples:[{x:hit.start.x,t:performance.now()}]});
        if(a.kind!=='page'&&!grab.rigid){
          setMap(model.leafF.material,a.kind==='front'?part(g.b.cover,'full'):half(n-1,'R'),g.b.cloth||paper);
          setMap(model.leafB.material,a.kind==='front'?half(0,'L',true):part(g.b.back,'full',true),g.b.cloth||paper);
        }
        g.grabbing=true;g.down=null;poseTween=null;poseKey='';cursor('grabbing');
        if(g.reduce)show(g.view);else applyGrab(grab);
        invalidate();return true;
      };
      g.grabMove=(e)=>{updateGrab(e,true);};
      g.grabEnd=(e,cancelled)=>{
        if(!grab||e.pointerId!==undefined&&grab.pointerId!==undefined&&e.pointerId!==grab.pointerId)return;
        if(!cancelled)updateGrab(e,true);
        const d=grab,now=performance.now(),last=d.samples[d.samples.length-1];
        const first=d.samples.find((s)=>s.t>=now-120)||last;
        const dt=Math.max(16,last.t-first.t)/1000;
        const velocity=d.side*(first.x-last.x)/(d.width*dt);
        const flick=!g.reduce&&last.t>=now-120&&velocity>0.6&&d.side*(first.x-last.x)>d.width*0.015;
        const complete=!cancelled&&(d.progress>0.5||flick);
        grab=null;g.grabbing=false;g.down=null;cursor('');
        if(g.reduce){
          if(complete){g.view=d.a.to;show(g.view);this.report(g.view);}else show(g.view);
          invalidate();return;
        }
        const destination=complete?1:0,a=d.a;
        a.to=complete?a.to:a.from;a.grab=d;
        a.release={from:d.progress,to:destination,point:d.point.clone(),target:new T.Vector2(complete?-d.width:d.width,d.cornerZ)};
        a.t0=now;a.dur=Math.max(180,760*Math.abs(destination-d.progress));g.anim=a;invalidate();
      };
      g.jump = (v) => {
        abandonGrab();cursor('');if(g.anim)finish();
        const next=Number(v);g.view=clamp(Number.isFinite(next)?Math.round(next):0,0,g.b.spreads.length+1);
        if(g.spine&&g.view!==0){g.spine=false;this.setState({spine:false});}
        show(g.view);this.report(g.view);invalidate();
      };
      const fit = () => {
        abandonGrab();
        const b=g.b;if(!b)return;
        const width=Math.max(1,this.cv.clientWidth||1100),height=Math.max(1,this.cv.clientHeight||600);
        // Same page scale when closed/open. Fit the settled spread, not the upright turning leaf.
        // A little more room below than above, so the drop shadow is never cut by the canvas edge.
        const padX=Math.min(85,width*0.14),padY=Math.min(24,height*0.08),padB=padY+Math.min(20,height*0.04);
        const scale=Math.min((width-2*padX)/(2*model.width),(height-padY-padB)/model.height);
        model.unitPx=Math.max(1,scale);
        // CSS perspective is a focal length in pixels: 2300px at a 509px-high reference page.
        const focal=2300*(model.height*scale/509);
        camera.aspect=width/height;camera.fov=2*Math.atan(height/(2*focal))*180/Math.PI;camera.updateProjectionMatrix();
        let D=focal/scale;
        const look=new T.Vector3(0,b.t,(padB-padY)/2/scale);
        if(g.closer){D*=0.42;look.x=g.ptr.x*b.w*0.85;look.z=g.ptr.y*b.h*0.42;}
        const target={pos:new T.Vector3(look.x,look.y+D,look.z),look,up:new T.Vector3(0,0,-1)};
        if(g.reduce||!g.camNow||(camera.position.distanceToSquared(target.pos)<1e-12&&g.camNow.look.distanceToSquared(look)<1e-12)){g.camNow=target;g.cam=null;camera.position.copy(target.pos);camera.up.copy(target.up);camera.lookAt(look);}
        else g.cam={from:{pos:camera.position.clone(),look:g.camNow.look.clone()},to:target,t0:performance.now(),dur:g.closerFollow?160:420};
        if(model.insertShadow){
          const a=model.insertShadow,pixel=1/model.unitPx;
          sizeShadow(a.mesh,a.width+2*pixel,a.height+2*pixel,3*pixel,a.level,a.z+pixel*0.5);
        }
        invalidate();
      };
      g.fit=fit;
      g.setVer=()=>{};
      g.setCloser=(on)=>{abandonGrab();if(g.anim&&g.anim.grab)finish();cursor('');g.closer=!!on;fit();};
      g.setSpine=(on)=>{abandonGrab();cursor('');if(g.anim)finish();if(on&&g.view!==0)g.jump(0);g.spine=!!on;invalidate();};
      g.pick=(ev)=>{
        const r=this.cv.getBoundingClientRect();
        return {x:clamp(((ev.clientX-r.left)/Math.max(1,r.width))*2-1,-1,1),y:clamp(((ev.clientY-r.top)/Math.max(1,r.height))*2-1,-1,1),right:ev.clientX-r.left>r.width/2};
      };
      let pose=null,poseTween=null,poseKey='';
      g.setBook=(i)=>{
        abandonGrab();cursor('');if(g.anim)finish();
        const index=Number(i);g.bi=clamp(Number.isFinite(index)?Math.floor(index):0,0,B.length-1);
        g.b=B[g.bi];g.view=0;g.spine=false;buildBook();show(0);pose=null;poseKey='';poseTween=null;
        // A book switch adopts its own framing immediately, avoiding a stale aspect-ratio tween.
        g.camNow=null;fit();this.report(0);invalidate();
      };
      const resize=()=>{
        const w=this.cv.clientWidth,h=this.cv.clientHeight;if(!w||!h)return;
        renderer.setSize(w,h,false);fit();
      };
      const originalDispose=renderer.dispose.bind(renderer);
      renderer.dispose=()=>{
        if(disposed)return;grab=null;g.grabbing=false;cursor('');disposed=true;
        if(this.raf)cancelAnimationFrame(this.raf);this.raf=null;if(this.ro)this.ro.disconnect();
        disposeBook();Object.keys(parts).forEach((k)=>parts[k].dispose());Object.keys(cache).forEach((k)=>cache[k].dispose());
        Object.keys(inserts).forEach((k)=>inserts[k].dispose());edgeTex.dispose();weave.dispose();softShadow.dispose();foldShade.dispose();
        if(sun.shadow.map)sun.shadow.map.dispose();originalDispose();
      };
      const pivot=new T.Vector3();
      drawFrame=(now)=>{
        this.raf=null;if(disposed)return;
        if(g.cam){
          const p=clamp((now-g.cam.t0)/g.cam.dur,0,1),e=ease(p);
          camera.position.lerpVectors(g.cam.from.pos,g.cam.to.pos,e);
          g.camNow={pos:camera.position.clone(),look:g.cam.from.look.clone().lerp(g.cam.to.look,e),up:g.cam.to.up};
          if(p>=1){g.camNow=g.cam.to;g.cam=null;}
        }else if(g.camNow)camera.position.copy(g.camNow.pos);
        camera.up.set(0,0,-1);if(g.camNow)camera.lookAt(g.camNow.look);
        if(g.anim){const a=g.anim,p=a.dur?clamp((now-a.t0)/a.dur,0,1):1;if(p>=1)finish();else animate(a,p);}
        const held=g.grabbing||!!(g.anim&&g.anim.grab);
        const front=g.view===0,back=g.view===g.b.spreads.length+1;
        const rest=(front||back)&&!g.hover&&!g.anim;
        // CSS rotateY maps to world -Z (the long axis); CSS rotateZ maps to world -Y.
        const target={roll:rest?-(back?8:25)*Math.PI/180:0,lean:rest?(back?1:-1)*1.3*Math.PI/180:0,scale:rest?0.92:1};
        if(g.spine&&front){target.roll=-64*Math.PI/180;target.lean=-1.3*Math.PI/180;target.scale=0.92;}
        const key=[target.roll,target.lean,target.scale].join(':');
        if(!held){
        if(!pose||g.reduce){pose=Object.assign({},target);poseTween=null;poseKey=key;}
        else if(key!==poseKey){poseTween={from:Object.assign({},pose),to:target,t0:now};poseKey=key;}
        if(poseTween){
          const p=clamp((now-poseTween.t0)/420,0,1),e=ease(p);
          Object.keys(pose).forEach((k)=>{pose[k]=mix(poseTween.from[k],poseTween.to[k],e);});
          if(p>=1){pose=poseTween.to;poseTween=null;}
        }
        }
        if(!pose)pose=Object.assign({},target);
        holder.rotation.set(0,pose.lean,pose.roll,'ZYX');holder.scale.setScalar(pose.scale);
        // Rotate about the cover's centre, exactly as a CSS face does; no artificial table lift.
        pivot.set(0,g.b.t,0).multiplyScalar(pose.scale).applyQuaternion(holder.quaternion);
        holder.position.set(-pivot.x,g.b.t-pivot.y,-pivot.z);
        const pixel=1/model.unitPx;
        const footprint=(model.width*(1+model.open)*Math.abs(Math.cos(pose.roll))+g.b.t*Math.abs(Math.sin(pose.roll)))*pose.scale;
        const depth=-2*Math.max(model.width,model.height);
        // Scaled to the ground the book rests on (y = 0), not the closed cover's top: projected at the cover's
        // height the shadow came out larger than an open book's boards and showed as a frame round all four sides.
        const projection=(camera.position.y-depth)/Math.max(0.1,camera.position.y);
        const tall=model.height*pose.scale;
        sizeShadow(model.drop,Math.max(pixel,footprint-38*pixel),Math.max(pixel,tall-38*pixel),40*pixel,0,10*pixel);
        // The contact edge belongs to a book lying flat; it fades out as the closed book tilts.
        sizeShadow(model.contact,footprint,tall,2*pixel,0,pixel);
        model.contact.material.opacity=0.10*Math.max(0,1-Math.abs(pose.roll)/(6*Math.PI/180));model.contact.visible=model.contact.material.opacity>0;
        shadowRoot.position.set(camera.position.x*(1-projection),depth,camera.position.z*(1-projection));
        shadowRoot.rotation.y=pose.lean;shadowRoot.scale.setScalar(projection);
        renderer.render(scene,camera);
        if(g.anim||g.cam||poseTween)invalidate();
      };
      if(window.ResizeObserver){this.ro=new window.ResizeObserver(resize);this.ro.observe(this.cv);}
      g.setBook(this.state.book);resize();invalidate();
    }
    // ===== END 3D SCENE =====
  }

  const root = document.getElementById('viewer');
  if (!root) return;
  // An address opens the book where it says (#page=7 is the seventh position: pages 12–13).
  // Read before the viewer starts, since starting writes the cover's address.
  const asked = () => { const at = Number(new URLSearchParams(location.hash.slice(1)).get('page')); return Number.isInteger(at) && at > 0 ? at : 0; };
  const at = asked();
  const viewer = new Viewer(root);
  if (at) viewer.jump(at);
  addEventListener('hashchange', () => { const v = asked(); if (v) viewer.jump(v); });
})();
