# Development guide

How the code is organised, how data is stored, and the API. Read this before you change things.

---

## Principles

- **No build step.** The browser loads `public/` exactly as written: plain HTML, CSS and JavaScript (no framework, no bundler).
- **Two dependencies.** `express` (HTTP server) and `multer` (photo uploads). Think twice before adding more.
- **JSON file storage.** One small business with tens of cars doesn't need a database server.
  If stock grows to thousands of cars or several staff edit at the same time, move to SQLite.

## Running locally

```bash
npm install
npm run set-admin -- dev@example.com "devpassword123"
npm start            # http://localhost:3000  and  /admin
```

There is no auto-reload. Restart `npm start` after editing `server.js`. For changes to `public/`, just refresh the browser.

`data/` and `uploads/` are created on first run. To start clean, stop the server and delete them.

---

## Code map

| File | Responsibility |
|---|---|
| `server.js` | Everything server-side: storage helpers, sessions, login limit, upload handling, all routes |
| `seo.js` | Builds the public pages on the server: title, description, link-preview tags, schema.org data (AutoDealer, Car, Offer), the plain car list, the inline catalogue, `sitemap.xml` and `robots.txt`. Car addresses are `/cars/<year-name-colour>-<first 8 chars of id>` (`carPath()`) |
| `scripts/set-admin.js` | Writes `data/admin.json` (email + scrypt salt/hash) |
| `scripts/deploy.sh` | Sends the code to the VPS with tar over ssh, runs `npm ci`, restarts the service |
| `public/index.html` | Public page template + SVG icon sprite (`<symbol id="i-…">`). `seo.js` fills the `<!--SEO_HEAD-->`, `<!--SEO_INTRO-->`, `<!--SEO_LIST-->` and `<!--CATALOGUE-->` markers |
| `public/app.js` | Reads the catalogue from the page (falls back to `/api/catalogue`); renders the map, filter chips, search/sort, cards, and the details window (swipe, keyboard, focus trap); builds WhatsApp links; opens a car from its `/cars/…` address (and old `#car-<id>` links) |
| `public/styles.css` | Design tokens on `:root` and all public styles. **Also loaded by the dashboard** |
| `public/admin.html` | Dashboard markup: login view, Stock tab, Settings tab, car form drawer, confirm dialog |
| `public/admin.js` | Dashboard logic: auth, table, KPIs, filters, car form, photo ordering, settings, account |
| `public/admin.css` | Dashboard-only styles (table, drawer, switches, photo grid…) |
| `public/car-art.js` | `window.carArt(car)`: an SVG side view (suv / sedan / pickup) tinted with `colourHex`, used where a car has no photo |
| `public/brand/` | Logo variants and icons (`mark.png`, `logo-full*.png`, `icon-32/180/512.png`) |

### Design tokens

Colours, radii, and shadows are CSS custom properties at the top of `public/styles.css`
(accent `#f26b1d`, ink `#14181f`). Change them there instead of hard-coding colours.
Fonts: **Barlow** and **Barlow Condensed** from Google Fonts.
Responsive breakpoints: 1080, 900, 760, 560 (phone layout and bottom-sheet details window), and 340 px.

---

## Data model

### `data/db.json`

```jsonc
{
  "settings": {
    "companyName": "MRCARS Ltd",
    "phone": "+250 787 615 702",       // shown and used for tel: links
    "whatsapp": "250787615702",         // digits only, for wa.me links
    "address": "KG 17 Avenue, Gasabo District, City of Kigali",
    "mapUrl": "https://maps.google.com/?q=…",
    "intro": "Every car below is in our showroom now…",
    "updatedAt": "2026-10-20T18:32:00.000Z"   // bumped on every change; shown as "Stock updated"
  },
  "cars": [
    {
      "id": "uuid",
      "name": "Toyota RAV4",            // required
      "year": "2021",                   // free text, so ranges like "2020-2022" are allowed
      "category": "SUV",                // body type; drives the filter chips. Default "Other"
      "condition": "Used",              // "New" | "Used"
      "mileage": 45000,                 // km
      "colour": "White",
      "colourHex": "#ffffff",
      "price": 25000000,                // RWF
      "priceFrom": false,               // show "From" before the price
      "quantity": 1,                    // 0 = sold out
      "description": "…",
      "published": true,
      "featured": false,                // sorted first
      "images": ["/uploads/<uuid>.jpg"],   // first = cover
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

New cars are added to the **front** of the array. Missing `settings` fields fall back to the defaults in `DEFAULT_DB`,
so adding a new setting is backwards compatible.

**Public visibility rule** (in `GET /api/catalogue`): `published && quantity > 0 && images.length > 0`.
The dashboard's `statusOf()` in `admin.js` mirrors this rule, so change both together.

### `data/admin.json`

```json
{ "email": "lowercase@email", "salt": "hex", "hash": "hex (scrypt, 64 bytes)", "updatedAt": "…" }
```

Only one admin account. The email is always stored and compared in lowercase.

### `uploads/`

Photos are saved as `<random-uuid>.<ext>`. They are served at `/uploads/…` with a 7-day cache.
Files are deleted when a photo is removed from a car, or when the car is deleted.

---

## Auth and security model

- **Sign-in.** `POST /api/login` checks the email and the scrypt hash (with a timing-safe compare).
  On success it sets the cookie `mrcars_admin=<random 32-byte token>` (`HttpOnly; SameSite=Strict; Path=/; Max-Age=12h`).
- **Sessions are in memory** (a `Set` in `server.js`), so a restart signs everyone out. That's fine for one admin.
- **Login limit.** 5 failures per IP in 15 minutes returns `429`. It uses `req.ip`, which is only correct behind nginx when `TRUST_PROXY` is set.
- **Changing the password** clears every other session.
- **CSRF.** Covered by `SameSite=Strict`. All changes require the cookie.
- **Uploads.** Only image types are accepted (JPEG, PNG, WebP, GIF), with server-generated filenames, max 10 MB each, 20 per request. The dashboard resizes photos to 1920 px (JPEG, quality 0.85) in the browser before upload (`shrink()` in `admin.js`).
- The cookie gets `Secure` when the request came over HTTPS (`req.secure`, which reads nginx's `X-Forwarded-Proto`).

---

## API reference

All bodies are JSON unless marked *multipart*. Admin routes return `401 {"error":"Not logged in"}` without a valid cookie.
Errors return `{ "error": "message" }`.

### Public

| Method | Path | Returns |
|---|---|---|
| GET | `/` | Home page, rendered by `seo.js` |
| GET | `/cars/:slug` | Page for one car (opens its details). Wrong slug → 301 to the right one; sold or hidden → 404 |
| GET | `/sitemap.xml`, `/robots.txt` | For search engines |
| GET | `/api/catalogue` | `{ settings, cars }`, only cars that pass the public visibility rule; each car has a `url` |
| GET | `/admin` | Dashboard page |

### Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/login` | `{ email, password }` | `200 {ok}` + cookie · `401` wrong details · `429` too many tries · `503` no account |
| POST | `/api/logout` | — | Clears the cookie and the session |
| GET | `/api/me` | — | `{ ok, email }` (admin) |
| PUT | `/api/admin/account` | `{ currentPassword, email?, newPassword? }` | Changes the email and/or password. `400` if the current password is wrong |

### Cars (admin)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/admin/cars` | — | `{ settings, cars }`, every car |
| POST | `/api/admin/cars` | *multipart*: car fields + `images` files + `order` | Creates the car and returns it. `name` is required |
| PUT | `/api/admin/cars/:id` | *multipart*: same as POST | Replaces the editable fields and the photo list |
| PATCH | `/api/admin/cars/:id` | `{ published?: boolean, quantity?: number }` | Quick toggles from the table |
| DELETE | `/api/admin/cars/:id` | — | Deletes the car and its photos |
| PUT | `/api/admin/settings` | any of `companyName, phone, whatsapp, address, mapUrl, intro` | `whatsapp` is stripped to digits |

**Multipart car fields:** `name, year, category, condition, mileage, colour, colourHex, price, priceFrom, quantity, description, published, featured`.
Booleans are sent as `"true"`/`"false"`. Number fields ignore everything except digits and `.`, so `"20,000,000"` works.

**Photo order (`order` field):** a JSON array that sets the final photo list:

```json
["/uploads/existing-a.jpg", "new:0", "/uploads/existing-b.jpg", "new:1"]
```

- An existing URL keeps that photo. `new:N` points to the Nth file in `images`.
- Existing photos left out of the list are **deleted from disk**.
- Without `order`, new uploads are appended after the existing photos.

Example with curl:

```bash
curl -c jar -H 'Content-Type: application/json' \
     -d '{"email":"dev@example.com","password":"devpassword123"}' http://localhost:3000/api/login
curl -b jar -F name="Toyota RAV4" -F price=25000000 -F category=SUV \
     -F images=@front.jpg -F 'order=["new:0"]' http://localhost:3000/api/admin/cars
```

---

## Common changes

| Change | Where |
|---|---|
| Add a car field | `carFromBody()` in `server.js` → form input in `admin.html` → fill/read it in `admin.js` → show it in `app.js` (card and/or `#mSpecs`) |
| Add a business setting | `DEFAULT_DB.settings` + the `fields` list in `PUT /api/admin/settings` → input in `#settingsForm` → use it in `app.js` |
| Change who sees a car | The filter in `GET /api/catalogue` **and** `statusOf()`/`isLive` in `admin.js` |
| Change upload limits | `limits` in the multer setup (`server.js`) **and** `client_max_body_size` in nginx |
| Add a body type suggestion | `<datalist id="catList">` in `admin.html` |
| Change the WhatsApp message | `app.js` (search for `wa.me`) |
| Change page titles, descriptions or structured data | `renderPage()` and the `*Schema()` functions in `seo.js` |
| Change the site address used in links | `SITE_URL` env var (default `https://mrcarsltd.com`) |
| Change colours or fonts | `:root` tokens in `styles.css`, plus the Google Fonts `<link>` in both HTML files |
| Replace the logo | Files in `public/brand/`. Keep the same names and roughly the same shapes |

## Before you deploy

- [ ] `node --check server.js` passes
- [ ] Public site: cards render, filters/search/sort work, the details window opens, and WhatsApp/Call links are right
- [ ] Phone width (DevTools device mode, about 375 px): no sideways scrolling, header buttons fit
- [ ] Dashboard: sign in, post a car with photos, reorder photos, edit, change stock, hide, delete
- [ ] No errors in the browser console
- [ ] Commit, push, `bash scripts/deploy.sh`, then check the live site
