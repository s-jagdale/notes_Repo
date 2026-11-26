# 06 · Test Report — what was verified, and what still needs YOUR credentials

Date of testing: 19 Nov 2026 · Node v22 · Chrome (headless) driven by Playwright.

## The honest summary

**I did not have your AWS account or MongoDB Atlas cluster.** So nothing below was run against *real* AWS S3 or *real* MongoDB Atlas. I tested the same code against:

| Real service | Stand-in used for testing | Same protocol/API? |
|---|---|---|
| MongoDB Atlas | **FerretDB 1.24** (a MongoDB-wire-protocol server, SQLite storage) driven by the official MongoDB driver / Mongoose | Yes — same driver and commands, but not Atlas (no TLS, no SRV address, no IP allow-list, no real MongoDB engine) |
| AWS S3 | **s3rver** (an S3-compatible server) called by the **real AWS SDK v3** over HTTP with SigV4 signing and pre-signed URLs | Yes for the SDK calls, but **not** AWS: no real IAM policy evaluation, no real region redirects, no real 403 semantics |

Therefore: **everything that is application logic is tested; everything that depends on AWS/Atlas account configuration is *not* tested** and must be checked by you with `npm run check` (Section C).

## A. Automated backend tests — `cd server && npm test` → **16 / 16 passed**

| # | What is proven |
|---|---|
| 1 | `/api/health` reports MongoDB and S3 reachable |
| 2 | Register + login; password hash never returned; duplicate e-mail rejected; wrong password → 401; weak password → 400; admin role only for `ADMIN_EMAILS` |
| 3 | Notes API refuses requests without / with a bad token |
| 4 | Upload validation: `.txt` rejected, fake PDF (wrong signature) rejected, missing title rejected, semester 12 rejected, 3 MB file with 2 MB limit → 413; **no database record created for any rejected upload** |
| 5 | **Upload puts the file in S3 *and* the record in MongoDB**, key format `Semester-5/cloud computing/<id>-unit1.pdf`, S3 size = stored size |
| 6 | Duplicate file (same SHA-256) rejected (409) |
| 7 | Browse, search (case-insensitive, special characters escaped), filters, `mine`, pagination, bad filter → 400, filter lists correct |
| 8 | **View/Download: the pre-signed URL returns byte-identical PDF**; `inline` vs `attachment`; counters incremented |
| 9 | Dashboard statistics |
| 10 | **Restart simulation:** a brand-new app instance on the same database/bucket lists and serves the same notes |
| 11 | File deleted behind the app's back → clear `S3_OBJECT_MISSING` (404), not a crash |
| 12 | Admin S3↔MongoDB report finds both kinds of mismatch; **import** creates records for console-style keys (and downloads them correctly); import is repeatable; "remove broken" works; non-admin gets 403 |
| 13 | Delete: other student → 403, owner OK, admin OK; **S3 object and DB record both gone**; 404/400 for unknown/invalid ids |
| 14 | **Wrong bucket name** → 502 `S3_NO_BUCKET` with a helpful message, **no database record left behind**, health = degraded |
| 15 | **S3 unreachable** → 503 `S3_NETWORK` message |
| 16 | S3 key parser handles `Semester-N/Subject/file.pdf` and `Semester-N/Subject/Category/file.pdf` |

## B. Real-process end-to-end test through the browser — **24 / 24 passed**

Started as separate processes: FerretDB, fake S3, `node src/index.js`, `vite` dev server. Chrome clicked through the real UI.

| Area | Verified |
|---|---|
| Frontend ↔ backend | React app reaches the API through the Vite proxy (`/api/health` via port 5173) |
| Auth | Redirect to login; wrong login error; register; admin link only for admin; student sees no Admin link and no Delete on others' notes; `/admin` redirects students away |
| Existing bucket content | Two console-style PDFs (`Semester-1/cloud computing/…`) were **imported and appear in Browse** |
| Upload | Real UI upload of a PDF → success; same PDF again → rejected as duplicate; `.txt` blocked in browser |
| View | New tab requests a **signed S3 URL** (signature + 300 s expiry + `inline`), S3 answers 200 |
| Download | Browser download is **byte-identical** to the source file, with the right file name |
| Search / filter | search, semester filter, category filter give the right counts |
| Admin | Report sees a file added directly to S3; **Import** fixes it; dashboard totals correct |
| **Persistence** | Backend killed → red "Cannot reach the server" banner and Retry panel (user stays logged in) → backend restarted → **all notes still listed and downloadable** |
| Delete | Admin deletes through the UI; card disappears |
| Console | No JavaScript errors |

Bugs found and fixed *by* this testing: (1) a short backend outage logged users out (token was being discarded on any error — now only on 401); (2) several test-harness mistakes (not application bugs).

## C. NOT tested — please do these with your own credentials (≈10 minutes)

Run `cd server && npm run check`, then tick the table. Write what you actually saw in the last column and take screenshots for your report.

| # | Check | How | Expected | Result (fill in) |
|---|---|---|---|---|
| C1 | `.env` complete | `npm run check` step 1 | PASS | |
| C2 | Atlas connects (TLS, SRV, IP allow-list, credentials) | `npm run check` step 2 | PASS | |
| C3 | Bucket + region + keys correct | step 3 "HeadBucket" | PASS | |
| C4 | IAM policy sufficient (list/put/get/delete) | step 3 other lines | PASS ×5 | |
| C5 | Real pre-signed URL works from your region | step 3 "Temporary download link" | PASS | |
| C6 | Import your existing files | `npm run import-s3` | lists your 2 PDFs as imported | |
| C7 | Upload in the app → object visible in S3 console under `Semester-N/<subject>/` | UI | object present | |
| C8 | Same upload → document visible in Atlas → Browse Collections → `notes` | Atlas UI | document with matching `s3Key` | |
| C9 | View/Download a **large** file (your 3.6 MB PDF) | UI | opens/downloads fully | |
| C10 | Restart `npm run dev`, refresh browser | UI | notes still there | |
| C11 | Negative tests: wrong bucket name, wrong secret, wrong Atlas password | edit `.env`, run `npm run check` | each gives its specific message | |
| C12 | Link expires | wait > 5 min after copying a View URL | AccessDenied/expired | |
| C13 | Anonymous access blocked | open `https://<bucket>.s3.<region>.amazonaws.com/<key>` without signature | AccessDenied | |

If any C-step fails, the message printed by `npm run check` says which setting to fix (also see README §10).

## D. Re-verification before packaging (19 Nov 2026, fresh FerretDB + fake S3, Node v22)

| Re-run | Result |
|---|---|
| `npm test` on a freshly started, empty FerretDB | **16 / 16 passed** (same as section A) |
| `npm run build` (client) | builds, 42 modules, no errors |
| `npm run check` with no `.env` | fails with clear FAIL lines for each missing value, no crash |
| **Real server process** (`node src/index.js`) + fake S3 pre-seeded with two PDFs under `Semester-1/cloud computing/`, driven with curl | register admin/student OK · notes list is **empty before import** while S3 already holds 2 files (this reproduces the original "files in S3 but not in the app" problem) · admin import creates both records · student uploads a new PDF · duplicate → `DUPLICATE` · `.txt` → `NOT_PDF` · signed URL downloads a file whose **SHA-256 equals the original** · server killed and restarted → all 3 notes still listed and viewable · other student's delete → `FORBIDDEN`, admin delete OK |

**Browser run after the UI redesign (22 Nov 2026):** 26 of 26 Playwright checks passed on the new interface. A later dark-mode navigation contrast fix was rebuilt but the browser run was not repeated after it.

**A check that does *not* pass on the stand-in, and why that is not an app bug:** requesting the object URL *without* a signature returned HTTP 200. The fake S3 server (`s3rver`) serves anonymous reads of any object (confirmed with a plain, unauthenticated request that bypasses the app entirely). A real AWS bucket with *Block Public Access* on returns 403. That is why check **C13** below is listed as untested: only your real bucket can prove it.
