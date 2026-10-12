# The Archive

A faculty past-paper archive built as a static HTML/CSS/JavaScript frontend, with Supabase Auth, Postgres, and private Storage. Vercel serves the frontend and a small function that supplies the public Supabase settings at runtime.

## Features

- Sign in with Google or email and password.
- Browse approved papers and search by title, unit, or code.
- Upload PDF, JPG, PNG, and WEBP files up to 20 MB.
- Keep new submissions private until an administrator approves them.
- Use row-level security for paper metadata and storage objects.
- Track page views with Vercel Web Analytics.

## Deploy

1. Run the SQL in [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor.
2. Configure Supabase Auth providers and redirect URLs.
3. Import this repository into Vercel and add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as environment variables.
4. Deploy the project with the repository root as the project root and `frontend` as the output directory.

Follow [`DEPLOY_SUPABASE_VERCEL.md`](DEPLOY_SUPABASE_VERCEL.md) for the full setup and review workflow.

## Local preview

The static pages can be previewed through any local web server, but authentication and data features require the `/api/config` function. For a complete local run, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then run `npm run dev` from the repository root.

Only the Supabase anon/publishable key belongs in the frontend configuration. Never put a `service_role` key in Vercel client-facing configuration or browser code.