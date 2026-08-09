# Deployment

Production is deployed to Cloudflare Workers.

- Worker service: `nekoid`
- Cloudflare account ID: `a90c9128a6517064a3c70ef87c8f3cf0`
- Cloudflare login used here: `xuec93497@gmail.com`
- Custom domain: `neko-id.uk`

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
```

Upload or refresh secrets for the Worker:

```sh
pnpm dlx wrangler@latest secret bulk .env.local --name nekoid
```

## Deploy

Build the app. `vite.config.ts` must keep `nitro.preset` set to `cloudflare-module`.

```sh
pnpm build
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
pnpm dlx wrangler@latest deploy --config .output/server/wrangler.json --name nekoid --domain neko-id.uk --keep-vars --message "Deploy production build"
```

For the Codex bundled runtime:

```sh
PATH=/Users/amadeus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH /Users/amadeus/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm dlx wrangler@latest deploy --config .output/server/wrangler.json --name nekoid --domain neko-id.uk --keep-vars --message "Deploy production build"
```

## Verify

```sh
curl -I https://neko-id.uk
pnpm dlx wrangler@latest deployments list --name nekoid
```

Expected result: `https://neko-id.uk` returns `HTTP/2 200`, and the latest Wrangler deployment is attached to Worker `nekoid`.
