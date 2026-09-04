# Deployment

Global production is deployed to Cloudflare Workers. Mainland China production can run from
the same repository on a Volcengine ECS instance with the Node server preset; see
`deploy/china/README.md`.

- Worker service: `nekoid`
- Cloudflare account ID: `a90c9128a6517064a3c70ef87c8f3cf0`
- Cloudflare login used here: `xuec93497@gmail.com`
- Primary custom domain: `www.neko-id.uk`
- Apex fallback domain: `neko-id.uk`

## One-Time Setup

Make sure Wrangler is authenticated:

```sh
pnpm dlx wrangler@latest login --device
pnpm dlx wrangler@latest whoami
```

Production secrets come from local `.env.local`. Do not commit that file.

Required keys:

```sh
AI_PROVIDER=bytecat
AI_REQUIRE_REAL=true
BYTECAT_API_KEY=...
BYTECAT_BASE_URL=https://www.bytecatcode.org/v1
BYTECAT_MODEL=gpt-5.6-luna
BYTECAT_VISION_MODEL=gpt-5.6-terra
VITE_SUPABASE_URL=https://jbjgrkivscrombvnlcrl.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=https://jbjgrkivscrombvnlcrl.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_JWKS_URL=https://jbjgrkivscrombvnlcrl.supabase.co/auth/v1/.well-known/jwks.json
```

Upload or refresh secrets for the Worker:

```sh
pnpm dlx wrangler@latest secret bulk .env.local --name nekoid
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public browser config and must be available during `pnpm build`; the Supabase secret key must only be uploaded as a Worker secret or kept in local `.env.local`.

Supabase persistence uses project `jbjgrkivscrombvnlcrl` and the private Storage bucket `neko-media`. Apply database changes through committed files under `supabase/migrations/` before deploying code that depends on them.

## Supabase Auth

NEKO.ID currently supports email OTP login only.

In Supabase Dashboard → Authentication → Email Templates → Magic Link or OTP, make sure the email content includes the OTP token instead of only a magic link:

```html
<h2>Your NEKO.ID verification code</h2>
<p>Use this 6-digit code to sign in:</p>
<p style="font-size: 28px; letter-spacing: 8px; font-weight: 700;">{{ .Token }}</p>
<p>If you did not request this, you can ignore this email.</p>
```

Supabase chooses the email behavior from the template: `{{ .ConfirmationURL }}` sends a magic link, while `{{ .Token }}` sends an OTP code. The app verifies the code at `/auth/login`.

Also set Auth redirect URLs to include:

```text
https://neko-id.uk/auth/login
https://neko-id.uk/app/me
https://www.neko-id.uk/auth/login
https://www.neko-id.uk/app/me
http://localhost:5173/auth/login
http://localhost:5173/app/me
http://localhost:8080/auth/login
http://localhost:8080/app/me
```

## Deploy Cloudflare

Build the app. `pnpm build` defaults to the Cloudflare preset. You can also run the
explicit script:

```sh
pnpm build
pnpm build:cloudflare
```

If this workspace uses the bundled Codex runtime instead of a system `node`/`pnpm`, run:

```sh
PATH=/Users/amadeus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/amadeus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vite/bin/vite.js build
```

If the build fails resolving `@tanstack/query-core` after a pnpm install, repair the local `node_modules` symlink:

```sh
ln -s ../.pnpm/@tanstack+query-core@5.101.4/node_modules/@tanstack/query-core node_modules/@tanstack/query-core
```

Deploy the prebuilt Cloudflare Worker output:

```sh
pnpm dlx wrangler@latest deploy --config .output/server/wrangler.json --name nekoid --domain www.neko-id.uk --domain neko-id.uk --keep-vars --message "Deploy production build"
```

For the Codex bundled runtime:

```sh
PATH=/Users/amadeus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/amadeus/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm dlx wrangler@latest deploy --config .output/server/wrangler.json --name nekoid --domain www.neko-id.uk --domain neko-id.uk --keep-vars --message "Deploy production build"
```

## Verify

```sh
curl -I https://www.neko-id.uk
curl -I https://neko-id.uk
pnpm dlx wrangler@latest deployments list --name nekoid
```

Expected result: both `https://www.neko-id.uk` and `https://neko-id.uk` return `HTTP/2 200`, and the latest Wrangler deployment is attached to Worker `nekoid`.

## Deploy Volcengine ECS

Use the China build target:

```sh
pnpm build:china
HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs
```

For the server checklist, Dockerfile, systemd unit, Nginx reverse proxy template, and
required secrets, see `deploy/china/README.md`.
