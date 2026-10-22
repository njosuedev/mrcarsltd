# Maintenance guide

How the live website is set up, and how to keep it healthy. Commands are run from your PC
in **Git Bash** unless a step says "on the server".

---

## 1. Server at a glance

| | |
|---|---|
| Domain | `mrcarsltd.com` and `www.mrcarsltd.com` (DNS on Cloudflare) |
| Provider IP (public) | `102.202.208.195` |
| Private IP | `172.27.13.20` (not used by the site) |
| SSH | `ssh -p 222 root@102.202.208.195` (key login from the developer PC) |
| OS | Ubuntu 24.04 LTS, 1 vCPU, 1 GB RAM, 20 GB disk |
| Node.js | 22 LTS (NodeSource apt repo) |
| App folder | `/opt/mrcars` |
| Runs as | system user `mrcars` (no login shell) |
| Service | `mrcars` (systemd): `/etc/systemd/system/mrcars.service` |
| Web server | nginx: `/etc/nginx/sites-available/mrcars` + `/etc/nginx/snippets/mrcars-app.conf` |
| HTTPS | Let's Encrypt via certbot, renews itself (`certbot.timer`) |
| Firewall | ufw: allows 222 (SSH), 80, 443, plus provider rules for 22/tcp and 60124/udp |

### How a request flows

```
Browser ──► nginx :443 (HTTPS) ──► node server.js on 127.0.0.1:3000 ──► data/db.json, uploads/
```

- nginx is the only thing open to the internet. Port 3000 only listens locally.
- nginx allows uploads up to 100 MB per request. The app also limits each photo to 10 MB and 20 photos per car.
- systemd restarts the app if it crashes, and starts it at boot.

### What lives where on the server

```
/opt/mrcars/
├── server.js, public/, scripts/, node_modules/   ← code (replaced by each deploy)
├── data/db.json        ← cars + business details   ┐ live data: never overwritten
├── data/admin.json     ← dashboard login (hash)    │ by deploys. BACK THESE UP.
└── uploads/            ← car photos                ┘
```

---

## 2. Deploying code changes

1. Make and test the change locally (`npm start`, open http://localhost:3000).
2. Commit and push to GitHub:
   ```bash
   git add . && git commit -m "Describe the change" && git push
   ```
3. Deploy:
   ```bash
   bash scripts/deploy.sh
   ```
   This copies the code (without `.git`, `node_modules`, `data`, `uploads`), runs `npm ci`,
   and restarts the service. It prints `active` when it finishes.
4. Open the live site and check the change. Press Ctrl+F5 to skip the browser cache.

> Restarting signs the dashboard user out (sessions are kept in memory). Deploy outside busy hours if possible.

### Rolling back a bad deploy

```bash
git log --oneline            # find the last good commit
git checkout <good-commit>   # temporarily switch to it
bash scripts/deploy.sh
git checkout main            # come back, then fix forward and deploy again
```

---

## 3. Everyday server commands

Run these on the server (`ssh -p 222 root@102.202.208.195`).

| Purpose | Command |
|---|---|
| Is the site running? | `systemctl status mrcars` |
| Live app logs | `journalctl -u mrcars -f` |
| Last 100 log lines | `journalctl -u mrcars -n 100 --no-pager` |
| Restart the app | `systemctl restart mrcars` |
| nginx errors | `tail -n 50 /var/log/nginx/error.log` |
| Test and reload nginx | `nginx -t && systemctl reload nginx` |
| Disk space | `df -h /` |
| Memory | `free -m` |
| Size of photos | `du -sh /opt/mrcars/uploads` |
| Is the app answering? | `curl -I http://127.0.0.1:3000/` |

---

## 4. Backups

Everything of value is in `/opt/mrcars/data` and `/opt/mrcars/uploads`. The code is on GitHub.
**There is no automatic backup yet**, so set one up (option B) or take one regularly (option A).

### A. Manual backup to your PC

```bash
ssh -p 222 root@102.202.208.195 'tar -czf - -C /opt/mrcars data uploads' > "mrcars-backup-$(date +%F).tar.gz"
```

Keep copies off the PC as well, for example on Google Drive or an external disk.

### B. Nightly backup on the server (keeps 14 days)

On the server:

```bash
mkdir -p /var/backups/mrcars
cat > /etc/cron.daily/mrcars-backup <<'EOF'
#!/bin/sh
tar -czf /var/backups/mrcars/mrcars-$(date +%F).tar.gz -C /opt/mrcars data uploads
find /var/backups/mrcars -name 'mrcars-*.tar.gz' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/mrcars-backup
/etc/cron.daily/mrcars-backup && ls -lh /var/backups/mrcars
```

This only protects you if a file gets deleted or damaged. If the whole server is lost, the backups go with it,
so still copy a backup to your PC now and then (option A).

### Restoring a backup

```bash
# from your PC: upload the archive, stop the app, restore, fix ownership, start
scp -P 222 mrcars-backup-2026-10-20.tar.gz root@102.202.208.195:/tmp/
ssh -p 222 root@102.202.208.195 'systemctl stop mrcars \
  && tar -xzf /tmp/mrcars-backup-2026-10-20.tar.gz -C /opt/mrcars \
  && chown -R mrcars:mrcars /opt/mrcars/data /opt/mrcars/uploads \
  && systemctl start mrcars && systemctl is-active mrcars'
```

---

## 5. Reset the dashboard password

When the admin forgets the password, run this **on the server**:

```bash
cd /opt/mrcars
sudo -u mrcars node scripts/set-admin.js new-email@example.com "NewStrongPassword"
systemctl restart mrcars     # signs out any old sessions
```

Always use `sudo -u mrcars`. If you run it as root, `data/admin.json` becomes owned by root,
and changing the password from the dashboard will then fail.

To see which email is the admin: `grep email /opt/mrcars/data/admin.json`.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site doesn't load at all | App or nginx stopped, or the server is down | `systemctl status mrcars nginx`, then restart whichever is stopped. If SSH also fails, reboot from the provider's control panel |
| **502 Bad Gateway** | nginx is up but the app isn't | `journalctl -u mrcars -n 50`, fix the error, `systemctl restart mrcars` |
| **413 Request Entity Too Large** | Upload bigger than nginx allows | Raise `client_max_body_size` in `/etc/nginx/sites-available/mrcars`, then `nginx -t && systemctl reload nginx` |
| "File too large" when saving a car | A photo is still over 10 MB after the browser resized it (rare) | Resize the photo, or raise `fileSize` in `server.js` |
| A photo silently doesn't appear | Not JPG/PNG/WebP/GIF (for example HEIC from an iPhone) | Convert it to JPG first |
| "Too many failed attempts" | 5 wrong passwords from that IP | Wait 15 minutes, or `systemctl restart mrcars` to clear it |
| "No admin account yet" | `data/admin.json` is missing | [Reset the password](#5-reset-the-dashboard-password) |
| Car posted but not on the website | No photo, stock 0, or hidden | Check its status in the dashboard |
| Saving fails with a permission error | Files in `data/` or `uploads/` are owned by root | `chown -R mrcars:mrcars /opt/mrcars/data /opt/mrcars/uploads` |
| Dashboard keeps signing out | App restarted (deploy, crash, reboot) | Normal after restarts. If it happens often, check the logs for crashes |
| Disk full | Too many photos or backups | `du -sh /opt/mrcars/uploads /var/backups/mrcars`, then remove old backups |
| Out of memory | 1 GB RAM is tight | `free -m`. Add a swap file (below) |

**Add 1 GB of swap** (once, on the server):
```bash
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**`db.json` got corrupted** (the app won't start and the log shows `JSON.parse` errors):
restore `data/db.json` from the latest backup. Writes go to a temporary file first and are then renamed,
so this should be rare.

---

## 7. Updates and security

### Monthly checklist
- [ ] Update the server: `apt update && apt upgrade -y`, then `reboot` if it asks for one
- [ ] Check for app dependency fixes locally: `npm audit`, then `npm update`, test, commit, deploy
- [ ] Take a backup and copy it off the server
- [ ] Check disk space: `df -h /`
- [ ] Remove cars that sold long ago, which also frees photo space

### Security notes
- **Passwords.** The dashboard password is stored only as a scrypt hash. Never commit `data/` to git (it is in `.gitignore`).
  Change any password that has been shared in chat or email.
- **SSH.** Key login is set up from the developer PC. Once every maintainer has a key on the server, turn off password login:
  ```bash
  # on the server
  sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart ssh
  ```
  Test a new SSH session **before** closing the current one.
- **Adding a maintainer's key:** append their public key (`id_ed25519.pub`) to `/root/.ssh/authorized_keys`.
- **Login limit.** 5 failed sign-ins per IP, then a 15 minute wait. This depends on `TRUST_PROXY=1` in the service file.
- **Use the HTTPS address.** On https://mrcarsltd.com the password is encrypted and the session cookie is marked `Secure`.
  The bare IP (http://102.202.208.195) still works but is unencrypted, so don't sign in to the dashboard through it.

---

## 8. Domain and HTTPS

**How it is set up**
- DNS is on Cloudflare (nameservers `coby` / `lucy.ns.cloudflare.com`). Two `A` records, `@` and `www`, point to `102.202.208.195`.
- nginx has three server blocks:
  - HTTPS on 443 for `mrcarsltd.com` / `www`, which serves the app.
  - HTTP on 80 for the domain, which redirects to HTTPS (except Let's Encrypt challenges).
  - HTTP on 80 for anything else (the bare IP), which serves the app.
- The app settings shared by both are in `/etc/nginx/snippets/mrcars-app.conf`.
- `/etc/nginx/conf.d/cloudflare-realip.conf` takes the visitor's real IP from `CF-Connecting-IP` if the Cloudflare proxy is turned on.

**Certificate**
- It renews on its own. Test the renewal with `certbot renew --dry-run`, and see the expiry date with `certbot certificates`.

**Turning on the Cloudflare proxy (orange cloud)** is optional:
- Set **SSL/TLS → Overview → Full (strict)** first. "Flexible" causes an endless redirect loop.
- Leave Cloudflare's "Always Use HTTPS" off, because nginx already redirects.
- Cloudflare's IP ranges change rarely. To refresh them, run `bash scripts/setup-domain.sh` again.

**Setting it up again** (new server, or a new domain), after the DNS A records point to the server:
`bash scripts/setup-domain.sh`. The script is safe to run more than once.

---

## 9. Rebuilding the server from scratch

Use this if you move to a new VPS. Replace the IP and port in `scripts/deploy.sh` first.

```bash
# on the new server, as root
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx
useradd --system --home /opt/mrcars --shell /usr/sbin/nologin mrcars
mkdir -p /opt/mrcars/data /opt/mrcars/uploads
```

Create `/etc/systemd/system/mrcars.service`:

```ini
[Unit]
Description=MRCARS Ltd website
After=network.target

[Service]
Type=simple
User=mrcars
WorkingDirectory=/opt/mrcars
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/opt/mrcars/data /opt/mrcars/uploads

[Install]
WantedBy=multi-user.target
```

Create `/etc/nginx/sites-available/mrcars` (HTTP only for now. `scripts/setup-domain.sh` replaces it with the HTTPS version later):

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100m;
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Then:

```bash
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/mrcars /etc/nginx/sites-enabled/mrcars
nginx -t && systemctl reload nginx
ufw allow 222/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable   # use your SSH port!
```

From your PC: `bash scripts/deploy.sh`. Then [restore a backup](#restoring-a-backup) of `data/` and `uploads/`,
or create a fresh login with [set-admin](#5-reset-the-dashboard-password). Finally, run `systemctl enable --now mrcars`.
Point the DNS A records at the new IP, then run `bash scripts/setup-domain.sh` for the domain and HTTPS.
