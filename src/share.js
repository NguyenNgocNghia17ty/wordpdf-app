// Nhận file được chia sẻ từ app khác (Zalo, Drive, quản lý file...) hoặc "Mở bằng WordPDF"
import { Capacitor, registerPlugin } from '@capacitor/core';

const ShareIn = Capacitor.isNativePlatform() ? registerPlugin('ShareIn') : null;

function toast(t) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = t; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

export function injectFiles(files) {
  if (!files.length) return;
  const input = document.getElementById('fileInput');
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let busy = false;
async function take() {
  if (!ShareIn || busy) return;
  busy = true;
  try {
    const res = await ShareIn.take();
    const list = (res && res.files) || [];
    const got = [];
    for (const it of list) {
      try {
        const r = await fetch(Capacitor.convertFileSrc('file://' + it.path));
        const blob = await r.blob();
        got.push(new File([blob], it.name, { type: it.mime || blob.type }));
      } catch (e) { /* bỏ qua file lỗi */ }
    }
    if (got.length) { injectFiles(got); toast(`Đã nhận ${got.length} file`); }
    else if (list.length) toast('Không đọc được file được chia sẻ');
  } catch (e) {
    toast('Không nhận được file: ' + (e.message || e));
  } finally {
    busy = false;
  }
}

if (ShareIn) {
  ShareIn.addListener('shared', () => take());
  document.addEventListener('resume', () => take());
  take();
}
window.__wpdfInject = injectFiles;
