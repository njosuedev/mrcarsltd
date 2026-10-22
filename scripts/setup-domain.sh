#!/usr/bin/env bash
# One-time setup: serve the site on mrcarsltd.com with HTTPS (DNS on Cloudflare).
# Run from your PC after the Cloudflare A records exist:  bash scripts/setup-domain.sh
set -euo pipefail
HOST=root@102.202.208.195
PORT=222
EMAIL=${1:-njosuedev@gmail.com}   # for Let's Encrypt expiry notices

ssh -p "$PORT" "$HOST" EMAIL="$EMAIL" bash -s <<'EOF'
set -euo pipefail
SITE=/etc/nginx/sites-available/mrcars
cp "$SITE" "/root/mrcars.nginx.bak-$(date +%F-%H%M)"

# 1. Answer for the domain (the IP keeps working through default_server)
sed -i 's/server_name _;/server_name mrcarsltd.com www.mrcarsltd.com;/' "$SITE"

# 2. Behind the Cloudflare proxy, take the visitor's real IP from CF-Connecting-IP
{ echo "# Cloudflare edge ranges (refresh from https://www.cloudflare.com/ips/)"
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $ip;"
  done
  echo "real_ip_header CF-Connecting-IP;"
} > /etc/nginx/conf.d/cloudflare-realip.conf
nginx -t && systemctl reload nginx

# 3. Free certificate from Let's Encrypt, auto-renewing, with HTTP -> HTTPS redirect
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
certbot --nginx -d mrcarsltd.com -d www.mrcarsltd.com --redirect -m "$EMAIL" --agree-tos -n
certbot renew --dry-run
EOF
echo "Done: https://mrcarsltd.com"
