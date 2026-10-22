// Search engine and link-preview support: page titles, descriptions, preview images,
// structured data (schema.org), one address per car, sitemap.xml and robots.txt.
const fs = require('fs');
const path = require('path');

const SITE_URL = (process.env.SITE_URL || 'https://mrcarsltd.com').replace(/\/$/, '');
const TEMPLATE_FILE = path.join(__dirname, 'public', 'index.html');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-US');
const abs = (p) => (/^https?:/.test(p) ? p : SITE_URL + p);
// Safe to place inside <script>: no "</script>" or HTML comments can break out
const jsonForScript = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// /cars/2019-toyota-rav4-black-1a2b3c4d  (the last part is the start of the car's id)
function carPath(car) {
  const slug = slugify([car.year, car.name, car.colour].filter(Boolean).join(' '));
  return `/cars/${slug ? slug + '-' : ''}${String(car.id).slice(0, 8)}`;
}

function findCarByPath(cars, param) {
  const key = String(param).split('-').pop();
  if (!/^[0-9a-f]{8}$/i.test(key)) return null;
  return cars.find((c) => String(c.id).toLowerCase().startsWith(key.toLowerCase())) || null;
}

const carTitle = (car) => [car.year, car.name].filter(Boolean).join(' ');

function carDescription(car, s) {
  const facts = [
    car.condition === 'New' ? 'New' : `Used, ${money(car.mileage)} km`,
    car.colour,
    car.category,
    `${car.priceFrom ? 'from ' : ''}${money(car.price)} RWF`,
  ].filter(Boolean).join(' · ');
  const extra = car.description ? ' ' + car.description.replace(/\s+/g, ' ') : '';
  const text = `${carTitle(car)} for sale in Kigali at ${s.companyName}. ${facts}.${extra}`;
  return text.length > 300 ? text.slice(0, 297).replace(/\s+\S*$/, '') + '…' : text;
}

// ---------- schema.org structured data ----------
function dealerSchema(s) {
  return {
    '@type': 'AutoDealer',
    '@id': SITE_URL + '/#dealer',
    name: s.companyName,
    url: SITE_URL + '/',
    logo: abs('/brand/icon-512.png'),
    image: abs('/brand/logo-full.png'),
    telephone: s.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address,
      addressLocality: 'Kigali',
      addressCountry: 'RW',
    },
    areaServed: { '@type': 'Country', name: 'Rwanda' },
    ...(s.mapUrl ? { hasMap: s.mapUrl } : {}),
    currenciesAccepted: 'RWF',
  };
}

function carSchema(car, s) {
  const brand = String(car.name || '').trim().split(/\s+/)[0];
  const year = String(car.year || '').match(/\d{4}/)?.[0];
  return {
    '@type': 'Car',
    '@id': SITE_URL + carPath(car),
    name: carTitle(car),
    url: SITE_URL + carPath(car),
    description: car.description || carDescription(car, s),
    image: (car.images || []).map(abs),
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    ...(year ? { vehicleModelDate: year } : {}),
    ...(car.colour ? { color: car.colour } : {}),
    ...(car.category ? { bodyType: car.category } : {}),
    itemCondition: car.condition === 'New' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    mileageFromOdometer: { '@type': 'QuantitativeValue', value: Number(car.mileage) || 0, unitCode: 'KMT' },
    offers: {
      '@type': 'Offer',
      price: Number(car.price) || 0,
      priceCurrency: 'RWF',
      availability: car.quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: SITE_URL + carPath(car),
      seller: { '@id': SITE_URL + '/#dealer' },
    },
  };
}

// ---------- Page rendering ----------
let template = null;
function getTemplate() {
  if (!template || process.env.NODE_ENV !== 'production') template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  return template;
}

function headTags({ title, description, url, image, imageAlt, type = 'website', robots, schema }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    robots ? `<meta name="robots" content="${robots}">` : '',
    url ? `<link rel="canonical" href="${esc(url)}">` : '',
    `<meta property="og:site_name" content="MRCARS Ltd">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : '',
    `<meta property="og:image" content="${esc(image)}">`,
    imageAlt ? `<meta property="og:image:alt" content="${esc(imageAlt)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<script type="application/ld+json">${jsonForScript({ '@context': 'https://schema.org', '@graph': schema })}</script>`,
  ].filter(Boolean).join('\n  ');
}

// Plain HTML list of the cars, so search engines and link previews see real content
// before (or without) JavaScript. app.js replaces it with the interactive grid.
function staticList(cars) {
  if (!cars.length) return '';
  return `<ul class="seo-list">${cars.map((c) => `
      <li><a href="${carPath(c)}">${esc(carTitle(c))}</a>: ${c.condition === 'New' ? 'New' : `${money(c.mileage)} km`}${c.colour ? `, ${esc(c.colour)}` : ''}, ${c.priceFrom ? 'from ' : ''}${money(c.price)} RWF</li>`).join('')}
    </ul>`;
}

function renderPage({ settings: s, cars }, car = null, { notFound = false } = {}) {
  const listed = cars.map((c) => ({ ...c, url: carPath(c) }));
  const cheapest = Math.min(...cars.map((c) => c.price).filter((p) => p > 0));
  const homeDesc = `New and used cars for sale in Kigali, Rwanda at ${s.companyName}. ` +
    (cars.length ? `${cars.length} ${cars.length === 1 ? 'car' : 'cars'} in stock${Number.isFinite(cheapest) ? `, from ${money(cheapest)} RWF` : ''}. ` : '') +
    `See photos, prices and mileage, then call or WhatsApp ${s.phone}.`;

  const head = car
    ? headTags({
      title: `${carTitle(car)} for sale in Kigali · ${money(car.price)} RWF | ${s.companyName}`,
      description: carDescription(car, s),
      url: SITE_URL + carPath(car),
      image: car.images?.[0] ? abs(car.images[0]) : abs('/brand/icon-512.png'),
      imageAlt: carTitle(car),
      type: 'product',
      schema: [
        dealerSchema(s),
        carSchema(car, s),
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Cars for sale', item: SITE_URL + '/' },
            { '@type': 'ListItem', position: 2, name: carTitle(car), item: SITE_URL + carPath(car) },
          ],
        },
      ],
    })
    : headTags({
      title: notFound ? `Car not found | ${s.companyName}` : `${s.companyName} · New & used cars for sale in Kigali, Rwanda`,
      description: homeDesc,
      url: notFound ? null : SITE_URL + '/',
      image: cars[0]?.images?.[0] ? abs(cars[0].images[0]) : abs('/brand/icon-512.png'),
      robots: notFound ? 'noindex' : null,
      schema: [
        dealerSchema(s),
        { '@type': 'WebSite', '@id': SITE_URL + '/#website', name: s.companyName, url: SITE_URL + '/', publisher: { '@id': SITE_URL + '/#dealer' } },
        {
          '@type': 'ItemList',
          name: `Cars for sale at ${s.companyName}`,
          itemListElement: cars.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE_URL + carPath(c), name: carTitle(c) })),
        },
      ],
    });

  return getTemplate()
    // (functions as replacements, so a "$" in car text is kept as-is)
    .replace('<!--SEO_HEAD-->', () => head)
    .replace('<!--SEO_INTRO-->', () => esc(s.intro))
    // Address and phone in the plain HTML too
    .replaceAll('class="js-address"></', () => `class="js-address">${esc(s.address)}</`)
    .replaceAll('class="js-phone"></', () => `class="js-phone">${esc(s.phone)}</`)
    .replace('<!--SEO_LIST-->', () => staticList(cars))
    .replace('<!--CATALOGUE-->', () => `<script id="catalogue" type="application/json">${jsonForScript({ settings: s, cars: listed })}</script>`);
}

function sitemap({ settings: s, cars }) {
  const url = (loc, lastmod, images = []) => `  <url>
    <loc>${esc(loc)}</loc>${lastmod ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}${images.map((i) => `
    <image:image><image:loc>${esc(abs(i))}</image:loc></image:image>`).join('')}
  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[url(SITE_URL + '/', s.updatedAt), ...cars.map((c) => url(SITE_URL + carPath(c), c.updatedAt || c.createdAt, c.images || []))].join('\n')}
</urlset>
`;
}

const robots = () => `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`;

module.exports = { SITE_URL, carPath, findCarByPath, renderPage, sitemap, robots };
