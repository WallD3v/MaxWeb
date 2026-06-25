#!/bin/sh
# One-time Let's Encrypt bootstrap for Max Web.
# Creates a temporary self-signed cert so nginx can start, then replaces it
# with a real certificate via the ACME http-01 challenge.
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "Create .env first (cp .env.example .env)"; exit 1; fi
. ./.env

: "${MAX_DOMAIN:?set MAX_DOMAIN in .env}"
: "${LETSENCRYPT_EMAIL:?set LETSENCRYPT_EMAIL in .env}"

COMPOSE="docker compose"
LIVE="/etc/letsencrypt/live/$MAX_DOMAIN"

echo "==> Creating a temporary self-signed certificate so nginx can boot"
$COMPOSE run --rm --entrypoint sh certbot -c "\
  mkdir -p $LIVE && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout $LIVE/privkey.pem -out $LIVE/fullchain.pem -subj '/CN=$MAX_DOMAIN'"

echo "==> Starting nginx"
$COMPOSE up -d nginx
sleep 3

echo "==> Removing the temporary certificate"
$COMPOSE run --rm --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/$MAX_DOMAIN /etc/letsencrypt/archive/$MAX_DOMAIN /etc/letsencrypt/renewal/$MAX_DOMAIN.conf"

echo "==> Requesting the real Let's Encrypt certificate"
$COMPOSE run --rm --entrypoint sh certbot -c "\
  certbot certonly --webroot -w /var/www/certbot \
    -d $MAX_DOMAIN --email $LETSENCRYPT_EMAIL \
    --agree-tos --no-eff-email --non-interactive"

echo "==> Reloading nginx with the real certificate"
$COMPOSE exec nginx nginx -s reload || $COMPOSE restart nginx
$COMPOSE up -d

echo "==> Done. Open https://$MAX_DOMAIN"
