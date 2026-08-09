# Project Memory

- Production deploy target is Cloudflare Workers service `nekoid`.
- Cloudflare account ID: `a90c9128a6517064a3c70ef87c8f3cf0`.
- Production custom domain: `www.neko-id.uk`.
- Follow `DEPLOYMENT.md` for repeat deployments.
- Never commit `.env.local`; production ByteCat values are stored as Cloudflare Worker secrets.
- Supabase project for persistence: `Neko-ID` / ref `jbjgrkivscrombvnlcrl`.
- Supabase storage bucket for user media: `neko-media`.
- Real Supabase secret keys must be rotated if exposed and must only live in `.env.local` / Worker secrets.
- Auth uses Supabase email OTP only. The Magic Link or OTP email template must include `{{ .Token }}` so users receive a 6-digit code for `/auth/login`.
