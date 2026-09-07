# MediaGrow Content Hub V1

Multi-brand social content inbox and auto-publisher for Instagram and Facebook.

## V1 flow

1. Team signs in with Supabase Auth.
2. Owner creates brands.
3. Owner connects one Instagram Professional/Business account and/or Facebook Page per brand.
4. Team uploads an image/video to the private `content-media` bucket.
5. `schedule_content()` creates independent publish jobs for each channel.
6. Supabase Cron invokes `publish-worker` every minute.
7. Worker claims jobs atomically (`FOR UPDATE SKIP LOCKED`), creates a signed media URL, publishes to Meta, and records the post ID/URL.
8. Failed jobs retry with exponential backoff, max 4 attempts.

## Security

- Browser only gets the Supabase publishable key.
- All public tables use RLS.
- Media bucket is private.
- Meta access tokens are encrypted with `pgcrypto` before storage.
- Decryption functions are executable only by `service_role`.
- Publish worker uses a custom random secret stored in the private schema.
- No Meta/service-role secrets are required on Vercel.

## Deploy

### Supabase

1. Apply `supabase/migrations/001_content_hub.sql`.
2. Deploy `supabase/functions/publish-worker` with JWT verification disabled **only because the function performs its own `x-worker-secret` check**.
3. Run `supabase/scheduler.example.sql`.
4. Create your first user from the web UI (email/password). If email confirmations are enabled, confirm the email first.

### Vercel

The current project already contains public fallback values for this Supabase project. You can alternatively set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Then deploy normally.

## Meta connection

The V1 connection screen accepts the account/Page ID plus publishing access token. This is intentionally a one-time manual setup. A full Facebook Login OAuth onboarding flow is the next production hardening step for agency/client self-service.

Supported worker paths in V1:

- Instagram image Feed
- Instagram image/video Story
- Instagram Reel
- Facebook image/video Feed
- Facebook image/video Story
- Facebook Reel

Meta permissions and account eligibility still determine whether a specific account can publish via API.
