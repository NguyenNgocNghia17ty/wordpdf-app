import {
  normalizeUi, uiToCfg, pushHistory, encodeSync, decodeSync, mergeSync, makeCtx, outName, planPages,
  openSource, renderPage, processSource, newOutDoc, finalizeDoc, fileKind,
  STYLE_OPTS, STRENGTH_OPTS, QUALITY_OPTS, PAGES_OPTS, COLOR_OPTS,
} from './engine.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const $ = id => document.getElementById(id);
const LS_UI = 'wpdf_ui', LS_LOGO = 'wpdf_logo', LS_LOGO_NAME = 'wpdf_logo_name';
const native = Capacitor.isNativePlatform();

let ui = normalizeUi(safeJson(localStorage.getItem(LS_UI)));
let files = [];          // {id, file, kind, status, cls}
let selected = null;
let running = false, cancelled = false;
let logoBitmap = null;
let pv = { page: 1, total: 0, src: null, srcId: null, req: 0, timer: null };
let idSeq = 1;

function safeJson(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
function save() { try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch { /* đầy bộ nhớ */ } }
function toast(t, ms = 2200) {
  const el = $('toast'); el.textContent = t; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// ------------------------------------------------------------ dựng giao diện
const SEGS = { style: STYLE_OPTS, strength: STRENGTH_OPTS, quality: QUALITY_OPTS, pages: PAGES_OPTS };

function buildSegs() {
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.key;
    seg.innerHTML = '';
    for (const [val, label] of SEGS[key]) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.val = val;
      b.onclick = () => { ui[key] = val; changed(); };
      seg.appendChild(b);
    }
  });
  const cw = $('colors');
  cw.innerHTML = '';
  for (const [col, name] of COLOR_OPTS) {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = col; b.title = name; b.dataset.val = col;
    b.onclick = () => { ui.color = col; changed(); };
    cw.appendChild(b);
  }
}

function renderChips(boxId, list, inputId, key) {
  const box = $(boxId);
  box.innerHTML = '';
  for (const v of list) {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'chip'; c.textContent = v.replace(/\n/g, ' · ');
    c.onclick = () => { $(inputId).value = v; ui[key] = v; changed(); };
    box.appendChild(c);
  }
}

function refreshUi() {
  document.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === ui[seg.dataset.key]));
  });
  $('colors').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val.toLowerCase() === String(ui.color).toLowerCase()));
  $('firstBox').classList.toggle('off', ui.pages !== 'first');
  renderChips('wmHist', ui.wm_history.filter(x => x !== ui.wm_text), 'wmText', 'wm_text');
  renderChips('khHist', ui.khach_history.filter(x => x !== ui.khach), 'khach', 'khach');
}

const FIELDS = [
  ['wmText', 'wm_text'], ['khach', 'khach'], ['firstN', 'first_n'], ['qrText', 'qr_text'], ['footerText', 'footer_text'],
  ['blurText', 'blur_text'], ['userPw', 'user_pw'], ['nameTpl', 'name_tpl'],
];
const CHECKS = [['blurRest', 'blur_rest'], ['protect', 'protect'], ['antiocr', 'antiocr'], ['merge', 'merge']];

function loadFields() {
  for (const [id, k] of FIELDS) $(id).value = ui[k] ?? '';
  for (const [id, k] of CHECKS) $(id).checked = !!ui[k];
  refreshUi();
}

function bindFields() {
  for (const [id, k] of FIELDS) {
    $(id).addEventListener('input', () => {
      ui[k] = k === 'first_n' ? Math.max(1, parseInt($(id).value, 10) || 1) : $(id).value;
      changed(false);
    });
  }
  for (const [id, k] of CHECKS) $(id).addEventListener('change', () => { ui[k] = $(id).checked; changed(); });
  document.querySelectorAll('.stepper button').forEach(b => b.onclick = () => {
    ui.first_n = Math.max(1, (parseInt(ui.first_n, 10) || 1) + +b.dataset.d);
    $('firstN').value = ui.first_n; changed();
  });
}

function changed(full = true) {
  save();
  if (full) refreshUi(); else { $('firstBox').classList.toggle('off', ui.pages !== 'first'); }
  schedulePreview();
}

// ------------------------------------------------------------ file
$('fileInput').addEventListener('change', e => {
  const list = [...e.target.files];
  e.target.value = '';
  let bad = 0;
  for (const f of list) {
    const kind = fileKind(f.name);
    if (!kind) { bad++; continue; }
    files.push({ id: idSeq++, file: f, kind, status: kind === 'doc-old' ? 'File .doc cũ – hãy lưu thành .docx' : 'Chờ', cls: kind === 'doc-old' ? 'err' : '' });
  }
  if (bad) toast(`Bỏ qua ${bad} file không hỗ trợ`);
  if (!selected && files.length) selected = files[0];
  renderFiles(); schedulePreview(50);
});

const ICON = { pdf: '📕', word: '📄', image: '🖼', 'doc-old': '⚠️' };
function renderFiles() {
  const box = $('fileList');
  box.innerHTML = '';
  for (const f of files) {
    const row = document.createElement('div');
    row.className = 'file' + (f === selected ? ' sel' : '');
    row.innerHTML = `<div class="ic">${ICON[f.kind]}</div><div class="nm"><b></b><small class="${f.cls}"></small></div><button class="x" type="button">✕</button>`;
    row.querySelector('b').textContent = f.file.name;
    row.querySelector('small').textContent = f.status;
    row.onclick = () => { if (selected !== f) { selected = f; pv.page = 1; renderFiles(); schedulePreview(30); } };
    row.querySelector('.x').onclick = ev => {
      ev.stopPropagation();
      if (running) return;
      files = files.filter(x => x !== f);
      if (selected === f) { selected = files[0] || null; pv.page = 1; }
      renderFiles(); schedulePreview(30);
    };
    box.appendChild(row);
  }
  $('previewCard').hidden = !selected;
}
function setStatus(f, text, cls = '') { f.status = text; f.cls = cls; renderFiles(); }

// ------------------------------------------------------------ logo
async function loadLogoFromStorage() {
  const d = localStorage.getItem(LS_LOGO);
  if (!d) return;
  try {
    const blob = await (await fetch(d)).blob();
    logoBitmap = await createImageBitmap(blob);
    logoBitmap.__id = Date.now();
    $('logoName').textContent = localStorage.getItem(LS_LOGO_NAME) || 'logo';
  } catch { localStorage.removeItem(LS_LOGO); }
}
$('logoInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const bmp = await createImageBitmap(f);
  // thu nhỏ để lưu bộ nhớ
  const s = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = bmp.width * s; c.height = bmp.height * s;
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  try { localStorage.setItem(LS_LOGO, c.toDataURL('image/png')); localStorage.setItem(LS_LOGO_NAME, f.name); } catch { /* bỏ qua */ }
  logoBitmap = await createImageBitmap(c); logoBitmap.__id = Date.now();
  $('logoName').textContent = f.name;
  schedulePreview();
});
$('logoClear').onclick = () => {
  logoBitmap = null; localStorage.removeItem(LS_LOGO); $('logoName').textContent = 'Không có'; schedulePreview();
};

function currentCfg() { const c = uiToCfg(ui); c.logo = logoBitmap; return c; }

// ------------------------------------------------------------ xem trước
function schedulePreview(ms = 400) { clearTimeout(pv.timer); pv.timer = setTimeout(doPreview, ms); }

async function getPreviewSource(f) {
  if (pv.srcId === f.id && pv.src) return pv.src;
  if (pv.src) { try { pv.src.close(); } catch { /* */ } }
  pv.src = null; pv.srcId = null;
  const s = await openSource(f.file, t => { $('pvInfo').textContent = t; });
  pv.src = s; pv.srcId = f.id;
  return s;
}

async function doPreview() {
  if (!selected || running) return;
  if (selected.kind === 'doc-old') { $('pvInfo').textContent = 'File .doc đời cũ không xem được – hãy lưu thành .docx'; return; }
  const req = ++pv.req;
  const box = $('pvBusy').parentElement;
  box.classList.add('busy');
  try {
    const src = await getPreviewSource(selected);
    if (req !== pv.req) return;
    const cfg = currentCfg();
    const n = src.count;
    pv.total = n; pv.page = Math.max(1, Math.min(n, pv.page));
    const idx = pv.page - 1;
    let plan;
    try { plan = planPages(cfg, n); } catch { plan = planPages({ ...cfg, page_spec: '' }, n); }
    const blurred = plan.blurMode && !plan.keepset.has(idx);
    const dropped = !plan.blurMode && !plan.keepset.has(idx);
    const outNo = Math.max(1, plan.order.indexOf(idx) + 1);
    const { w } = await src.size(idx);
    const cssW = Math.min(box.clientWidth - 20, 560);
    const dpi = Math.max(30, (cssW * (window.devicePixelRatio || 1)) / (w / 72));
    const c = await renderPage(src, idx, blurred, outNo, plan.order.length, cfg, makeCtx(selected.file.name, ui.khach), dpi);
    if (req !== pv.req) return;
    const out = $('pv');
    out.width = c.width; out.height = c.height;
    const g = out.getContext('2d');
    g.drawImage(c, 0, 0);
    if (dropped) {
      g.fillStyle = '#000a'; g.fillRect(0, 0, out.width, out.height);
      g.fillStyle = '#ff6b6b'; g.font = `bold ${out.width / 10}px sans-serif`; g.textAlign = 'center';
      g.fillText('SẼ BỊ BỎ', out.width / 2, out.height / 2);
    }
    out.style.width = cssW + 'px';
    $('pvLbl').textContent = `Trang ${pv.page} / ${n}`;
    $('pvInfo').textContent = blurred ? 'Trang này sẽ bị làm mờ' : dropped ? 'Trang này sẽ bị bỏ khỏi file xuất'
      : `File xuất có ${plan.order.length} trang` + (plan.blurMode ? ` (${plan.order.length - plan.keep.length} trang mờ)` : '');
  } catch (e) {
    if (req === pv.req) $('pvInfo').textContent = 'Không xem trước được: ' + (e.message || e);
  } finally {
    if (req === pv.req) box.classList.remove('busy');
  }
}
$('pvPrev').onclick = () => { if (pv.page > 1) { pv.page--; schedulePreview(20); } };
$('pvNext').onclick = () => { if (pv.page < pv.total) { pv.page++; schedulePreview(20); } };
window.addEventListener('resize', () => schedulePreview(300));

// ------------------------------------------------------------ lưu & chia sẻ
function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function saveOutput(name, bytes) {
  if (native) {
    const data = bytesToB64(bytes);
    try {
      const r = await Filesystem.writeFile({ path: `WordPDF/${name}`, data, directory: Directory.Documents, recursive: true });
      return { uri: r.uri, where: 'Tài liệu (Documents) › WordPDF' };
    } catch (e) {
      const r = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache, recursive: true });
      return { uri: r.uri, where: 'bộ nhớ tạm – hãy bấm Chia sẻ để lưu' };
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  return { url, where: 'Tải về' };
}

async function shareOutput(r) {
  try {
    if (native) await Share.share({ title: r.name, files: [r.uri], dialogTitle: 'Gửi file PDF' });
    else if (navigator.canShare && navigator.canShare({ files: [new File([r.bytes], r.name, { type: 'application/pdf' })] })) {
      await navigator.share({ files: [new File([r.bytes], r.name, { type: 'application/pdf' })], title: r.name });
    } else downloadOutput(r);
  } catch (e) { if (!String(e).includes('cancel')) toast('Không chia sẻ được: ' + (e.message || e)); }
}
async function autoShare(list) {
  try {
    if (native) {
      await Share.share({ title: list.length === 1 ? list[0].name : `${list.length} file PDF`, files: list.map(r => r.uri), dialogTitle: 'Gửi file PDF qua…' });
    } else {
      const fs = list.map(r => new File([r.bytes], r.name, { type: 'application/pdf' }));
      if (navigator.canShare && navigator.canShare({ files: fs })) await navigator.share({ files: fs });
      else toast('Xong! Bấm “Chia sẻ” để gửi', 3000);
    }
  } catch (e) {
    if (!/cancel/i.test(String(e && (e.message || e)))) toast('Xong! Bấm “Gửi / Mở” để gửi lại', 3000);
  }
}
function downloadOutput(r) {
  if (native) { toast('Đã lưu ở ' + r.where, 3000); return; }
  const a = document.createElement('a'); a.href = r.url; a.download = r.name; a.click();
}

function addResult(r) {
  $('results').hidden = false;
  const row = document.createElement('div');
  row.className = 'res';
  row.innerHTML = `<div class="nm"><b></b><small></small></div><button class="btn" type="button">${native ? 'Gửi / Mở' : 'Chia sẻ'}</button>`;
  row.querySelector('b').textContent = r.name;
  row.querySelector('small').textContent = `${(r.bytes.length / 1048576).toFixed(1)} MB · ${r.pages} trang · ${r.where}`;
  row.querySelector('.btn').onclick = () => shareOutput(r);
  if (!native) {
    const d = document.createElement('button'); d.className = 'btn'; d.type = 'button'; d.textContent = 'Tải'; d.onclick = () => downloadOutput(r);
    row.appendChild(d);
  }
  $('resList').prepend(row);

}

// ------------------------------------------------------------ chạy
function progress(frac, text) {
  $('progBar').style.width = `${Math.round(frac * 100)}%`;
  if (text) $('status').textContent = text;
}

$('goBtn').onclick = async () => {
  if (running) return;
  const jobs = files.filter(f => f.kind !== 'doc-old');
  if (!jobs.length) { toast('Chọn file trước nhé'); return; }
  if (!ui.wm_text.trim() && ui.style !== 'none' && !logoBitmap && !confirm('Chưa nhập chữ watermark. Vẫn chuyển?')) return;

  ui.wm_history = pushHistory(ui.wm_history, ui.wm_text);
  ui.khach_history = pushHistory(ui.khach_history, ui.khach);
  save(); refreshUi();

  running = true; cancelled = false;
  $('goBtn').disabled = true; $('goBtn').textContent = 'ĐANG CHUYỂN...';
  $('cancelBtn').hidden = false;
  if (pv.src) { try { pv.src.close(); } catch { /* */ } pv.src = null; pv.srcId = null; }

  const cfg = currentCfg();
  const t0 = performance.now();
  let ok = 0, merged = null, mergedPages = 0;
  const made = [];
  try {
    if (cfg.merge) merged = await newOutDoc();
    for (let i = 0; i < jobs.length; i++) {
      if (cancelled) break;
      const f = jobs[i];
      const base = i / jobs.length, span = 1 / jobs.length;
      let src = null;
      try {
        setStatus(f, f.kind === 'word' ? 'Đang đọc Word...' : 'Đang mở...', 'run');
        progress(base, `${i + 1}/${jobs.length} · ${f.file.name}`);
        src = await openSource(f.file, t => setStatus(f, t, 'run'));
        setStatus(f, 'Đang tạo trang ảnh...', 'run');
        const doc = merged || await newOutDoc();
        const info = await processSource(src, doc, cfg, makeCtx(f.file.name, ui.khach),
          p => progress(base + span * p * 0.95, `${i + 1}/${jobs.length} · ${f.file.name} · ${Math.round(p * 100)}%`),
          () => cancelled);
        if (merged) { mergedPages += info.pagesOut; setStatus(f, `✓ ${info.pagesOut} trang · chờ ghép`, 'ok'); }
        else {
          const name = outName(f.file.name, cfg, ui.khach);
          const bytes = await finalizeDoc(doc, name.replace(/\.pdf$/, ''), cfg);
          const r = { name, bytes, pages: info.pagesOut, ...(await saveOutput(name, bytes)) };
          addResult(r);
          made.push(r);
          setStatus(f, `✓ Xong · ${info.pagesOut} trang${info.blurred ? `, ${info.blurred} mờ` : ''} · ${(bytes.length / 1048576).toFixed(1)} MB`, 'ok');
        }
        ok++;
      } catch (e) {
        setStatus(f, '✕ ' + (e.message || e), 'err');
      } finally {
        if (src) try { src.close(); } catch { /* */ }
      }
    }
    if (merged && ok && !cancelled) {
      progress(0.98, 'Đang ghép file...');
      const name = (ui.khach ? ui.khach.replace(/[\\/:*?"<>|]+/g, '_') + '_' : '') + 'tong_hop.pdf';
      const bytes = await finalizeDoc(merged, name.replace(/\.pdf$/, ''), cfg);
      const r = { name, bytes, pages: mergedPages, ...(await saveOutput(name, bytes)) };
      addResult(r);
      made.push(r);
    }
  } finally {
    running = false;
    $('goBtn').disabled = false; $('goBtn').textContent = 'CHUYỂN ĐỔI';
    $('cancelBtn').hidden = true;
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    progress(cancelled ? 0 : 1, cancelled ? 'Đã hủy' : `Xong ${ok}/${jobs.length} file · ${dt}s`);
    if (ok && !cancelled) $('results').scrollIntoView({ behavior: 'smooth' });
    schedulePreview(300);
  }
  // Xong là tự bật bảng chia sẻ (Zalo, Messenger, Drive...) với tất cả file vừa tạo
  if (made.length && !cancelled) await autoShare(made);
};
$('cancelBtn').onclick = () => { cancelled = true; $('status').textContent = 'Đang hủy...'; };

// ------------------------------------------------------------ đồng bộ
let scanStream = null, scanTimer = null;
$('syncBtn').onclick = async () => {
  $('syncIn').value = '';
  const code = encodeSync(ui);
  await QRCode.toCanvas($('syncQr'), code, { margin: 1, width: 260, errorCorrectionLevel: 'L' });
  $('syncDlg').showModal();
};
function stopScan() {
  clearInterval(scanTimer); scanTimer = null;
  if (scanStream) scanStream.getTracks().forEach(t => t.stop());
  scanStream = null; $('scanBox').hidden = true;
}
$('syncClose').onclick = () => { stopScan(); $('syncDlg').close(); };
function importCode(code) {
  try {
    const inc = decodeSync(code);
    ui = mergeSync(ui, inc); save(); loadFields(); schedulePreview();
    stopScan(); $('syncDlg').close();
    toast('Đã nhận cài đặt ✓');
    return true;
  } catch (e) { toast(e.message || String(e)); return false; }
}
$('syncImport').onclick = () => importCode($('syncIn').value);
$('syncCopy').onclick = async () => {
  const code = encodeSync(ui);
  try { await navigator.clipboard.writeText(code); toast('Đã sao chép mã'); }
  catch { $('syncIn').value = code; $('syncIn').select(); toast('Mã đã hiện trong ô trên – hãy sao chép'); }
};
$('scanBtn').onclick = async () => {
  if (scanStream) { stopScan(); return; }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) { toast('Không mở được camera – hãy dùng cách dán mã'); return; }
  const v = $('scanVideo'); v.srcObject = scanStream; await v.play();
  $('scanBox').hidden = false;
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  const detector = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  scanTimer = setInterval(async () => {
    if (!v.videoWidth) return;
    try {
      if (detector) {
        const r = await detector.detect(v);
        if (r[0] && r[0].rawValue.includes('WPDF1.')) importCode(r[0].rawValue);
        return;
      }
      c.width = v.videoWidth; c.height = v.videoHeight; g.drawImage(v, 0, 0);
      const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (r && r.data.includes('WPDF1.')) importCode(r.data);
    } catch { /* tiếp tục quét */ }
  }, 300);
};

$('resetBtn').onclick = () => {
  if (!confirm('Đưa mọi lựa chọn về mặc định? (Chữ watermark đã dùng vẫn giữ)')) return;
  ui = normalizeUi({ wm_history: ui.wm_history, khach_history: ui.khach_history, wm_text: ui.wm_text });
  save(); loadFields(); schedulePreview();
};

// ------------------------------------------------------------ khởi động
buildSegs();
bindFields();
loadFields();
loadLogoFromStorage().then(() => schedulePreview());
renderFiles();
