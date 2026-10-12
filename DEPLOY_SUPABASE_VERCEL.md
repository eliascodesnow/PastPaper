# Deploy The Archive

The frontend is static and hosted by Vercel. Supabase provides authentication, the Postgres database, and private file storage. There is no Express server, SQLite database, or persistent Vercel filesystem.

## 1. Prepare Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, run the complete contents of [`supabase/schema.sql`](supabase/schema.sql), and confirm it finishes without errors. This creates the profile and paper tables, row-level security policies, and the private `papers` bucket.
3. In **Authentication → Providers**, enable Email. Configure email confirmation as desired.
4. Enable Google in **Authentication → Providers → Google**, add the Google OAuth client credentials, and use the callback URL shown by Supabase in the Google Cloud OAuth client.
5. In **Authentication → URL Configuration**, set the production Site URL to the Vercel domain. Add redirect URLs for `https://<your-domain>/login.html`, `https://<your-domain>/**`, and your local Vercel development URL if needed.

## 2. Configure Vercel

1. Import the repository into Vercel.
2. In **Settings → Build and Deployment**, leave **Root Directory** blank (repository root), use the **Other** framework preset, leave the build command empty, and set the Output Directory override to `frontend`. The `/api/config` function remains at the repository root.
3. In the Vercel project, open **Analytics** and enable **Web Analytics**. The static pages include Vercel's HTML tracking script; enabling analytics makes the `/_vercel/insights/*` endpoint available after deployment.
4. Add these environment variables for Production, Preview, and Development as appropriate:

   - `SUPABASE_URL`: the project URL from Supabase API settings.
   - `SUPABASE_ANON_KEY`: the anon/publishable key from Supabase API settings.

5. Deploy. Verify `/` serves the home page and `/api/config` returns the project URL and anon key.

The anon key is designed to be public. Do not add `SUPABASE_SERVICE_ROLE_KEY`, database passwords, or JWT secrets to the frontend or `/api/config` function.

## 3. Review submissions

Uploads are written to the private Storage bucket under the submitting user's ID and get a `PENDING` row. Only approved rows are visible publicly, and signed download links are issued for approved files. The Storage policies also allow the owner to read their own files.

To approve a submission, use the Supabase SQL Editor after reviewing it:

```sql
update public.papers
set status = 'APPROVED'
where id = '<paper-uuid>';
```

To reject it, set `status = 'REJECTED'`. Do not change storage policies to make the bucket public; pending files must remain private.

## 4. Local development

Install the Vercel CLI, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the shell or a root `.env.local` file, then run `npm run dev` from the repository root. Supabase Auth redirect URLs must include the local URL shown by Vercel.

## Security and operations

- Database access is governed by row-level security. Authenticated clients can only insert pending papers and read their own submissions; public clients can only read approved papers.
- The Storage bucket is private. Uploads are limited to the authenticated user's own folder, with a 20 MB limit and supported document/image MIME types.
- New user profiles are created by a database trigger when Supabase Auth creates a user.
- Existing users and papers from the old local SQLite database are not migrated automatically. Export and review that data separately before removing the local database file.
- The old local `dev.db` file is intentionally not part of this deployment and should be retained until its contents have been backed up or migrated.