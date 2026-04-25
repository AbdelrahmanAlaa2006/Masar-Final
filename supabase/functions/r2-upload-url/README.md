# r2-upload-url — direct-to-R2 PDF upload

This Supabase Edge Function hands the browser a short-lived presigned PUT URL
so the admin can upload PDFs straight to the Cloudflare R2 bucket from the
Lectures admin form. The admin never has to open the Cloudflare dashboard.

## 1. One-time setup

### 1a. Create the R2 API token (in Cloudflare dashboard)

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Permissions: **Object Read & Write**
3. Scope: your bucket (e.g. `masaar-pdfs`)
4. Copy the **Access Key ID**, **Secret Access Key**, and **Account ID**
5. On the bucket → **Settings** → enable **R2.dev subdomain** and copy the
   public base URL, e.g. `https://pub-xxxxxxxx.r2.dev`

### 1b. Install / login to the Supabase CLI

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

### 1c. Store the secrets on Supabase

```bash
supabase secrets set \
  R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx \
  R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  R2_BUCKET=masaar-pdfs \
  R2_PUBLIC_BASE=https://pub-xxxxxxxx.r2.dev
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
by Supabase automatically — do not set them yourself.)

### 1d. Deploy the function

From the project root:

```bash
supabase functions deploy r2-upload-url
```

## 2. Allow the bucket to accept browser PUTs (CORS)

In the R2 bucket **Settings** → **CORS policy**, paste:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Tighten `AllowedOrigins` to your actual web origin in production.

## 3. Frontend

`VITE_R2_PUBLIC_BASE` in `.env` must match the R2.dev subdomain you enabled.
The Lectures admin form now has a file picker — no URL paste needed.

## How it works at runtime

1. Admin picks `lecture.pdf` in the form.
2. Browser calls `supabase.functions.invoke('r2-upload-url', { body: { filename, contentType } })`.
3. The function verifies the JWT, confirms `profiles.role='admin'`, and
   generates a presigned `PUT` for a UUID key like `lectures/<uuid>.pdf`.
4. Browser `PUT`s the bytes directly to R2 (with upload progress).
5. Frontend inserts the lecture row with `pdf_url` + `pdf_key`.
