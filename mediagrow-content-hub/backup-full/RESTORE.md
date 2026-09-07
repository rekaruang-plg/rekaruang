# Restore MediaGrow Content Hub V1

Backup ini adalah ZIP source lengkap yang diubah menjadi Base64 dan dipecah menjadi 10 bagian berurutan: `part00.b64` sampai `part09.b64`.

## Linux / macOS

```bash
cat part00.b64 part01.b64 part02.b64 part03.b64 part04.b64 part05.b64 part06.b64 part07.b64 part08.b64 part09.b64 > content-hub.zip.b64
base64 --decode content-hub.zip.b64 > mediagrow-content-hub-v1-functional.zip
sha256sum mediagrow-content-hub-v1-functional.zip
```

Expected SHA-256:

`8b8e2bfee630eec2f553d6bc0ccadc51b52bc23d46a2e9fd4d6df6af232f4f43`

Expected ZIP size: `29629` bytes.
Expected combined Base64 size: `39508` characters.

The archive contains the Next.js frontend, Supabase migration, Supabase Edge Function publish worker, scheduler SQL, and deployment configuration.
