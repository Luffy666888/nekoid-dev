#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Deploy NEKO.ID to a Mainland China Linux server over SSH.

Usage:
  NEKOID_SSH_TARGET=root@1.2.3.4 deploy/china/deploy-over-ssh.sh
  deploy/china/deploy-over-ssh.sh root@1.2.3.4

Optional environment variables:
  NEKOID_SSH_PORT=22
  NEKOID_SSH_KEY=/absolute/path/to/key.pem
  NEKOID_LOCAL_ENV=deploy/china/nekoid.env
  NEKOID_DOMAINS="api.nekoid.cn"
  NEKOID_REMOTE_ROOT=/opt/nekoid
  NEKOID_REMOTE_ENV=/etc/nekoid/nekoid.env
  NEKOID_APP_USER=nekoid
  NEKOID_SKIP_NGINX=1
  NEKOID_FORCE_NGINX=1
  NEKOID_CERTBOT_EMAIL=ops@example.com
  NEKOID_ENABLE_CERTBOT=1
USAGE
}

NEKOID_SSH_TARGET="${1:-${NEKOID_SSH_TARGET:-}}"
NEKOID_SSH_PORT="${NEKOID_SSH_PORT:-22}"
NEKOID_SSH_KEY="${NEKOID_SSH_KEY:-}"
NEKOID_LOCAL_ENV="${NEKOID_LOCAL_ENV:-deploy/china/nekoid.env}"
NEKOID_DOMAINS="${NEKOID_DOMAINS:-api.nekoid.cn}"
NEKOID_REMOTE_ROOT="${NEKOID_REMOTE_ROOT:-/opt/nekoid}"
NEKOID_REMOTE_ENV="${NEKOID_REMOTE_ENV:-/etc/nekoid/nekoid.env}"
NEKOID_APP_USER="${NEKOID_APP_USER:-nekoid}"
NEKOID_SERVICE_NAME="${NEKOID_SERVICE_NAME:-nekoid}"
NEKOID_SKIP_NGINX="${NEKOID_SKIP_NGINX:-0}"
NEKOID_FORCE_NGINX="${NEKOID_FORCE_NGINX:-0}"
NEKOID_ENABLE_CERTBOT="${NEKOID_ENABLE_CERTBOT:-0}"
NEKOID_CERTBOT_EMAIL="${NEKOID_CERTBOT_EMAIL:-}"

if [[ -z "$NEKOID_SSH_TARGET" ]]; then
  usage
  exit 2
fi

if [[ ! -f "$NEKOID_LOCAL_ENV" ]]; then
  echo "Missing env file: $NEKOID_LOCAL_ENV"
  echo "Create it from deploy/china/env.example and fill real production values."
  exit 2
fi

if grep -Eq 'your-|sk-your|example\.com|your-project-ref' "$NEKOID_LOCAL_ENV"; then
  echo "Env file still contains placeholder values: $NEKOID_LOCAL_ENV"
  exit 2
fi

NEKOID_TMP_DIR="$(mktemp -d)"
NEKOID_RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
NEKOID_ARCHIVE="$NEKOID_TMP_DIR/nekoid-src-$NEKOID_RELEASE_ID.tar.gz"
NEKOID_ENV_UPLOAD="$NEKOID_TMP_DIR/nekoid.env"
NEKOID_NGINX_CONF="$NEKOID_TMP_DIR/nekoid-nginx.conf"

cleanup() {
  rm -rf "$NEKOID_TMP_DIR"
}
trap cleanup EXIT

ssh_args=(-p "$NEKOID_SSH_PORT" -o ServerAliveInterval=30 -o ServerAliveCountMax=4)
scp_args=(-P "$NEKOID_SSH_PORT" -o ServerAliveInterval=30 -o ServerAliveCountMax=4)

if [[ -n "$NEKOID_SSH_KEY" ]]; then
  ssh_args+=(-i "$NEKOID_SSH_KEY")
  scp_args+=(-i "$NEKOID_SSH_KEY")
fi

COPYFILE_DISABLE=1 tar \
  --no-xattrs \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.output' \
  --exclude='.nitro' \
  --exclude='.vinxi' \
  --exclude='.tanstack' \
  --exclude='.wrangler' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='deploy/china/nekoid.env' \
  -czf "$NEKOID_ARCHIVE" .

cp "$NEKOID_LOCAL_ENV" "$NEKOID_ENV_UPLOAD"
sed -E "s/server_name .*/server_name ${NEKOID_DOMAINS};/" deploy/china/nginx.conf > "$NEKOID_NGINX_CONF"

ssh "${ssh_args[@]}" "$NEKOID_SSH_TARGET" \
  "mkdir -p /tmp/nekoid-deploy-$NEKOID_RELEASE_ID"

scp "${scp_args[@]}" \
  "$NEKOID_ARCHIVE" \
  "$NEKOID_ENV_UPLOAD" \
  "$NEKOID_NGINX_CONF" \
  deploy/china/nekoid.service \
  "$NEKOID_SSH_TARGET:/tmp/nekoid-deploy-$NEKOID_RELEASE_ID/"

ssh "${ssh_args[@]}" "$NEKOID_SSH_TARGET" \
  "NEKOID_RELEASE_ID='$NEKOID_RELEASE_ID' \
   NEKOID_REMOTE_ROOT='$NEKOID_REMOTE_ROOT' \
   NEKOID_REMOTE_ENV='$NEKOID_REMOTE_ENV' \
   NEKOID_APP_USER='$NEKOID_APP_USER' \
   NEKOID_SERVICE_NAME='$NEKOID_SERVICE_NAME' \
   NEKOID_SKIP_NGINX='$NEKOID_SKIP_NGINX' \
   NEKOID_FORCE_NGINX='$NEKOID_FORCE_NGINX' \
   NEKOID_ENABLE_CERTBOT='$NEKOID_ENABLE_CERTBOT' \
   NEKOID_CERTBOT_EMAIL='$NEKOID_CERTBOT_EMAIL' \
   bash -s" <<'REMOTE'
set -euo pipefail

release_id="$NEKOID_RELEASE_ID"
remote_root="$NEKOID_REMOTE_ROOT"
remote_env="$NEKOID_REMOTE_ENV"
app_user="$NEKOID_APP_USER"
service_name="$NEKOID_SERVICE_NAME"
skip_nginx="$NEKOID_SKIP_NGINX"
force_nginx="$NEKOID_FORCE_NGINX"
enable_certbot="$NEKOID_ENABLE_CERTBOT"
certbot_email="$NEKOID_CERTBOT_EMAIL"
deploy_tmp="/tmp/nekoid-deploy-$release_id"
release_dir="$remote_root/releases/$release_id"

install_certbot_isolated_wrapper() {
  sudo install -d -m 0755 /usr/local/lib/nekoid /usr/local/sbin
  sudo tee /usr/local/lib/nekoid/certbot-isolated.py >/dev/null <<'PY'
import sys
sys.path = [
    "/usr/lib/python310.zip",
    "/usr/lib/python3.10",
    "/usr/lib/python3.10/lib-dynload",
    "/usr/lib/python3/dist-packages",
]
sys.argv[0] = "certbot"
from certbot.main import main
raise SystemExit(main())
PY
  sudo chmod 0644 /usr/local/lib/nekoid/certbot-isolated.py
  sudo tee /usr/local/sbin/certbot-isolated >/dev/null <<'SH'
#!/bin/sh
exec /usr/bin/python3 -S /usr/local/lib/nekoid/certbot-isolated.py "$@"
SH
  sudo chmod 0755 /usr/local/sbin/certbot-isolated

  if systemctl cat certbot.service >/dev/null 2>&1; then
    sudo install -d -m 0755 /etc/systemd/system/certbot.service.d
    sudo tee /etc/systemd/system/certbot.service.d/override.conf >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/local/sbin/certbot-isolated -q renew
EOF
    sudo systemctl daemon-reload
  fi
}

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required on the remote server."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install Node.js 22 first, then rerun this script."
  exit 1
fi

node -e "const major = Number(process.versions.node.split('.')[0]); if (major < 22) { console.error('Node.js 22+ is required, current: ' + process.version); process.exit(1); }"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required on the remote server."
  exit 1
fi

if ! id "$app_user" >/dev/null 2>&1; then
  sudo useradd --system --home "$remote_root" --shell /usr/sbin/nologin "$app_user"
fi

sudo install -d -m 0755 "$remote_root"
sudo install -d -m 0755 "$remote_root/releases"
sudo install -d -m 0750 -o root -g "$app_user" "$(dirname "$remote_env")"
sudo install -d -m 0755 "$release_dir"
sudo install -d -m 0755 -o "$app_user" -g "$app_user" "$remote_root/.npm"
sudo chown -R "$app_user":"$app_user" "$remote_root/.npm"
sudo tar -xzf "$deploy_tmp/nekoid-src-$release_id.tar.gz" -C "$release_dir"
sudo cp "$deploy_tmp/nekoid.env" "$remote_env"
sudo chown root:"$app_user" "$remote_env" 2>/dev/null || sudo chown root:root "$remote_env"
sudo chmod 0640 "$remote_env"
sudo chown -R "$app_user":"$app_user" "$release_dir"

sudo -u "$app_user" env NPM_CONFIG_CACHE="$remote_root/.npm" bash -c "cd '$release_dir' && set -a && . '$remote_env' && set +a && npm ci && npm run build:china"

sudo ln -sfn "$release_dir" "$remote_root/current"
sudo cp "$deploy_tmp/nekoid.service" "/etc/systemd/system/$service_name.service"
sudo systemctl daemon-reload
sudo systemctl enable "$service_name"
sudo systemctl restart "$service_name"

if [[ "$skip_nginx" != "1" ]]; then
  if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx is required for public HTTP/HTTPS reverse proxy. Install nginx or rerun with NEKOID_SKIP_NGINX=1."
    exit 1
  fi
  if [[ -f /etc/nginx/conf.d/nekoid.conf && "$force_nginx" != "1" ]]; then
    echo "Preserving existing /etc/nginx/conf.d/nekoid.conf. Set NEKOID_FORCE_NGINX=1 to overwrite it."
  else
    sudo cp "$deploy_tmp/nekoid-nginx.conf" /etc/nginx/conf.d/nekoid.conf
  fi
  sudo nginx -t
  sudo systemctl reload nginx
fi

health_ok=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/ios/health; then
    echo
    health_ok=1
    break
  fi
  sleep 1
done

if [[ "$health_ok" != "1" ]]; then
  echo "Health check failed: http://127.0.0.1:3000/api/ios/health"
  sudo systemctl --no-pager --full status "$service_name" || true
  sudo journalctl -u "$service_name" --no-pager -n 80 || true
  exit 1
fi

if [[ "$enable_certbot" == "1" ]]; then
  certbot_bin=""
  certbot_contact_args=()
  if ! command -v certbot >/dev/null 2>&1 && ! command -v /usr/local/sbin/certbot-isolated >/dev/null 2>&1; then
    echo "certbot is required for automatic HTTPS. Install certbot first, then rerun."
    exit 1
  fi

  if command -v /usr/local/sbin/certbot-isolated >/dev/null 2>&1; then
    certbot_bin="/usr/local/sbin/certbot-isolated"
  elif certbot --version >/dev/null 2>&1; then
    certbot_bin="$(command -v certbot)"
  elif /usr/bin/python3 -S - <<'PY' >/dev/null 2>&1
import sys
sys.path = [
    "/usr/lib/python310.zip",
    "/usr/lib/python3.10",
    "/usr/lib/python3.10/lib-dynload",
    "/usr/lib/python3/dist-packages",
]
from certbot.main import main
PY
  then
    install_certbot_isolated_wrapper
    certbot_bin="/usr/local/sbin/certbot-isolated"
  else
    echo "certbot is installed but failed to run. Check Python package conflicts on the server."
    exit 1
  fi

  if [[ -n "$certbot_email" ]]; then
    certbot_contact_args=(-m "$certbot_email")
  else
    certbot_contact_args=(--register-unsafely-without-email)
  fi

  domains=()
  seen_domains=""
  for domain in $(awk '/server_name / { for (i=2; i<=NF; i++) { gsub(/;/, "", $i); print $i } }' /etc/nginx/conf.d/nekoid.conf); do
    if [[ " $seen_domains " != *" $domain "* ]]; then
      domains+=(-d "$domain")
      seen_domains="$seen_domains $domain"
    fi
  done
  if [[ "${#domains[@]}" -eq 0 ]]; then
    echo "No server_name values found in /etc/nginx/conf.d/nekoid.conf."
    exit 1
  fi
  sudo "$certbot_bin" --nginx --non-interactive --agree-tos "${certbot_contact_args[@]}" --redirect "${domains[@]}"
fi

sudo systemctl --no-pager --full status "$service_name" || true
REMOTE
