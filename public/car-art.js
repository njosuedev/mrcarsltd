// Side-view illustration used when a car has no photos yet.
// The body is painted in the car's colour so each listing still looks distinct.
(function () {
  const SHAPES = {
    suv: {
      body: 'M14 96V56c0-6 3-10 8-12l14-16c3-3 6-4 11-4h175c8 0 14 3 18 8l26 28 30 4c8 2 12 8 12 16v16c0 5-3 8-8 8h-36a22 22 0 0 0-44 0H100a22 22 0 0 0-44 0H20c-4 0-6-3-6-8z',
      glass: ['M46 32h56v28H28l10-20c2-5 5-8 8-8z', 'M110 32h62v28h-62z', 'M180 32h42c6 0 10 2 13 6l21 22h-76z'],
      door: 'M176 62v32M106 62v32',
      wheels: [78, 242],
    },
    sedan: {
      body: 'M12 96v-12c0-6 4-10 12-12l48-6 40-26c6-4 12-6 20-6h74c8 0 14 2 20 6l36 24 36 6c8 2 12 8 12 16v10c0 5-3 8-8 8h-36a22 22 0 0 0-44 0H98a22 22 0 0 0-44 0H18c-4 0-6-3-6-8z',
      glass: ['M118 42h46v22H82z', 'M172 42h38c6 0 10 2 14 5l22 17h-74z'],
      door: 'M168 66v28',
      wheels: [76, 244],
    },
    pickup: {
      body: 'M12 98V70h116V40c0-6 4-10 10-10h72c8 0 14 3 18 8l28 24 38 4c10 2 16 8 16 18v14c0 4-3 6-8 6h-34a22 22 0 0 0-44 0H102a22 22 0 0 0-44 0H18c-4 0-6-2-6-6z',
      glass: ['M138 38h38v24h-38z', 'M184 38h28c4 0 8 2 10 5l18 19h-56z'],
      door: 'M180 64v30',
      wheels: [80, 246],
    },
  };

  function shapeFor(category) {
    const c = String(category || '').toLowerCase();
    if (/sedan|saloon|hatch|coupe|compact/.test(c)) return 'sedan';
    if (/pick|truck|double cab|single cab/.test(c)) return 'pickup';
    return 'suv';
  }

  function isLight(hex) {
    const n = parseInt(String(hex || '#ffffff').slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  }

  let seq = 0;
  window.carArt = function (car) {
    const s = SHAPES[shapeFor(car.category)];
    const paint = /^#[0-9a-f]{6}$/i.test(car.colourHex || '') ? car.colourHex : '#c9ced6';
    const edge = isLight(paint) ? '#b9c0ca' : 'rgba(0,0,0,.25)';
    const id = 'ca' + (++seq);
    const wheels = s.wheels.map((x) => `
      <circle cx="${x}" cy="104" r="19" fill="#1a1d22"/>
      <circle cx="${x}" cy="104" r="11" fill="#c3c8d0"/>
      <circle cx="${x}" cy="104" r="11" fill="none" stroke="#9aa1ab" stroke-width="1.5" stroke-dasharray="3 3"/>
      <circle cx="${x}" cy="104" r="3.5" fill="#6b727c"/>`).join('');

    return `<svg class="car-art" viewBox="0 0 320 150" role="img" aria-label="${String(car.name || 'Car').replace(/"/g, '')}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".28"/>
          <stop offset=".45" stop-color="#fff" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity=".22"/>
        </linearGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3a4552"/>
          <stop offset="1" stop-color="#141a21"/>
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="124" rx="142" ry="7" fill="#000" opacity=".10"/>
      <path d="${s.body}" fill="${paint}" stroke="${edge}" stroke-width="1.2"/>
      <path d="${s.body}" fill="url(#${id}s)"/>
      ${s.glass.map((g) => `<path d="${g}" fill="url(#${id}g)"/>`).join('')}
      <path d="${s.door}" stroke="rgba(0,0,0,.18)" stroke-width="1.2"/>
      <path d="M20 90h282" stroke="rgba(0,0,0,.12)" stroke-width="5" stroke-linecap="round"/>
      <rect x="296" y="72" width="10" height="5" rx="2" fill="#fff6d6" stroke="rgba(0,0,0,.15)" stroke-width=".8"/>
      <rect x="13" y="74" width="7" height="6" rx="2" fill="#d9483b"/>
      ${wheels}
    </svg>`;
  };
})();
