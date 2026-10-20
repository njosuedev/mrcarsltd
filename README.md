# MRCARS Ltd – car catalogue + admin dashboard

## Run it
```
npm install
npm start
```
- Website: http://localhost:3000
- Admin dashboard: http://localhost:3000/admin  (sign in with the admin email and password)

Create or reset the admin login from the command line:
```
npm run set-admin -- you@example.com "YourStrongPassword"
```
The password is stored hashed in `data/admin.json`. The admin can also change the email and
password from **Settings → Sign-in details** in the dashboard.

`PORT` can be set to change the port.

## What the admin can do
- **Post a car**: name, year, body type, price (or "From" price), mileage, condition, colour, stock count, description, photos.
- Drag photos (or press ★) to choose the cover photo.
- Change stock with + / −. At 0 the car disappears from the website ("Sold out").
- Hide / show a car on the website, edit it, or delete it.
- **Settings** tab: business details and sign-in details. Business details: name, phone, WhatsApp number, address, Google Maps link, intro text.

## Where things are saved
- `data/db.json` – cars and company info
- `data/admin.json` – admin login (hashed password; keep it private)
- `uploads/` – car photos

Back up both folders. The sample cars that come with the site can be deleted from the dashboard.

## Live server

- Site: http://102.202.208.195 (admin at `/admin`)
- Server: Ubuntu VPS, app in `/opt/mrcars`, runs as the `mrcars` systemd service behind nginx.
- Push code changes: `bash scripts/deploy.sh` (does not touch the live cars, photos or login).
- Logs: `ssh -p 222 root@102.202.208.195 journalctl -u mrcars -f`
