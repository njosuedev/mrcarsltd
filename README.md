# MRCARS Ltd — Website & Stock Dashboard

The showroom website for **MRCARS Ltd**, Kigali. Customers browse the cars in stock and contact
the showroom on WhatsApp or by phone. Staff post and manage cars from a private dashboard.

| | |
|---|---|
| **Live site** | http://102.202.208.195 |
| **Dashboard** | http://102.202.208.195/admin |
| **Phone / WhatsApp** | +250 787 615 702 |
| **Stack** | Node.js 22 · Express 4 · Multer · plain HTML/CSS/JS · JSON file storage |
| **Hosting** | Ubuntu 24.04 VPS · nginx · systemd |

---

## What it does

**Public website (`/`)**
- A grid of cars that are in stock, with filters by body type and New/Used, search, and sorting.
- A details window for each car, with a photo gallery, specs, price, and an "Ask about this car" button that opens WhatsApp with the car's name and link already filled in.
- Each car has a link you can share (`/#car-<id>`).
- Shows only cars that are **published**, **in stock**, and **have at least one photo**.
- Works on phones.

**Dashboard (`/admin`)**
- Sign in with an email and password.
- Post, edit, hide, and delete cars. Upload photos, put them in order, and pick the cover photo.
- Change the stock count with + and −. A car at 0 shows as "Sold out" and leaves the website.
- Edit the business details: name, phone, WhatsApp, address, map link, and intro text.
- Change the sign-in email and password.

## Quick start (local)

Requires **Node.js 18 or newer**.

```bash
npm install
npm run set-admin -- you@example.com "AStrongPassword"   # create the dashboard login
npm start
```

- Website: http://localhost:3000
- Dashboard: http://localhost:3000/admin

## Project layout

```
mrcarsltd/
├── server.js            # Express server: API, sign-in, photo uploads, storage
├── package.json
├── scripts/
│   ├── set-admin.js     # create or reset the dashboard login
│   └── deploy.sh        # push code changes to the VPS
├── public/              # everything the browser loads
│   ├── index.html       # public website
│   ├── app.js           #   its logic (filters, cards, details window)
│   ├── styles.css       #   shared design styles (used by both pages)
│   ├── admin.html       # dashboard
│   ├── admin.js         #   its logic
│   ├── admin.css        #   dashboard-only styles
│   ├── car-art.js       # drawn car picture shown when a car has no photo (dashboard)
│   └── brand/           # logo and icons
├── data/                # created at runtime, NOT in git
│   ├── db.json          #   cars + business details
│   └── admin.json       #   dashboard login (hashed password)
├── uploads/             # car photos, created at runtime, NOT in git
└── docs/
    ├── ADMIN-GUIDE.md   # for staff: how to use the dashboard
    ├── MAINTENANCE.md   # for whoever runs the server
    └── DEVELOPMENT.md   # for developers: how the code works, API, data
```

## Configuration

Settings come from environment variables. None are required to run locally.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Address it listens on. Production uses `127.0.0.1`, so only nginx can reach it |
| `TRUST_PROXY` | unset | Set it (to `1`) behind nginx, so the login limit sees each visitor's real IP |

Business details (name, phone, address…) are **not** set in code. Change them in the dashboard under **Settings**.

## Common tasks

| Task | Command |
|---|---|
| Run locally | `npm start` |
| Create or reset the dashboard login (locally) | `npm run set-admin -- email "password"` |
| Deploy code changes | `bash scripts/deploy.sh` |
| See live logs | `ssh -p 222 root@102.202.208.195 journalctl -u mrcars -f` |
| Restart the live site | `ssh -p 222 root@102.202.208.195 systemctl restart mrcars` |

On the server, run `set-admin` as the `mrcars` user (see [MAINTENANCE.md](docs/MAINTENANCE.md#reset-the-dashboard-password)).

## Documentation

- **[Admin guide](docs/ADMIN-GUIDE.md)**: posting cars, photos, stock, settings. For showroom staff.
- **[Maintenance guide](docs/MAINTENANCE.md)**: deploying, backups, restoring, troubleshooting, security, HTTPS.
- **[Development guide](docs/DEVELOPMENT.md)**: how the code fits together, data format, API reference.

## Important

- `data/` and `uploads/` hold the live business data and are **not in git**. Back them up from the server. See [Backups](docs/MAINTENANCE.md#backups).
- Never commit passwords. The dashboard password is stored only as a scrypt hash in `data/admin.json`.
