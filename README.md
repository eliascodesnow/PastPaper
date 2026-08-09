# The Archive — Faculty Past Papers

A registration-number-gated archive of past exam papers for a single
faculty (ICT, media, engineering — diploma and degree students). Every
upload is screened automatically before publishing, then it's open to the
whole student community, no fees, no gatekeeping.

## How it's built

```
faculty-papers/
  backend/     Node + Express API, SQLite (better-sqlite3), JWT auth
  frontend/    Static HTML/CSS/JS — no build step, no framework
```

**Why this stack:** SQLite means zero external database to provision —
the whole backend runs from `npm install && npm start`. When you're ready
to scale past one deployment box, swapping to Postgres is a contained
change (see "Growing up" below) since every DB call lives in one file,
`backend/src/db.js`.

## Running it locally

```bash
cd backend
cp .env.example .env      # edit JWT_SECRET before you deploy anywhere real
npm install
npm start                 # API on http://localhost:4000
```

Then just open `frontend/index.html` in a browser (or serve the folder
with any static server — `npx serve frontend` works fine). It's already
pointed at `http://localhost:4000/api`.

## Registration number formats

Two families cover every course now and any future one added to the
faculty, without a new regex each time — see
`backend/src/config/regFormats.js`:

- **Diploma:** `PREFIX-DD-NNNN/YYYY` → `DSE-01-0419/2025`, `DIT-02-0311/2025`,
  `DBIT-04-0187/2024`, `DJMC-01-0099/2025`, `DEE-03-0212/2025`, and so on.
- **Degree:** `BSC-XXX-NNNN/YYYY` → `BSC-CS-0419/2025`, `BSC-ENG-0234/2024`.

`KNOWN_DIPLOMA_PREFIXES` / `KNOWN_DEGREE_PREFIXES` in that file give
friendly course names for the prefixes I could reasonably guess (DSE,
DIT, DBIT, DJMC, DEE, DCE, DME, DCS, DMD / CS, IT, SE, ENG, EEE, CE, JMC).
Anything else that fits either shape is still **accepted** — it just
shows up as "Other Diploma (XYZ)" until you add it to the map. Correct
the actual prefixes your faculty uses in that one file; nothing else
needs to change.

## The screening pipeline

`backend/src/services/screening.js` runs a few lightweight, *tested*
checks the moment a file is uploaded — before anything is public:

| Check | What it catches |
|---|---|
| `file_integrity` | Empty/corrupt uploads |
| `pdf_content` (PDFs) | Blank pages / scanned-with-no-text-layer PDFs |
| `image_clarity` (images) | Blur, via edge-sharpness (Laplacian variance) |
| `ink_coverage` (images) | Heavy scribbling/annotation, via dark-pixel ratio |
| `language` | Vulgar words in the title, unit name, or extracted text |

I tuned the image thresholds against real synthetic test cases (clean
page ≈2.5% ink coverage vs. a scribbled one ≈19% — the cutoff sits at
10%; a clean page scores ~sharpness 100+ vs. a blurred one <1 — the
cutoff sits at 12) — you may want to nudge these once real student
uploads start coming in and you can see false positives/negatives.

**This is deliberately an MVP, not a final answer.** Each check is a
small function pushed into a `checks[]` array — adding real OCR (e.g.
Tesseract) or a proper handwriting-vs-print classifier later means
writing one new function and adding it to the pipeline; nothing else in
the upload route changes. Rejected uploads always show the uploader
*exactly* which check failed and why (see `screening-result` on the
upload page), so students aren't left guessing.

An admin override endpoint (`POST /api/papers/:id/override`, requires
`isAdmin: true` on the user record — set that by hand in the DB for now)
exists for the inevitable heuristic misfire.

## Auto-categorization

`backend/src/services/categorize.js` looks at the title, unit name, and
whatever text was extracted from the file, and guesses:
- **Exam type** (CAT / Main Exam / Supplementary / Assignment) from keywords
- **Unit code** (e.g. `BIT 2103`) via pattern match
- **Year** from any 20xx found in the text

The uploader's own form fields always win if provided — categorization
only fills gaps.

## Growing up: hosting recommendation

You said "recommend the best option," so here's my actual pick, not a
menu:

**Railway** (railway.app) for the backend. It gives you a persistent
volume (SQLite + the uploaded files both need to survive redeploys,
which rules out most "free" serverless platforms whose disks reset).
Point a volume at `backend/uploads` and `backend/dev.db`, set your env
vars, deploy from GitHub. Costs roughly $5/mo once you're past the free
trial credit — genuinely cheap for what it does.

For the **frontend**, since it's just static files: **Vercel** or
**Netlify**, both free, both trivial (drag-and-drop the `frontend`
folder or connect the repo). Set `window.API_BASE` in a small inline
script tag to your Railway backend URL before `js/api.js` loads.

**If you outgrow SQLite** (concurrent writes start timing out, or you
want managed backups): Railway also offers a one-click Postgres addon.
Move `backend/src/db.js`'s raw SQL into a Prisma schema at that point —
the two models (`User`, `Paper`) map over directly — and swap the file
storage for Railway's volume → an S3-compatible bucket (Cloudflare R2
has a generous free tier and no egress fees, which matters once
students start downloading a lot of PDFs).

**Alternative if you want full control and already pay for it:** a small
VPS (DigitalOcean, Contabo) running the backend behind Caddy or nginx,
with the frontend served as static files from the same box. More setup,
but no platform lock-in and everything's one `ssh` away.

## Where the AI assistant slots in later

A few seams are already in place for this:
- `screeningReport` on every paper stores the full check output as JSON
  — an assistant could reason over *why* something was flagged.
- `extractedText` from the screening pipeline (currently capped and
  discarded after categorization) is a natural thing to persist per
  paper and feed into a "search papers by content, not just title"
  assistant, or a "summarize what topics this unit's exams cover"
  feature.
- The categorizer's pattern-matching is a placeholder for an LLM call
  doing the same job with more nuance — same call site, same output
  shape.

## Honest limitations right now

- No email/SMS verification on registration — anyone who knows the
  format can register with a made-up (but validly-shaped) number. Add
  verification against an official student list before relying on this
  for anything high-stakes.
- Rejected files stay on disk indefinitely; add a cleanup job before
  production.
- PDF clarity/ink-coverage checks are skipped (only the "has real text"
  check runs) — rendering PDF pages to images and running the same
  checks used for images is the natural next step.
- No rate limiting on uploads or auth endpoints yet.
