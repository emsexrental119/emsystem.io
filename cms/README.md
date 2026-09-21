# EMSYSTEM content manager

The public GitHub Pages site remains at emsystem.co.kr. This Worker serves the
administrator at `/admin/`, authenticates the administrator on the server, stores
draft/published content and new images in D1. Existing 77 images and
19 portfolio groups are preserved by `seed.json`; original image URLs stay valid.

## Connection steps (account owner must sign in first)

1. Install the locked dependencies with `npm ci` and authenticate Wrangler.
2. D1 `emsystem-content` is already provisioned in the owner's account.
   Its identifier and account are saved in `wrangler.jsonc`.
3. Apply all SQL files in `migrations/` through Wrangler's remote D1 migrations.
4. Set Worker secret `ADMIN_PASSWORD_HASH` using Wrangler secret input. Format:
   `100000:<random salt hex>:<PBKDF2-SHA256 32-byte hash hex>`; the salt is encoded
   as its UTF-8 hex string for derivation. Never store a password or its hash in
   source, a public repository, or a client bundle. Username is a non-secret var.
5. Deploy, verify login/logout, uploads, draft isolation and publication against
   the actual Worker URL, then run `node scripts/prepare-site.mjs https://WORKER_ORIGIN`
   to wire the public site. Commit only the resulting public bundle, index and
   admin redirect after checking the live backend. The generated public bundle
   uses the original embedded content if the service is temporarily unavailable.
6. Deploy the public site via the existing GitHub Pages workflow. `/admin/` then
   redirects to the Worker. There is no password, privileged token or server
   credential in any public asset.

`npm test` exercises authentication, CSRF, expired/revoked sessions, rate limits,
draft/publish isolation, conflict detection, uploads and content validation.
Use `npm run deploy -- --dry-run` to check the Worker package before deployment.
Use `npm run deploy` to publish the Worker. On Windows the wrapper uses the
official esbuild WASM package to avoid native sandbox directory-traversal errors.

## Operational notes

- Sessions last 8 hours with Secure, HttpOnly, SameSite=Strict cookies. Admin
  mutations also require same-origin requests and a session-bound CSRF token.
- Draft edits never change public content until publish. Revision checks prevent
  an older tab from overwriting newer changes. Photo removals remove references;
  objects are retained so a draft cannot break currently published photos.
- CMS migrations, the seed and Worker code are backend deployment inputs, not
  files that GitHub Pages executes. Keep credentials in Worker secrets only.
- New uploads are resized to at most 2,000 pixels and compressed as JPEG. The
  server limits each image to 1,536,000 bytes and checks its binary signature.
  Images use D1 BLOB storage, so an R2 subscription is not required. An optional
  IMAGES R2 binding is supported for a future larger media library.
- Five integration tests cover authentication, publication and binary storage,
  including more than 50 image references checked in a single query.
- The local preview adapter is only for this computer and cannot alter the live
  website. Its credential file and database are excluded from source control.
- Existing legacy bundles stay in place for old cached HTML and as a fallback.
