#!/usr/bin/env bash
# Serve the site on mrcarsltd.com with HTTPS (DNS on Cloudflare). Safe to re-run.
# Run from your PC once the A records for @ and www point to the server:
#   bash scripts/setup-domain.sh [email-for-expiry-notices]
set -euo pipefail
HOST=root@102.202.208.195
PORT=222
EMAIL=${1:-njosuedev@gmail.com}

ssh -p "$PORT" "$HOST" EMAIL="$EMAIL" bash -s <<'REMOTE'
set -euo pipefail
SITE=/etc/nginx/sites-available/mrcars
DOMAINS="mrcarsltd.com www.mrcarsltd.com"
CERT=/etc/letsencrypt/live/mrcarsltd.com
cp "$SITE" "/root/mrcars.nginx.bak-$(date +%F-%H%M)"

# App proxy settings, shared by the HTTPS site and plain-IP access
cat > /etc/nginx/snippets/mrcars-app.conf <<'EOF'
client_max_body_size 100m;
server_tokens off;
# Compress text files (faster pages, better page-speed scores)
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_min_length 512;
gzip_types text/css application/javascript application/json application/xml text/plain image/svg+xml;
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
EOF

# Behind the Cloudflare proxy, take the visitor's real IP from CF-Connecting-IP
{ echo "# Cloudflare edge ranges (from https://www.cloudflare.com/ips/)"
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $ip;"
  done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/conf.d/cloudflare-realip.conf

# HTTP config first, so Let's Encrypt can reach the challenge folder
write_http() {
cat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAINS;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://mrcarsltd.com\$request_uri; }
}
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    include /etc/nginx/snippets/mrcars-app.conf;
}
EOF
}
mkdir -p /var/www/html
command -v certbot >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
if [ ! -d "$CERT" ]; then
  write_http > "$SITE"; nginx -t && systemctl reload nginx
  certbot certonly --nginx -d mrcarsltd.com -d www.mrcarsltd.com -m "$EMAIL" --agree-tos -n
fi

# Final config: HTTPS site, www -> main address, HTTP redirect, plain-IP access.
# One main address (no www) so search engines don't see the site twice.
{ cat <<EOF
server {
    listen 443 ssl;
    listen [::]:443 ssl ipv6only=on;
    server_name mrcarsltd.com;
    ssl_certificate $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/mrcars-app.conf;
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.mrcarsltd.com;
    ssl_certificate $CERT/fullchain.pem;
    ssl_certificate_key $CERT/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    return 301 https://mrcarsltd.com\$request_uri;
}
EOF
  write_http; } > "$SITE"
nginx -t && systemctl reload nginx
certbot renew --dry-run 2>&1 | tail -2
REMOTE
echo "Done: https://mrcarsltd.com"
