# China Deployment

This deploy target runs the same TanStack Start app on a Mainland China ECS instance.

- Global production: `NITRO_PRESET=cloudflare-module` -> Cloudflare Workers.
- Mainland production: `NITRO_PRESET=node-server` -> Node.js 22 on Volcengine ECS.

## Required Server Inputs

Give the operator these values before the first deploy:

- ECS public IPv4 address, region, operating system, CPU architecture, and SSH port.
- SSH username plus either a private key or a temporary password. The user must have `sudo`.
- Domain names to bind, for example `api.nekoid.cn`, `www.nekoid.cn`, and `nekoid.cn`.
- DNS control for those domains, or exact DNS records that the domain owner will add.
- Security group inbound rules for TCP `22`, `80`, and `443`. Restrict `22` to the operator IP when possible.
- A production env file based on `deploy/china/env.example`.
- TLS choice: Certbot/Let's Encrypt on the server, or a Volcengine certificate and private key.

## Build Locally

```sh
npm run build:china
HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs
```

Health check:

```sh
curl -i http://127.0.0.1:3000/api/ios/health
```

## Docker Build

The browser bundle needs public Supabase values at build time:

```sh
docker build \
  -f Dockerfile.china \
  --build-arg VITE_SUPABASE_URL=https://your-project-ref.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-public-key \
  -t nekoid-china:latest .
```

Run it:

```sh
docker run --rm \
  --env-file deploy/china/nekoid.env \
  -p 3000:3000 \
  nekoid-china:latest
```

## Bare Node + systemd

Install Node.js 22 on the ECS instance, then place the checked-out repo at:

```text
/opt/nekoid/current
```

Create the env file:

```sh
sudo install -d -m 0750 -o root -g root /etc/nekoid
sudo install -m 0640 deploy/china/env.example /etc/nekoid/nekoid.env
sudo editor /etc/nekoid/nekoid.env
```

Install the service:

```sh
sudo useradd --system --home /opt/nekoid --shell /usr/sbin/nologin nekoid || true
sudo cp deploy/china/nekoid.service /etc/systemd/system/nekoid.service
sudo systemctl daemon-reload
npm ci
npm run build:china
sudo systemctl enable --now nekoid
sudo systemctl status nekoid
```

Install the Nginx reverse proxy:

```sh
sudo cp deploy/china/nginx.conf /etc/nginx/conf.d/nekoid.conf
sudo nginx -t
sudo systemctl reload nginx
```

After DNS resolves to the ECS public IP, enable HTTPS with your chosen certificate flow.

## Verify

```sh
curl -i http://127.0.0.1:3000/api/ios/health
curl -I http://api.nekoid.cn
curl -I https://api.nekoid.cn
```

The health endpoint should return JSON with `ok: true`. The public domains should return HTTP 200 or a normal redirect to HTTPS after TLS is configured.
