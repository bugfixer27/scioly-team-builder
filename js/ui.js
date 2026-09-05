// Small DOM helpers shared by app.js and the views: escaping, toasts, modal dialogs, downloads.

export function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function h(strings, ...vals) { // tagged template that escapes interpolations unless wrapped in raw()
  return strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i] && vals[i].__raw ? vals[i].__raw : esc(vals[i])) : ''), '');
}
export function raw(html) { return { __raw: String(html) }; }
export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d)) return String(iso);
  return d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtClock(ms) { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now'; if (s < 90) return '1 min ago';
  const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
  const hr = Math.round(m / 60); return hr + (hr === 1 ? ' hour ago' : ' hours ago');
}

// ---- toasts ----
export function toast(message, kind = 'ok', opts = {}) {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span aria-hidden="true">${kind === 'error' ? '⚠' : '✓'}</span><div class="grow">${esc(message)}</div><button type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  wrap.appendChild(el);
  if (kind !== 'error' && !opts.sticky) setTimeout(() => el.remove(), opts.ms || 4000);
  return el;
}

// ---- modal (promise-based). buttons: [{label, value, kind:'primary'|'danger'|''}] ----
export function modal({ title, body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], cancelValue = null }) {
  const dlg = document.getElementById('modal');
  return new Promise(resolve => {
    dlg.innerHTML = `<form method="dialog"><div class="m-head"><h2>${esc(title)}</h2></div><div class="m-body">${body}</div><div class="m-foot"></div></form>`;
    const foot = dlg.querySelector('.m-foot');
    buttons.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn ' + (b.kind || ''); btn.textContent = b.label; btn.dataset.value = String(b.value);
      btn.onclick = () => { done(b.value); };
      foot.appendChild(btn);
    });
    let settled = false;
    function done(v) { if (settled) return; settled = true; dlg.oncancel = dlg.onclose = null; if (dlg.open) dlg.close(); resolve(v); }
    dlg.oncancel = e => { e.preventDefault(); done(cancelValue); };
    // `close` is dispatched asynchronously; ignore a stale one if a new modal has already been opened.
    dlg.onclose = () => { if (!dlg.open) done(cancelValue); };
    if (dlg.open) dlg.close();
    dlg.showModal();
    const primary = foot.querySelector('.primary') || foot.querySelector('button');
    if (primary) primary.focus();
  });
}
export function confirmDialog(title, bodyHtml, okLabel = 'Confirm', okKind = 'primary') {
  return modal({ title, body: bodyHtml, buttons: [{ label: 'Cancel', value: false }, { label: okLabel, value: true, kind: okKind }], cancelValue: false });
}
export function promptDialog(title, label, value = '') {
  const dlg = document.getElementById('modal');
  return new Promise(resolve => {
    dlg.innerHTML = `<form method="dialog"><div class="m-head"><h2>${esc(title)}</h2></div><div class="m-body"><label class="field">${esc(label)}<input class="input" name="v" maxlength="60" value="${esc(value)}"></label></div><div class="m-foot"><button type="button" class="btn" data-x="cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>`;
    const form = dlg.querySelector('form'); const input = form.querySelector('input');
    let settled = false; const done = v => { if (settled) return; settled = true; dlg.oncancel = dlg.onclose = null; if (dlg.open) dlg.close(); resolve(v); };
    form.onsubmit = e => { e.preventDefault(); done(input.value.trim()); };
    dlg.querySelector('[data-x=cancel]').onclick = () => done(null);
    dlg.oncancel = e => { e.preventDefault(); done(null); }; dlg.onclose = () => { if (!dlg.open) done(null); };
    if (dlg.open) dlg.close();
    dlg.showModal(); input.focus(); input.select();
  });
}

// ---- downloads / clipboard ----
export function download(filename, text, mime = 'application/octet-stream') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}

// ---- local storage (safe) ----
export const ls = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

// Position a popover element near an anchor, keeping it on screen.
export function placePopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  let left = r.left, top = r.bottom + 4;
  const w = pop.offsetWidth || 320, hgt = pop.offsetHeight || 380;
  if (left + w > innerWidth - 8) left = Math.max(8, innerWidth - w - 8);
  if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 4);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
