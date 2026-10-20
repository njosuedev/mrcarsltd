(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n || 0).toLocaleString('en-US');
  const digits = (v) => String(v ?? '').replace(/\D/g, '');

  const COLOURS = [
    ['White', '#ffffff'], ['Black', '#16181c'], ['Silver', '#c4c8ce'], ['Grey', '#7d838c'],
    ['Blue', '#2a4f9e'], ['Red', '#b3261e'], ['Green', '#2f6b47'], ['Brown', '#6b4a32'], ['Beige', '#d8c7a8'],
  ];

  let cars = [];
  let settings = {};
  let view = 'all';
  let editing = null;
  let photos = []; // [{ url } | { file, preview }]

  async function api(url, opts = {}) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.endsWith('/login')) { showLogin(); throw new Error('Your session ended. Please sign in again.'); }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2400);
  }

  function lockScroll(on) { document.documentElement.style.overflow = on ? 'hidden' : ''; }

  // ---------- Views ----------
  function showLogin() {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    $('#loginForm [name=email]').focus();
  }

  async function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    const data = await api('/api/admin/cars');
    cars = data.cars;
    settings = data.settings;
    $$('.js-company').forEach((el) => (el.textContent = settings.companyName));
    renderCars();
    fillSettings();
    const me = await api('/api/me');
    setAccountEmail(me.email);
  }

  function setAccountEmail(email) {
    $('#accountEmail').textContent = email || '';
    $('#accountForm').elements.email.value = email || '';
  }

  // ---------- Stock table ----------
  const isLive = (c) => c.published && c.quantity > 0 && c.images?.length > 0;

  function statusOf(car) {
    if (car.quantity === 0) return ['sold', 'Sold out', 'Add stock to show it again'];
    if (!car.images?.length) return ['nophoto', 'No photos', 'Add at least one photo to show it on the website'];
    return car.published ? ['on', 'Live', 'Click to hide from the website'] : ['off', 'Hidden', 'Click to show on the website'];
  }

  // One line under the heading, e.g. "6 on the website · 12 units · 248,400,000 RWF in stock · 1 hidden or sold out"
  function renderSummary() {
    const el = $('#summary');
    if (!cars.length) { el.textContent = 'Cars you post here appear on the website straight away.'; return; }
    const live = cars.filter(isLive);
    const units = live.reduce((s, c) => s + c.quantity, 0);
    const value = live.reduce((s, c) => s + c.price * c.quantity, 0);
    const off = cars.length - live.length;
    const parts = [
      `<b>${live.length}</b> on the website`,
      `<b>${units}</b> ${units === 1 ? 'unit' : 'units'}`,
      `<b>${money(value)}</b> RWF in stock`,
    ];
    if (off) parts.push(`<b>${off}</b> hidden or sold out`);
    el.innerHTML = parts.join('<span class="sep">·</span>');
  }

  function thumbHtml(c) {
    return `<span class="thumb">${c.images?.length ? `<img src="${esc(c.images[0])}" alt="" loading="lazy">` : carArt(c)}</span>`;
  }

  function renderCars() {
    renderSummary();
    const q = $('#adminSearch').value.trim().toLowerCase();
    const list = cars.filter((c) => {
      if (view === 'live' && !isLive(c)) return false;
      if (view === 'off' && isLive(c)) return false;
      return !q || [c.name, c.year, c.colour, c.category, c.condition].join(' ').toLowerCase().includes(q);
    });

    const empty = $('#carsEmpty');
    if (!cars.length) {
      empty.innerHTML = '<b>No cars posted yet</b>Post your first car and it will appear on the website right away.<br><button class="btn btn-primary" type="button" data-add>Post a car</button>';
    } else if (!list.length) {
      empty.innerHTML = '<b>Nothing matches</b>Try a different search or filter.';
    }
    empty.hidden = list.length > 0;
    $('.cars-table thead').hidden = !list.length;

    $('#carsBody').innerHTML = list.map((c) => {
      const [cls, label, hint] = statusOf(c);
      const meta = [c.year, c.category, c.condition, c.colour].filter(Boolean).join(' · ');
      const photosTxt = c.images?.length ? `${c.images.length} photo${c.images.length > 1 ? 's' : ''}` : 'No photos';
      return `
        <tr data-id="${c.id}" class="${isLive(c) ? '' : 'is-off'}">
          <td><div class="car-cell">${thumbHtml(c)}<div class="t"><b>${esc(c.name)}${c.featured ? '<span class="feat">Featured</span>' : ''}</b><small>${esc(meta)}</small><small>${photosTxt}</small></div></div></td>
          <td class="r price-cell">${money(c.price)}${c.priceFrom ? '<small>starting price</small>' : ''}</td>
          <td><div class="stepper" role="group" aria-label="Units in stock">
            <button type="button" data-act="minus" aria-label="Remove one" ${c.quantity === 0 ? 'disabled' : ''}>−</button>
            <span>${c.quantity}</span>
            <button type="button" data-act="plus" aria-label="Add one">+</button>
          </div></td>
          <td><button type="button" class="status ${cls}" data-act="toggle" title="${hint}" ${c.quantity === 0 || !c.images?.length ? 'disabled' : ''}>${label}</button></td>
          <td><div class="row-actions">
            <button class="row-btn" type="button" data-act="edit">Edit</button>
            <button class="row-btn danger" type="button" data-act="delete">Delete</button>
          </div></td>
        </tr>`;
    }).join('');
  }

  async function patchCar(id, body) {
    const updated = await api(`/api/admin/cars/${id}`, json('PATCH', body));
    cars = cars.map((c) => (c.id === id ? updated : c));
    renderCars();
    return updated;
  }

  $('#carsBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('tr').dataset.id;
    const car = cars.find((c) => c.id === id);
    try {
      switch (btn.dataset.act) {
        case 'plus': await patchCar(id, { quantity: car.quantity + 1 }); break;
        case 'minus': {
          const u = await patchCar(id, { quantity: Math.max(0, car.quantity - 1) });
          if (u.quantity === 0) toast(`${u.name} marked as sold out`);
          break;
        }
        case 'toggle': {
          const u = await patchCar(id, { published: !car.published });
          toast(u.published ? `${u.name} is live on the website` : `${u.name} is now hidden`);
          break;
        }
        case 'edit': openForm(car); break;
        case 'delete':
          if (await confirmDelete(car)) {
            await api(`/api/admin/cars/${id}`, { method: 'DELETE' });
            cars = cars.filter((c) => c.id !== id);
            renderCars();
            toast(`${car.name} deleted`);
          }
          break;
      }
    } catch (err) { toast(err.message); }
  });

  $('#adminSearch').addEventListener('input', renderCars);
  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    $$('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderCars();
  }));

  // ---------- Confirm dialog ----------
  function confirmDelete(car) {
    return new Promise((resolve) => {
      const m = $('#confirmModal');
      $('#confirmText').textContent = `“${car.name}” and its ${car.images?.length || 0} photo(s) will be removed for good. To take it off the website for now, hide it instead.`;
      m.hidden = false;
      $('#confirmOk').focus();
      const done = (val) => {
        m.hidden = true;
        m.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onClick = (e) => {
        if (e.target.closest('#confirmOk')) done(true);
        else if (e.target.closest('[data-cancel]')) done(false);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      m.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);
    });
  }

  // ---------- Car form ----------
  const form = $('#carForm');

  $('#swatches').innerHTML = COLOURS.map(([n, h]) => `<button type="button" title="${n}" aria-label="${n}" data-colour="${n}" data-hex="${h}" style="background:${h}"></button>`).join('');
  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-colour]');
    if (!b) return;
    form.elements.colour.value = b.dataset.colour;
    form.elements.colourHex.value = b.dataset.hex;
  });
  form.elements.colour.addEventListener('change', () => {
    const match = COLOURS.find(([n]) => n.toLowerCase() === form.elements.colour.value.trim().toLowerCase());
    if (match) form.elements.colourHex.value = match[1];
  });

  // Show thousands separators while typing prices and mileage
  ['price', 'mileage'].forEach((name) => {
    const el = form.elements[name];
    el.addEventListener('input', () => {
      const d = digits(el.value);
      el.value = d ? money(d) : '';
      el.removeAttribute('aria-invalid');
    });
  });

  function openForm(car = null) {
    editing = car;
    form.reset();
    $('#carError').hidden = true;
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    $('#carFormTitle').textContent = car ? 'Edit car' : 'Post a car';
    $('#carSubmit').textContent = car ? 'Save changes' : 'Publish';
    const c = car || { quantity: 1, condition: 'Used', colourHex: '#ffffff', published: true };
    for (const el of form.elements) {
      if (!el.name || !(el.name in c)) continue;
      if (el.type === 'checkbox') el.checked = Boolean(c[el.name]);
      else if (el.name === 'price' || el.name === 'mileage') el.value = c[el.name] ? money(c[el.name]) : '';
      else el.value = c[el.name];
    }
    photos = (car?.images || []).map((url) => ({ url }));
    renderPhotos();
    $('#carModal').hidden = false;
    lockScroll(true);
    $('.drawer-body').scrollTop = 0;
    setTimeout(() => form.elements.name.focus(), 50);
  }

  function closeForm() {
    photos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    photos = [];
    $('#carModal').hidden = true;
    lockScroll(false);
  }

  function renderPhotos() {
    $('#photoGrid').innerHTML = photos.map((p, i) => `
      <div class="photo" draggable="true" data-i="${i}">
        <img src="${esc(p.url || p.preview)}" alt="Photo ${i + 1}">
        <div class="photo-btns">
          ${i > 0 ? `<button type="button" data-cover="${i}">Make cover</button>` : ''}
          <button type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}">Remove</button>
        </div>
      </div>`).join('');
  }

  // Phone photos are often 4-8 MB. Resize to 1920 px on the long side before upload,
  // so posting is quick on mobile data and the website loads fast.
  const MAX_SIDE = 1920;
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close(); return file; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      return file; // browser could not decode it; send the original
    }
  }

  async function addFiles(files) {
    let skipped = 0;
    const list = [...files].filter((f) => {
      const ok = /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 40 * 1024 * 1024;
      if (!ok) skipped++;
      return ok;
    });
    if (!list.length) { if (skipped) toast('Use JPG, PNG or WebP photos.'); return; }
    $('#carSubmit').disabled = true;
    const drop = $('#drop b');
    drop.textContent = `Preparing ${list.length} photo${list.length > 1 ? 's' : ''}…`;
    for (const original of list) {
      const file = await shrink(original);
      if (file.size > 10 * 1024 * 1024) { skipped++; continue; }
      photos.push({ file, preview: URL.createObjectURL(file) });
      renderPhotos();
    }
    drop.textContent = 'Add photos';
    $('#carSubmit').disabled = false;
    if (skipped) toast(`${skipped} file(s) skipped. Use JPG, PNG or WebP photos.`);
  }

  $('#photoInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });

  const grid = $('#photoGrid');
  grid.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    const cover = e.target.closest('[data-cover]');
    if (rm) {
      const [p] = photos.splice(Number(rm.dataset.remove), 1);
      if (p.preview) URL.revokeObjectURL(p.preview);
    } else if (cover) {
      photos.unshift(...photos.splice(Number(cover.dataset.cover), 1));
    } else return;
    renderPhotos();
  });

  // Drag photos to reorder
  let dragFrom = null;
  grid.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.photo');
    if (!el) return;
    dragFrom = Number(el.dataset.i);
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  });
  grid.addEventListener('dragover', (e) => {
    if (dragFrom === null) return;
    e.preventDefault();
    $$('.photo.over', grid).forEach((p) => p.classList.remove('over'));
    e.target.closest('.photo')?.classList.add('over');
  });
  grid.addEventListener('drop', (e) => {
    const el = e.target.closest('.photo');
    if (dragFrom === null || !el) return;
    e.preventDefault();
    const [p] = photos.splice(dragFrom, 1);
    photos.splice(Number(el.dataset.i), 0, p);
    dragFrom = null;
    renderPhotos();
  });
  grid.addEventListener('dragend', () => { dragFrom = null; renderPhotos(); });

  function validate() {
    const problems = [];
    if (!form.elements.name.value.trim()) { form.elements.name.setAttribute('aria-invalid', 'true'); problems.push('the make and model'); }
    if (!Number(digits(form.elements.price.value))) { form.elements.price.setAttribute('aria-invalid', 'true'); problems.push('a price'); }
    if (problems.length) {
      $('#carError').textContent = `Please add ${problems.join(' and ')}.`;
      $('#carError').hidden = false;
      form.querySelector('[aria-invalid="true"]').focus();
      return false;
    }
    return true;
  }
  form.elements.name.addEventListener('input', () => form.elements.name.removeAttribute('aria-invalid'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#carError').hidden = true;
    if (!validate()) return;

    const fd = new FormData();
    for (const el of form.elements) {
      if (!el.name) continue;
      let v = el.type === 'checkbox' ? String(el.checked) : el.value;
      if (el.name === 'price' || el.name === 'mileage') v = digits(v);
      fd.append(el.name, v);
    }
    // Final photo order: existing URLs, plus "new:N" for each uploaded file
    let n = 0;
    const order = photos.map((p) => {
      if (p.url) return p.url;
      fd.append('images', p.file);
      return 'new:' + n++;
    });
    fd.append('order', JSON.stringify(order));

    const btn = $('#carSubmit');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = n ? `Uploading ${n} photo${n > 1 ? 's' : ''}…` : 'Saving…';
    try {
      const url = editing ? `/api/admin/cars/${editing.id}` : '/api/admin/cars';
      const saved = await api(url, { method: editing ? 'PUT' : 'POST', body: fd });
      cars = editing ? cars.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...cars];
      if (saved.published && !saved.images.length) toast(`${saved.name} saved. Add a photo to show it on the website.`);
      else toast(editing ? 'Changes saved' : `${saved.name} is now ${saved.published ? 'live' : 'saved as hidden'}`);
      closeForm();
      renderCars();
    } catch (err) {
      $('#carError').textContent = err.message;
      $('#carError').hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  $('#carModal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeForm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#carModal').hidden && $('#confirmModal').hidden) closeForm(); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-add]')) openForm(); });
  $('#addCarBtn').addEventListener('click', () => openForm());

  // ---------- Business details ----------
  function fillSettings() {
    for (const el of $('#settingsForm').elements) if (el.name in settings) el.value = settings[el.name];
  }

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    try {
      settings = await api('/api/admin/settings', json('PUT', Object.fromEntries(new FormData(e.target))));
      $$('.js-company').forEach((el) => (el.textContent = settings.companyName));
      fillSettings();
      toast('Business details saved');
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  });

  // ---------- Sign-in details ----------
  $('#accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const err = $('#accountError');
    err.hidden = true;
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (f.newPassword.value && f.newPassword.value.length < 8) return fail('New password must be at least 8 characters.');
    if (f.newPassword.value !== f.confirmPassword.value) return fail('The two new passwords do not match.');
    if (!f.currentPassword.value) return fail('Enter your current password to confirm.');
    const btn = e.submitter;
    btn.disabled = true;
    try {
      const r = await api('/api/admin/account', json('PUT', {
        email: f.email.value, newPassword: f.newPassword.value || undefined, currentPassword: f.currentPassword.value,
      }));
      setAccountEmail(r.email);
      f.newPassword.value = f.confirmPassword.value = f.currentPassword.value = '';
      toast('Sign-in details updated');
    } catch (ex) { fail(ex.message); }
    btn.disabled = false;
  });

  $('.pw-toggle').addEventListener('click', (e) => {
    const input = e.target.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.target.textContent = show ? 'Hide' : 'Show';
    e.target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  // ---------- Tabs ----------
  function showTab(name) {
    if (!$(`[data-panel="${name}"]`)) name = 'cars';
    $$('.tab').forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === name));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    showTab(t.dataset.tab);
    history.replaceState(null, '', t.dataset.tab === 'cars' ? location.pathname : '#' + t.dataset.tab);
  }));
  showTab(location.hash.slice(1));

  // ---------- Auth ----------
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    err.hidden = true;
    const btn = e.submitter;
    btn.disabled = true;
    try {
      await api('/api/login', json('POST', { email: e.target.email.value, password: e.target.password.value }));
      e.target.reset();
      await showApp();
    } catch (ex) {
      err.textContent = ex.message === 'Wrong email or password' ? 'That email or password is not correct.' : ex.message;
      err.hidden = false;
      e.target.password.select();
    }
    btn.disabled = false;
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
  });

  fetch('/api/me').then((r) => (r.ok ? showApp() : showLogin())).catch(showLogin);
})();
