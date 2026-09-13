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
BYTECAT_GEMINI_BASE_URL=https://bytecat.lamclod.cn
# Dedicated token for the Gemini endpoint. Keep the real value server-only.
BYTECAT_GEMINI_API_KEY=...
BYTECAT_MODEL=gemini-3.7-flash
BYTECAT_VISION_MODEL=gemini-3.7-flash
BYTECAT_CATFACE_MODEL=gemini-3.7-flash
BYTECAT_CATFACE_FALLBACK_MODELS=
BYTECAT_TEXT_FALLBACK_MODELS=
BYTECAT_VISION_FALLBACK_MODELS=
BYTECAT_CATFACE_TIMEOUT_MS=15000
BYTECAT_PRIMARY_TIMEOUT_MS=30000
BYTECAT_TEXT_TIMEOUT_MS=30000
BYTECAT_VISION_TIMEOUT_MS=30000
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

For Mainland China, iOS media is stored in Volcengine TOS while Supabase/Postgres
continues to hold Auth and metadata. The app asks the server for short-lived signed
URLs, then uploads/downloads media directly with TOS, so media bandwidth does not pass
through the Node server. Set these only on the China server or another server-side
runtime:

```sh
MEDIA_STORAGE_PROVIDER=tos
TOS_ACCESS_KEY_ID=...
TOS_SECRET_ACCESS_KEY=...
TOS_REGION=cn-beijing
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_BUCKET=...
TOS_PATH_STYLE=false
MEDIA_UPLOAD_URL_TTL_SECONDS=600
MEDIA_SIGNED_URL_TTL_SECONDS=3600
MEDIA_STORAGE_SUPABASE_READ_FALLBACK=0
```

`MEDIA_STORAGE_SUPABASE_READ_FALLBACK=1` is only for a temporary migration window
when old object keys still exist in Supabase Storage but have not yet been copied
to TOS. Keep it off for testing the real TOS path.

ByteCat backup integration was deployed and verified in production on 2026-09-12.
Current verified Worker version: `78332390-403a-4a57-b501-28a9f57a3881`.
The `split_cat_voice_analysis_and_share` migration was applied before deployment;
its production history version is `20260912130236`.

- GPT models use `BYTECAT_BASE_URL` with `/chat/completions` and a Bearer token.
- Gemini models use `BYTECAT_GEMINI_BASE_URL` with `/v1beta/models/{model}:generateContent` and `x-goog-api-key`. The dedicated Gemini token resolved the earlier “no available channel” responses.
- All four requested backups have returned valid text and cat detection results. Upstream latency varies; see [local test results](docs/bytecat-local-testing.md) for business-level results and limitations.
- The configured primary model has an 8-second deadline. Text backups have an 18-second deadline, and image generation backups have a 22-second deadline. Cat detection uses 20 seconds for a face and 8 seconds for presence; the primary deadline can shorten these. Each deadline includes receiving the response body.
- Failed, empty, truncated or invalid responses advance to the next model. Gemini thought parts are excluded from the answer. Presence detection retains its permissive result only after all configured candidates fail.
- Keep Gemini secrets out of `VITE_*` variables. Run `pnpm test:ai` for offline regressions and `pnpm test:ai:live` for real ByteCat tests using `.env.local` (these consume API quota).

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
