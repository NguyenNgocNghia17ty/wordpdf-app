// WordPDF Mobile – engine (dùng chung quy đổi với bản máy tính WordPDFPro.py)
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from '@cantoo/pdf-lib';
import { renderAsync as renderDocx } from 'docx-preview';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import * as pako from 'pako';

pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';

// ---------------------------------------------------------------- cấu hình
export const UI_DEFAULT = {
  wm_text: '', wm_history: [], khach: '', khach_history: [],
  style: 'vua', strength: 'vua', color: '#c92a2a', quality: 'chuan',
  pages: 'all', first_n: 15, blur_rest: true, protect: true, antiocr: false,
  qr_text: '', footer_text: '', blur_text: 'NỘI DUNG ĐÃ ĐƯỢC ẨN\nLiên hệ để nhận bản đầy đủ',
  user_pw: '', logo_path: '', out_mode: 'same', out_dir: '', merge: false,
  name_tpl: '{ten}_protected', open_after: true,
};
export const SYNC_SKIP = new Set(['logo_path', 'out_mode', 'out_dir', 'user_pw', 'open_after']);

export const STYLE_OPTS = [['day', 'Dày đặc'], ['vua', 'Vừa'], ['thua', 'Thưa'], ['to', '1 chữ to'], ['none', 'Không']];
export const STRENGTH_OPTS = [['mo', 'Mờ'], ['vua', 'Vừa'], ['ro', 'Rõ']];
export const QUALITY_OPTS = [['nhe', 'Nhẹ'], ['chuan', 'Chuẩn'], ['net', 'Nét']];
export const PAGES_OPTS = [['all', 'Tất cả trang'], ['first', 'Vài trang đầu']];
export const COLOR_OPTS = [['#c92a2a', 'Đỏ'], ['#868e96', 'Xám'], ['#1971c2', 'Xanh'], ['#212529', 'Đen']];

const TILE_PRESET = { day: [12, 110], vua: [16, 200], thua: [22, 360] };
const OPACITY_TILE = { mo: 12, vua: 22, ro: 38 };
const OPACITY_SINGLE = { mo: 10, vua: 15, ro: 25 };
const QUALITY_PRESET = { nhe: [72, 35], chuan: [130, 72], net: [250, 92] };

const inOpts = (v, opts) => opts.some(o => o[0] === v);

export function normalizeUi(d) {
  const ui = { ...UI_DEFAULT };
  for (const [k, v] of Object.entries(d || {})) if (k in UI_DEFAULT) ui[k] = v;
  ui.first_n = Math.max(1, parseInt(ui.first_n, 10) || 15);
  if (!inOpts(ui.style, STYLE_OPTS)) ui.style = 'vua';
  if (!inOpts(ui.strength, STRENGTH_OPTS)) ui.strength = 'vua';
  if (!inOpts(ui.quality, QUALITY_OPTS)) ui.quality = 'chuan';
  if (!inOpts(ui.pages, PAGES_OPTS)) ui.pages = 'all';
  for (const k of ['wm_history', 'khach_history']) {
    ui[k] = (Array.isArray(ui[k]) ? ui[k] : []).map(String).filter(s => s.trim()).slice(0, 12);
  }
  return ui;
}

export function uiToCfg(uiIn) {
  const ui = normalizeUi(uiIn);
  const c = {
    wm_mode: 'tile', wm_text: ui.wm_text, wm_color: ui.color, wm_opacity: 20, wm_size: 16, wm_spacing: 200,
    wm_angle: 30, wm_auto_angle: true, qr_text: ui.qr_text, qr_pos: 'br', qr_scale: 10,
    footer_text: ui.footer_text, header_text: '', hf_size: 9, hf_color: ui.color,
    page_spec: '', page_mode: 'drop', blur_strength: 6, blur_text: ui.blur_text,
    dpi: 140, quality: 75, noise: 0, user_pw: ui.user_pw,
    block: !!ui.protect, merge: !!ui.merge, name_tpl: ui.name_tpl || '{ten}_protected',
    logo: null, logo_pos: 'center', logo_scale: 35, logo_opacity: 15,
  };
  if (ui.style === 'to') { c.wm_mode = 'single'; c.wm_opacity = OPACITY_SINGLE[ui.strength]; }
  else if (ui.style === 'none') c.wm_mode = 'none';
  else { [c.wm_size, c.wm_spacing] = TILE_PRESET[ui.style]; c.wm_opacity = OPACITY_TILE[ui.strength]; }
  [c.dpi, c.quality] = QUALITY_PRESET[ui.quality];
  if (ui.pages === 'first') { c.page_spec = `1-${ui.first_n}`; c.page_mode = ui.blur_rest ? 'blur' : 'drop'; }
  c.noise = ui.antiocr ? 10 : 0;
  return c;
}

export function pushHistory(list, value, n = 12) {
  value = (value || '').trim();
  if (!value) return [...list];
  return [value, ...list.filter(x => x !== value)].slice(0, n);
}

// ---------------------------------------------------------------- đồng bộ
function b64urlEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - s.length % 4) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function encodeSync(ui) {
  const d = {};
  for (const [k, v] of Object.entries(normalizeUi(ui))) if (!SYNC_SKIP.has(k)) d[k] = v;
  return 'WPDF1.' + b64urlEncode(pako.deflate(new TextEncoder().encode(JSON.stringify(d)), { level: 9 }));
}
export function decodeSync(code) {
  const m = /WPDF1\.([A-Za-z0-9_\-]+)/.exec(code || '');
  if (!m) throw new Error('Mã không hợp lệ (phải bắt đầu bằng WPDF1.)');
  const d = JSON.parse(new TextDecoder().decode(pako.inflate(b64urlDecode(m[1]))));
  const out = {};
  for (const [k, v] of Object.entries(d)) if (k in UI_DEFAULT && !SYNC_SKIP.has(k)) out[k] = v;
  return out;
}
export function mergeSync(ui, inc) {
  ui = normalizeUi(ui);
  const n = { ...ui, ...inc };
  for (const k of ['wm_history', 'khach_history']) {
    const m = [];
    for (const x of [...(inc[k] || []), ...(ui[k] || [])]) if (!m.includes(x)) m.push(x);
    n[k] = m.slice(0, 12);
  }
  return normalizeUi(n);
}

// ---------------------------------------------------------------- tiện ích
export function fill(tpl, ctx) {
  let s = String(tpl || '');
  for (const [k, v] of Object.entries(ctx)) s = s.split('{' + k + '}').join(String(v));
  return s;
}
export function makeCtx(name, khach) {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return { khach: khach || '', ngay: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`, ten: name.replace(/\.[^.]+$/, '') };
}
export function sanitizeName(s) {
  s = String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').replace(/\s+/g, ' ').replace(/^[ ._]+|[ ._]+$/g, '');
  return s || 'output';
}
export function outName(name, cfg, khach) {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  const ctx = { ...makeCtx(name, khach), ngay: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` };
  return sanitizeName(fill(cfg.name_tpl, ctx)) + '.pdf';
}

export function parsePages(spec, n) {
  spec = (spec || '').trim();
  if (!spec) return [...Array(n).keys()];
  spec = spec.replace(/\s*-\s*/g, '-');
  const res = new Set();
  for (const part of spec.split(/[,;\s]+/)) {
    if (!part) continue;
    const low = part.toLowerCase();
    let a, b, m;
    if ((m = /^(cuoi|cuối|last)(\d+)$/.exec(low))) { a = Math.max(1, n - +m[2] + 1); b = n; }
    else if ((m = /^(\d+)?-(\d+)?$/.exec(low)) && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
    else if (/^\d+$/.test(low)) a = b = +low;
    else throw new Error(`Không hiểu '${part}'`);
    if (a > b) [a, b] = [b, a];
    for (let p = Math.max(1, a); p <= Math.min(n, b); p++) res.add(p - 1);
  }
  return [...res].sort((x, y) => x - y);
}

function hexRgb(h) {
  h = (h || '#b40000').replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0);
}
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
const FONT_STACK = 'Arial, "Segoe UI", Roboto, "Noto Sans", sans-serif';

// ---------------------------------------------------------------- nguồn tài liệu
async function pdfSource(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  return {
    count: doc.numPages,
    async size(i) { const p = await doc.getPage(i + 1); const v = p.getViewport({ scale: 1 }); return { w: v.width, h: v.height }; },
    async render(i, scale) {
      const p = await doc.getPage(i + 1);
      const v = p.getViewport({ scale });
      const c = newCanvas(v.width, v.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: g, viewport: v }).promise;
      p.cleanup();
      return c;
    },
    close() { doc.destroy(); },
  };
}

async function imageSource(blob) {
  const bmp = await createImageBitmap(blob);
  const land = bmp.width > bmp.height;
  const W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89;
  return {
    count: 1,
    async size() { return { w: W, h: H }; },
    async render(_i, scale) {
      const c = newCanvas(W * scale, H * scale);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      const m = 18 * scale, bw = c.width - 2 * m, bh = c.height - 2 * m;
      const r = Math.min(bw / bmp.width, bh / bmp.height);
      const w = bmp.width * r, h = bmp.height * r;
      g.drawImage(bmp, (c.width - w) / 2, (c.height - h) / 2, w, h);
      return c;
    },
    close() { bmp.close && bmp.close(); },
  };
}

async function docxSource(blob, onStatus) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:900px;background:#fff;';
  document.body.appendChild(host);
  onStatus && onStatus('Đang đọc file Word...');
  await renderDocx(blob, host, null, {
    inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false,
    ignoreWidth: false, ignoreHeight: false, experimental: true, renderHeaders: true, renderFooters: true,
  });
  const pages = [...host.querySelectorAll('section.docx')];
  if (!pages.length) { host.remove(); throw new Error('Không đọc được nội dung Word'); }
  const PX2PT = 0.75;
  const cache = new Map();
  const BASE = 2;
  return {
    count: pages.length,
    async size(i) { const r = pages[i].getBoundingClientRect(); return { w: r.width * PX2PT, h: r.height * PX2PT }; },
    async render(i, scale) {
      let c = cache.get(i);
      if (!c) {
        c = await html2canvas(pages[i], { scale: BASE, backgroundColor: '#ffffff', logging: false, useCORS: true });
        cache.set(i, c);
        if (cache.size > 3) cache.delete(cache.keys().next().value);
      }
      const r = pages[i].getBoundingClientRect();
      const out = newCanvas(r.width * PX2PT * scale, r.height * PX2PT * scale);
      out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
      return out;
    },
    close() { host.remove(); cache.clear(); },
  };
}

export function fileKind(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx') || n.endsWith('.docm')) return 'word';
  if (n.endsWith('.doc')) return 'doc-old';
  if (/\.(jpe?g|png|webp|bmp|gif|heic)$/.test(n)) return 'image';
  return null;
}

export async function openSource(file, onStatus) {
  const kind = fileKind(file.name);
  if (kind === 'pdf') {
    try { return await pdfSource(new Uint8Array(await file.arrayBuffer())); }
    catch (e) {
      if (String(e && e.name).includes('Password')) throw new Error('PDF có mật khẩu – hãy gỡ mật khẩu trước');
      throw e;
    }
  }
  if (kind === 'image') return imageSource(file);
  if (kind === 'word') return docxSource(file, onStatus);
  if (kind === 'doc-old') throw new Error('File .doc đời cũ: hãy lưu lại thành .docx hoặc xuất PDF rồi đưa vào');
  throw new Error('Định dạng không hỗ trợ');
}

// ---------------------------------------------------------------- lớp phủ
const overlayCache = new Map();
const noiseCache = new Map();

function setFont(g, px, bold = true) { g.font = `${bold ? 'bold ' : ''}${Math.max(4, px)}px ${FONT_STACK}`; }

function measureBlock(g, lines, px) {
  setFont(g, px);
  const w = Math.max(...lines.map(l => g.measureText(l).width), 1);
  const lh = px * 1.25;
  return { w, h: lh * lines.length, lh };
}

function drawBlock(g, lines, px, cx, cy) {
  const { h, lh } = measureBlock(g, lines, px);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, k) => g.fillText(l, cx, cy - h / 2 + lh * (k + 0.5)));
}

function placeXY(W, H, w, h, pos, m) {
  return { tl: [m, m], tr: [W - w - m, m], bl: [m, H - h - m], br: [W - w - m, H - h - m] }[pos] || [(W - w) / 2, (H - h) / 2];
}

async function buildOverlay(W, H, dpi, cfg, ctx) {
  const c = newCanvas(W, H);
  const g = c.getContext('2d');
  let drew = false;
  const margin = 0.35 * dpi;
  const text = fill(cfg.wm_text, ctx).trim();

  if (text && cfg.wm_mode !== 'none') {
    const lines = text.split('\n');
    const [r, gg, b] = hexRgb(cfg.wm_color);
    g.fillStyle = `rgba(${r},${gg},${b},${cfg.wm_opacity / 100})`;

    if (cfg.wm_mode === 'single') {
      const ang = Math.atan2(H, W);
      const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
      const diag = Math.hypot(W, H);
      let lo = 6, hi = 4000, best = 6;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const { w, h } = measureBlock(g, lines, mid);
        const ok = w * ca + h * sa <= W * 0.94 && w * sa + h * ca <= H * 0.94 && w <= diag * 0.9;
        if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      g.save(); g.translate(W / 2, H / 2); g.rotate(-ang);
      setFont(g, best); drawBlock(g, lines, best, 0, 0);
      g.restore();
    } else {
      const px = cfg.wm_size * dpi / 72;
      const { w, h } = measureBlock(g, lines, px);
      const gap = px * cfg.wm_spacing / 100;
      const su = w + gap + px * 0.3, sv = h + gap;
      const D = Math.hypot(W, H) / 2 + Math.max(w, h);
      const nu = Math.ceil(D / su) + 2, nv = Math.ceil(D / sv) + 2;
      g.save(); g.translate(W / 2, H / 2); g.rotate(-cfg.wm_angle * Math.PI / 180);
      setFont(g, px);
      for (let j = -nv; j <= nv; j++) {
        const off = j % 2 ? su / 2 : 0;
        for (let i = -nu; i <= nu; i++) drawBlock(g, lines, px, i * su + off, j * sv);
      }
      g.restore();
    }
    drew = true;
  }

  if (cfg.logo) {
    const lw = W * cfg.logo_scale / 100, lh = cfg.logo.height * lw / cfg.logo.width;
    const [x, y] = placeXY(W, H, lw, lh, cfg.logo_pos, margin);
    g.save(); g.globalAlpha = cfg.logo_opacity / 100; g.drawImage(cfg.logo, x, y, lw, lh); g.restore();
    drew = true;
  }

  const qt = fill(cfg.qr_text, ctx).trim();
  if (qt) {
    try {
      const s = Math.max(24, W * cfg.qr_scale / 100);
      const qc = document.createElement('canvas');
      await QRCode.toCanvas(qc, qt, { margin: 2, width: Math.round(s), errorCorrectionLevel: 'M' });
      const [x, y] = placeXY(W, H, s, s, cfg.qr_pos, margin);
      g.imageSmoothingEnabled = false;
      g.drawImage(qc, x, y, s, s);
      g.imageSmoothingEnabled = true;
      drew = true;
    } catch (e) { /* bỏ qua QR lỗi */ }
  }
  return drew ? c : null;
}

async function getOverlay(W, H, dpi, cfg, ctx) {
  const key = [W, H, dpi.toFixed(2), cfg.wm_mode, fill(cfg.wm_text, ctx), cfg.wm_color, cfg.wm_opacity, cfg.wm_size,
    cfg.wm_spacing, cfg.wm_angle, fill(cfg.qr_text, ctx), cfg.logo ? cfg.logo.__id : 0].join('|');
  if (overlayCache.has(key)) return overlayCache.get(key);
  if (overlayCache.size > 4) overlayCache.clear();
  const ov = await buildOverlay(W, H, dpi, cfg, ctx);
  overlayCache.set(key, ov);
  return ov;
}

function applyBlur(src, cfg, ctx, dpi) {
  const W = src.width, H = src.height;
  const f = Math.max(2, dpi / 18);
  const sm = newCanvas(W / f, H / f);
  const sg = sm.getContext('2d');
  sg.filter = `blur(${Math.max(0.5, cfg.blur_strength / 2)}px)`;
  sg.drawImage(src, 0, 0, sm.width, sm.height);
  const out = newCanvas(W, H);
  const g = out.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = 'low';
  g.drawImage(sm, 0, 0, W, H);

  const txt = fill(cfg.blur_text, ctx).trim();
  if (txt) {
    const lines = txt.split('\n');
    const px = 15 * dpi / 72;
    const { w, h } = measureBlock(g, lines, px);
    const pad = 0.25 * dpi;
    const x0 = (W - w) / 2 - pad, y0 = (H - h) / 2 - pad;
    g.fillStyle = '#fff';
    g.strokeStyle = cfg.wm_color; g.lineWidth = Math.max(2, dpi / 50);
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, w + pad * 2, h + pad * 2, pad / 2); else g.rect(x0, y0, w + pad * 2, h + pad * 2);
    g.fill(); g.stroke();
    g.fillStyle = '#282828';
    setFont(g, px); drawBlock(g, lines, px, W / 2, H / 2);
  }
  return out;
}

function drawHeaderFooter(g, W, H, cfg, ctx, dpi, outNo, outTotal) {
  const c = { ...ctx, trang: outNo, tong: outTotal };
  const m = 0.28 * dpi;
  const px = cfg.hf_size * dpi / 72;
  g.fillStyle = cfg.hf_color; g.textAlign = 'center';
  setFont(g, px, false);
  const ht = fill(cfg.header_text, c).trim(), ft = fill(cfg.footer_text, c).trim();
  if (ht) { g.textBaseline = 'top'; g.fillText(ht, W / 2, m); }
  if (ft) { g.textBaseline = 'bottom'; g.fillText(ft, W / 2, H - m); }
}

function addNoise(canvas, strength) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const key = `${W}x${H}x${strength}`;
  let n = noiseCache.get(key);
  if (!n) {
    if (noiseCache.size > 2) noiseCache.clear();
    n = new Int8Array(W * H);
    for (let i = 0; i < n.length; i++) {
      const gauss = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
      n[i] = Math.max(-127, Math.min(127, Math.round(gauss * strength)));
    }
    noiseCache.set(key, n);
  }
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0, p = 0; p < n.length; p++, i += 4) {
    const v = n[p];
    d[i] = Math.min(255, Math.max(0, d[i] + v));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + v));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + v));
  }
  g.putImageData(img, 0, 0);
}

export async function renderPage(src, idx, blurred, outNo, outTotal, cfg, ctx, dpi) {
  let c = await src.render(idx, dpi / 72);
  if (blurred) c = applyBlur(c, cfg, ctx, dpi);
  const g = c.getContext('2d', { willReadFrequently: cfg.noise > 0 });
  const ov = await getOverlay(c.width, c.height, dpi, cfg, ctx);
  if (ov) g.drawImage(ov, 0, 0);
  drawHeaderFooter(g, c.width, c.height, cfg, ctx, dpi, outNo, outTotal);
  if (cfg.noise > 0) addNoise(c, cfg.noise);
  return c;
}

export function planPages(cfg, n) {
  const keep = parsePages(cfg.page_spec, n);
  const keepset = new Set(keep);
  const blurMode = cfg.page_mode === 'blur' && keep.length < n;
  const order = blurMode ? [...Array(n).keys()] : keep;
  return { keep, keepset, blurMode, order };
}

const toJpeg = (c, q) => new Promise((res, rej) =>
  c.toBlob(b => (b ? b.arrayBuffer().then(a => res(new Uint8Array(a))) : rej(new Error('Lỗi tạo ảnh'))), 'image/jpeg', q / 100));

export async function processSource(src, outDoc, cfg, ctx, onProgress, isCancelled) {
  const n = src.count;
  const { keepset, order } = planPages(cfg, n);
  if (!order.length) throw new Error('Không có trang nào trong phạm vi đã chọn');
  let blurred = 0;
  for (let k = 0; k < order.length; k++) {
    if (isCancelled && isCancelled()) throw new Error('Đã hủy');
    const idx = order[k];
    const isBlur = !keepset.has(idx);
    if (isBlur) blurred++;
    const { w, h } = await src.size(idx);
    const c = await renderPage(src, idx, isBlur, k + 1, order.length, cfg, ctx, cfg.dpi);
    const jpg = await toJpeg(c, cfg.quality);
    c.width = c.height = 1;
    const img = await outDoc.embedJpg(jpg);
    const page = outDoc.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    onProgress && onProgress((k + 1) / order.length);
    await new Promise(r => setTimeout(r, 0));
  }
  return { pagesIn: n, pagesOut: order.length, blurred };
}

export async function newOutDoc() { return PDFDocument.create(); }

function randomPw(n = 14) {
  const al = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return [...a].map(x => al[x % al.length]).join('');
}

export async function finalizeDoc(doc, title, cfg) {
  doc.setTitle(title); doc.setAuthor(''); doc.setProducer(''); doc.setCreator(''); doc.setSubject(''); doc.setKeywords([]);
  if (cfg.block || cfg.user_pw) {
    const allow = !cfg.block;
    doc.encrypt({
      ownerPassword: randomPw(),
      userPassword: cfg.user_pw || '',
      permissions: {
        printing: allow ? 'highResolution' : false, modifying: allow, copying: allow, annotating: allow,
        fillingForms: allow, contentAccessibility: true, documentAssembly: allow,
      },
    });
  }
  return doc.save({ useObjectStreams: false });
}

export { pdfjs };
