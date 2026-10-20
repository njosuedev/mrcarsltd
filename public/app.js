(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n || 0).toLocaleString('en-US');
  const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  let settings = {};
  let cars = [];
  let filter = 'All';

  const isNew = (c) => Date.now() - new Date(c.createdAt) < WEEK;
  const waLink = (text) => `https://wa.me/${settings.whatsapp}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  const telLink = () => 'tel:' + String(settings.phone || '').replace(/[^\d+]/g, '');

  function carMessage(car) {
    const title = [car.year, car.name].filter(Boolean).join(' ');
    const link = `${location.origin}/#car-${car.id}`;
    return `Hello ${settings.companyName}, I'm interested in the ${title}${car.colour ? ` (${car.colour})` : ''} listed at ${money(car.price)} RWF. Is it still available?\n${link}`;
  }


  // ---------- Header, visit section, footer ----------
  function renderSettings() {
    const name = settings.companyName;
    document.title = `${name} · Cars in stock`;
    $$('.js-company').forEach((el) => (el.textContent = name));
    $$('.js-address').forEach((el) => (el.textContent = settings.address));
    $$('.js-phone').forEach((el) => (el.textContent = settings.phone));
    $$('.js-intro').forEach((el) => (el.textContent = settings.intro));
    $$('.js-wa').forEach((el) => (el.href = waLink(`Hello ${name}, I'd like to ask about your cars.`)));
    $$('.js-tel').forEach((el) => (el.href = telLink()));
    $$('.js-map').forEach((el) => (el.href = settings.mapUrl || `https://maps.google.com/?q=${encodeURIComponent(settings.address)}`));
    const where = settings.address ? encodeURIComponent(settings.address) : '';
    $('#visitMap').innerHTML = where
      ? `<iframe title="Map to ${esc(name)}" src="https://maps.google.com/maps?q=${where}&z=15&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`
      : '';
    $('#visitMap').hidden = !where;
    $('#year').textContent = new Date().getFullYear();
    const d = new Date(settings.updatedAt);
    const t = $('#updated');
    t.dateTime = d.toISOString();
    t.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- Filters ----------
  function matchesChip(c, chip) {
    if (chip === 'All') return true;
    if (chip === 'New' || chip === 'Used') return c.condition === chip;
    return c.category === chip;
  }

  function renderChips() {
    const cats = [...new Set(cars.map((c) => c.category))].sort();
    const chips = ['All', ...cats];
    if (cars.some((c) => c.condition === 'New')) chips.push('New');
    if (cars.some((c) => c.condition === 'Used')) chips.push('Used');
    $('#chips').innerHTML = chips.map((c) => {
      const n = cars.filter((car) => matchesChip(car, c)).length;
      return `<button type="button" class="chip" role="tab" aria-selected="${c === filter}" data-chip="${esc(c)}">${esc(c)}<span class="count">${n}</span></button>`;
    }).join('');
  }

  function visibleCars() {
    const q = $('#search').value.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const list = cars.filter((c) => {
      if (!matchesChip(c, filter)) return false;
      const hay = [c.name, c.colour, c.category, c.year, c.condition, c.description].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const yearOf = (c) => parseInt(String(c.year).split(/\D+/).filter(Boolean).pop(), 10) || 0;
    const sorters = {
      recommended: (a, b) => (b.featured - a.featured) || (new Date(b.createdAt) - new Date(a.createdAt)),
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      'year-desc': (a, b) => yearOf(b) - yearOf(a),
    };
    return list.sort(sorters[$('#sort').value] || sorters.recommended);
  }

  // ---------- Cards ----------
  function mediaHtml(car) {
    if (car.images?.length) {
      return `<img src="${esc(car.images[0])}" alt="${esc(car.name)}" loading="lazy" decoding="async">
        ${car.images.length > 1 ? `<span class="photo-count">${icon('i-photos')}${car.images.length}</span>` : ''}`;
    }
    return carArt(car);
  }

  function cardHtml(car) {
    const sub = [car.year, car.category].filter(Boolean).join(' · ');
    return `
      <article class="card">
        <button type="button" class="media${car.images?.length ? '' : ' art'}" data-open="${car.id}" aria-label="View ${esc(car.name)}">
          ${mediaHtml(car)}
          ${isNew(car) && showJustIn ? '<span class="tag">Just in</span>' : ''}
        </button>
        <div class="card-body">
          ${sub ? `<p class="card-sub">${esc(sub)}</p>` : ''}
          <h2 class="card-title"><button type="button" data-open="${car.id}">${esc(car.name)}</button></h2>
          <ul class="card-specs">
            <li>${car.condition === 'New' ? 'New' : `${money(car.mileage)} km`}</li>
            ${car.colour ? `<li><span class="swatch" style="background:${esc(car.colourHex)}"></span>${esc(car.colour)}</li>` : ''}
            ${car.quantity > 1 ? `<li>${car.quantity} available</li>` : ''}
          </ul>
          <p class="price">
            ${car.priceFrom ? '<span class="price-from">From</span>' : ''}
            <span class="price-value">${money(car.price)}</span><span class="price-cur">RWF</span>
          </p>
          <a class="btn btn-line card-wa" href="${waLink(carMessage(car))}" target="_blank" rel="noopener">${icon('i-wa')}Ask on WhatsApp</a>
        </div>
      </article>`;
  }

  // "Just in" only means something when most of the stock is older
  let showJustIn = false;

  function renderGrid() {
    showJustIn = cars.filter(isNew).length <= cars.length / 2;
    const list = visibleCars();
    $('#grid').innerHTML = list.map(cardHtml).join('');
    $('#empty').hidden = list.length > 0;
    const prices = list.map((c) => c.price).filter((p) => p > 0);
    $('#resultCount').innerHTML = list.length
      ? `<b>${list.length}</b> ${list.length === 1 ? 'car' : 'cars'}${prices.length > 1 ? ` · from ${money(Math.min(...prices))} RWF` : ''}`
      : '';
  }

  function renderSkeleton() {
    $('#grid').innerHTML = Array.from({ length: 8 }, () => `
      <div class="card skeleton" aria-hidden="true">
        <div class="media"></div>
        <div class="card-body"><div class="sk" style="width:40%"></div><div class="sk" style="width:75%;height:18px"></div><div class="sk" style="width:60%"></div><div class="sk" style="width:50%;height:22px;margin-top:18px"></div></div>
      </div>`).join('');
  }

  // ---------- Details ----------
  let current = null;
  let photoIdx = 0;
  let lastFocus = null;

  function showPhoto(i) {
    const imgs = current.images || [];
    const stage = $('#mStage');
    if (!imgs.length) {
      stage.className = 'stage art';
      stage.innerHTML = carArt(current);
      $('#mPrev').hidden = $('#mNext').hidden = $('#mCount').hidden = true;
      return;
    }
    photoIdx = (i + imgs.length) % imgs.length;
    stage.className = 'stage';
    stage.innerHTML = `<img src="${esc(imgs[photoIdx])}" alt="${esc(current.name)}, photo ${photoIdx + 1} of ${imgs.length}">`;
    $('#mCount').textContent = `${photoIdx + 1} / ${imgs.length}`;
    $$('#mThumbs button').forEach((t, n) => t.setAttribute('aria-current', n === photoIdx));
    $$('#mThumbs button')[photoIdx]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const multi = imgs.length > 1;
    $('#mPrev').hidden = $('#mNext').hidden = $('#mCount').hidden = !multi;
    // Preload neighbours so swiping feels instant
    if (multi) [imgs[(photoIdx + 1) % imgs.length], imgs[(photoIdx - 1 + imgs.length) % imgs.length]].forEach((src) => { new Image().src = src; });
  }

  function openCar(id) {
    current = cars.find((c) => c.id === id);
    if (!current) return;
    const c = current;
    lastFocus = document.activeElement;
    $('#mMeta').textContent = [c.year, c.category].filter(Boolean).join(' · ');
    $('#mTitle').textContent = c.name;
    $('#mPrice').innerHTML = `${c.priceFrom ? '<small>From</small> ' : ''}${money(c.price)} <small>RWF</small>`;
    const stock = $('#mStock');
    stock.textContent = c.quantity > 1 ? `${c.quantity} in stock` : 'In stock';
    const specs = [
      ['Mileage', `${money(c.mileage)} km`],
      ['Condition', c.condition],
      ['Colour', c.colour ? `<span class="swatch" style="background:${esc(c.colourHex)}"></span>${esc(c.colour)}` : '—', true],
      ['Body type', c.category],
      ['Year', c.year || '—'],
      ['Listed', new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })],
    ];
    $('#mSpecs').innerHTML = specs.map(([k, v, raw]) => `<div><dt>${k}</dt><dd>${raw ? v : esc(v)}</dd></div>`).join('');
    $('#mDesc').textContent = c.description || '';
    $('#mWa').href = waLink(carMessage(c));
    $('#mThumbs').innerHTML = (c.images || []).length > 1
      ? c.images.map((src, i) => `<button type="button" data-thumb="${i}" aria-label="Photo ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')
      : '';
    showPhoto(0);
    $('#modal').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    $('.modal-close').focus();
    history.replaceState(null, '', '#car-' + c.id);
  }

  function closeModal() {
    if ($('#modal').hidden) return;
    $('#modal').hidden = true;
    document.documentElement.style.overflow = '';
    current = null;
    history.replaceState(null, '', location.pathname + location.search);
    lastFocus?.focus?.();
  }

  // Swipe between photos on touch screens
  let touchX = null;
  $('#mStage').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#mStage').addEventListener('touchend', (e) => {
    if (touchX === null || !current) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) showPhoto(photoIdx + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2200);
  }

  // ---------- Events ----------
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) return openCar(open.dataset.open);
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      filter = chip.dataset.chip;
      renderChips();
      renderGrid();
      return;
    }
    if (e.target.closest('[data-close]')) return closeModal();
    const thumb = e.target.closest('[data-thumb]');
    if (thumb) showPhoto(Number(thumb.dataset.thumb));
  });
  $('#mPrev').addEventListener('click', () => showPhoto(photoIdx - 1));
  $('#mNext').addEventListener('click', () => showPhoto(photoIdx + 1));
  document.addEventListener('keydown', (e) => {
    if ($('#modal').hidden) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#search').focus(); }
      return;
    }
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') showPhoto(photoIdx - 1);
    if (e.key === 'ArrowRight') showPhoto(photoIdx + 1);
    if (e.key === 'Tab') {
      // keep keyboard focus inside the dialog
      const f = $$('.modal-panel button:not([hidden]), .modal-panel a[href]').filter((el) => el.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  let searchTimer;
  $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderGrid, 120); });
  $('#sort').addEventListener('change', renderGrid);
  $('#resetFilters').addEventListener('click', () => {
    filter = 'All';
    $('#search').value = '';
    renderChips();
    renderGrid();
  });

  // Shadow under the toolbar once it sticks
  const toolbar = $('#toolbar');
  new IntersectionObserver(([e]) => toolbar.classList.toggle('stuck', e.intersectionRatio < 1), { threshold: [1], rootMargin: '-1px 0px 0px 0px' }).observe(toolbar);

  $('#shareBtn').addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) return await navigator.share({ title: document.title, text: `Cars in stock at ${settings.companyName}`, url });
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard');
    } catch { /* cancelled */ }
  });

  // Open a car from a shared link like /#car-<id>
  function openFromHash() {
    const m = location.hash.match(/^#car-(.+)$/);
    if (m && m[1] !== current?.id) openCar(m[1]);
  }

  // ---------- Load ----------
  renderSkeleton();
  fetch('/api/catalogue')
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data) => {
      settings = data.settings;
      cars = data.cars;
      renderSettings();
      renderChips();
      renderGrid();
      if (!cars.length) {
        $('#empty').hidden = false;
        $('#empty p').innerHTML = '<b>New stock is on the way.</b><br>Message us on WhatsApp to hear first when it arrives.';
        $('#resetFilters').hidden = true;
      }
      openFromHash();
      window.addEventListener('hashchange', openFromHash);
    })
    .catch(() => {
      $('#grid').innerHTML = '';
      $('#empty').hidden = false;
      $('#empty p').innerHTML = '<b>We couldn’t load the cars.</b><br>Check your connection and refresh the page.';
      $('#resetFilters').hidden = true;
    });
})();
