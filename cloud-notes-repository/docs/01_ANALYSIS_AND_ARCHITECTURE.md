# 01 · Analysis, Problems Found and New Architecture

## Phase 1 — What I analysed

### 1.1 Your previous project document (`AWS_S3_Student_Notes_Repository_Project_Guide`)
* **Concept:** a central, private Amazon S3 bucket holding notes, lab manuals, assignments, organised by prefixes such as `Semester-5/Cloud-Computing/Notes/`.
* **Features it describes:** bucket creation, prefixes ("folders"), upload/download in the console, versioning, default encryption, Block Public Access, IAM least privilege, optional lifecycle rule, pre-signed URLs.
* **What it explicitly says it does *not* include:** a website, student login, a database, search, upload API. It lists these as "future enhancements".
* **Consequence:** the document is a *console-managed S3 project*. A web application is therefore a **new layer on top of it**, and that layer is where the "notes not showing" problem came from.

### 1.2 Your starter code (`cloudnotes-starter.zip`)
* React + Vite frontend, Express backend, **Supabase** (Postgres + Auth) for metadata, S3 with **pre-signed PUT upload straight from the browser**.
* It is *not* MongoDB, so it does not match the architecture you asked for in this brief; I rebuilt rather than patched it.
* Only a list + download exists; there is **no upload screen** in the React code (the backend has the upload-URL route, the UI never calls it).

### 1.3 Your S3 screenshots
Bucket `student-notes-repo-2026-demo01` (Asia Pacific – Mumbai) contains `Semester-1/` … `Semester-4/`. Inside `Semester-1/cloud computing/` there are two PDFs (`Cloud_Computing_Foundations_Unit_1_Notes.pdf`, 3.6 MB, and `…Unit_2.pdf`, 944.6 KB) with **Last modified 27 Oct 2026**, i.e. they were uploaded by hand in the console.

### 1.4 Course Outcomes image
Six COs (CO1–CO6) for course 2310323T. Mapping is in `03_CO_MAPPING.md`. CO2 (compute configuration) needs EC2-type services, which you asked me not to add; I do **not** claim it. **5 of 6 (83 %)** are demonstrated.

> **Security warning about the starter ZIP.** `server/.env` inside it contains what look like a real **AWS access key + secret** and Supabase keys. I did not copy them anywhere. Because they were shared in a ZIP, treat them as exposed: **IAM → Users → (that user) → Security credentials → Deactivate/Delete the key, create a new one**, and never share `.env` files again.

---

## Phase 2 — Why uploaded notes did not appear (root-cause analysis)

I could not see your old running system, so these are the causes that the evidence (your screenshots + starter code) supports. They are ranked by likelihood.

| # | Cause | Evidence | Effect |
|---|---|---|---|
| 1 | **S3 and the database were two separate sources of truth.** The app lists rows from the database only. Files put into S3 through the console have *no row*. | Your two PDFs have console timestamps (27 Oct 2026); the starter's `GET /api/notes` reads only the `notes` table. | Files are visibly in S3 but the app shows "no notes". **This is the most likely reason.** |
| 2 | **Database row was saved without verifying S3.** The starter's `POST /api/notes` stores `s3Key` without checking the object exists. | `index.js`: only a string-prefix check on `s3Key`. | If the browser's PUT failed, a row exists with no file (or the reverse). |
| 3 | **Browser → S3 direct upload needs bucket CORS.** Starter README says "configure CORS if the pre-signed PUT requires it". Without a correct CORS rule the browser blocks the upload. | Starter README §4. | Upload "fails silently" from the user's view. |
| 4 | **Different key layouts.** Console used `Semester-1/cloud computing/…`, the app writes `notes/<userId>/<uuid>-name.pdf`. | Screenshots vs. `index.js`. | Two unrelated folder schemes in one bucket, nothing links them. |
| 5 | **Permissions/region/bucket-name mistakes are indistinguishable.** S3 returns a bare 403 (or 404 for HEAD) for wrong bucket, wrong region, missing `s3:ListBucket`, or bad keys. The starter returns a generic 500. | `index.js` error handler. | Developers cannot tell *which* thing is wrong. |
| 6 | **Row-level security (RLS) in Supabase** can silently return an empty list. | Starter README warns that RLS is unfinished. | Empty list even when rows exist. (No longer applicable: Supabase is gone.) |
| 7 | **Private bucket ≠ public URL.** Showing a plain S3 URL in `<a href>` gives *AccessDenied*. | Your doc's own Step 8 notes this. | Links "do not work". |

### How the new design removes each cause
| Cause | Fix in this project |
|---|---|
| 1 | **Admin → Import from S3** / `npm run import-s3` creates a MongoDB record for every PDF already in the bucket (reads `Semester-N/Subject/file.pdf`, keeps S3's date). **Admin → S3 report** shows differences in both directions at any time. |
| 2 | Upload order is **S3 first → verify with `HeadObject` (same size) → only then save in MongoDB**. If the DB save fails, the S3 file is deleted again. Delete is the reverse (S3 first, then DB). |
| 3 | **Browser never talks to S3 for uploads.** Upload goes browser → backend → S3, so no CORS on the bucket is needed. |
| 4 | New uploads use `Semester-<n>/<subject folder>/<id>-<file>.pdf`, the **same layout** as your console folders. |
| 5 | `src/s3.js` translates AWS errors into plain advice (wrong bucket, wrong region, bad key, bad secret, 403 policy, network). `npm run check` tests each step. `/api/health` + red banner show problems in the UI. |
| 6 | MongoDB with the API as the only gate (no client-side DB access). |
| 7 | Files are opened via **pre-signed URLs** created by the backend after login. Bucket stays private. |

---

## Phase 2b — New architecture

```
                         ┌──────────────────────────── Your laptop / server ────────────────────────────┐
  ┌──────────────┐ HTTP  │  ┌─────────────────────────────────────────────┐                              │
  │   Browser    │──────▶│  │ Express API (Node.js)                       │      TLS     ┌────────────┐  │
  │  React app   │ JSON  │  │  routes → validation → business logic       │─────────────▶│ MongoDB    │  │
  │ (Vite :5173) │◀──────│  │  JWT auth · bcrypt · helmet · rate limit    │  metadata    │ Atlas (M0) │  │
  └──────┬───────┘       │  │                                             │              └────────────┘  │
         │               │  │  src/s3.js  (AWS SDK v3)                    │      TLS     ┌────────────┐  │
         │               │  └─────────────────────────────────────────────┘─────────────▶│ Amazon S3  │  │
         │               └──────────────────────────────────────────────────  PDF bytes  │ (private)  │  │
         │                                                                               └─────┬──────┘  │
         └────────── opens 5-minute pre-signed URL (GET only, straight from S3) ◀──────────────┘         │
```

**Design rules**
1. Browser never holds AWS or database credentials.
2. S3 stores bytes; MongoDB stores facts about the bytes (and the key to find them).
3. Every note = one MongoDB document + one S3 object, linked by `s3Key` (unique index).
4. Nothing is public; downloads use short-lived signed links.
5. Only the S3 service is used from AWS (plus IAM, which is the permission system of S3 itself).

### Why these technology choices (viva-ready)
| Choice | Reason | Alternative rejected |
|---|---|---|
| Upload via backend (multer, memory) | Simple, no CORS, validate content before it reaches S3, can verify and roll back | Browser pre-signed PUT: more moving parts (CORS, no server-side validation of content, two-step commit) |
| Pre-signed GET for view/download | Private bucket, expiring links, no proxying of large files through our server | Public bucket (insecure) · streaming through Express (uses our bandwidth) |
| MongoDB Atlas | Flexible JSON documents fit note metadata; free M0 tier; no AWS service needed | RDS (extra AWS service, cost) · DynamoDB (extra AWS service) |
| JWT + bcrypt | Standard, stateless, taught in web-dev subjects | Cognito (extra AWS service) |
| 20 MB memory upload limit | Notes are small PDFs; keeps code simple | Multipart/stream upload (more complex) |

---

## Phase 3 — Database structure

MongoDB database `student_notes`, two collections.

### `users`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | auto |
| `name` | String | 2–60 chars |
| `email` | String | **unique**, lowercase |
| `passwordHash` | String | bcrypt hash, never the password |
| `role` | `"student"` \| `"admin"` | admin if e-mail in `ADMIN_EMAILS` |
| `createdAt`, `updatedAt` | Date | automatic |

### `notes`
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `title`, `description` | String | user-entered |
| `subject` | String | normalised ("cloud computing" → "Cloud Computing"), indexed |
| `semester` | Number 1–8 | indexed |
| `category` | enum | Notes, Assignments, Lab Manual, Question Papers, Reference, Other |
| `originalName` | String | file name shown on download |
| **`s3Key`** | String, **unique** | **the link to S3**, e.g. `Semester-5/cloud computing/1a2b3c4d-Unit_1.pdf` |
| `sizeBytes`, `contentType` | Number, String | from the verified S3 object |
| `contentHash` | String | SHA-256, used to reject duplicate uploads |
| `uploadedBy` | ObjectId → users | `null` for imported files |
| `uploaderName` | String | copy of the uploader's name (so the list needs no join) |
| `source` | `"upload"` \| `"s3-import"` | |
| `downloadCount`, `viewCount` | Number | for "most downloaded" |
| `createdAt`, `updatedAt` | Date | imports keep S3's real date |

**Indexes:** `users.email` (unique), `notes.s3Key` (unique), `notes.subject`, `notes.semester`, `notes.category`, `notes.contentHash`, `notes.createdAt`.
**Denormalisation:** `uploaderName` is copied into each note. Trade-off: faster lists, but a later name change is not reflected in old notes (acceptable here).
**Not stored:** file bytes, passwords, pre-signed URLs (they are generated on demand).

## S3 workflow (step by step)

**Upload**
1. Student picks a PDF → React checks type/size → `POST /api/notes` (multipart, with JWT).
2. Express verifies the JWT, then multer holds the file in memory (max `MAX_FILE_SIZE_MB`).
3. Server checks: MIME type, `.pdf` extension, real content starts with `%PDF-`, required fields valid, SHA-256 not already stored.
4. `PutObject` → bucket, key `Semester-<n>/<subject>/<8-char-id>-<safe-name>.pdf`.
5. `HeadObject` → confirm the object exists with the same size (S3 ↔ server agreement).
6. Save the MongoDB document with `s3Key`. *If this fails → `DeleteObject` the file (no orphans).*
7. Reply `201` → UI shows success.

**View / download**
1. UI calls `GET /api/notes/:id/url?mode=view|download`.
2. Server loads the note (MongoDB) → `HeadObject(s3Key)`; if missing → clear **404 S3_OBJECT_MISSING**.
3. Server signs `GetObject` locally (no network call) → URL valid 300 s, with `Content-Disposition: inline|attachment`.
4. Browser opens the URL → bytes come **directly from S3**.

**Delete** — owner or admin → `DeleteObject` first, then remove the MongoDB document.

**Import (repair)** — list all objects → compare keys with `notes.s3Key` → create documents for new PDFs that match `Semester-N/Subject/file.pdf`.

## Application features (selected after evaluating the list in your brief)

| Feature | Included? | Why |
|---|---|---|
| Registration/login, roles | ✅ core | needed for "uploader information" and authorised delete |
| Upload / browse / search / filter / view / download / delete | ✅ core | |
| Subject- & semester-wise organisation, categories | ✅ | filters + same layout in S3 |
| Recently uploaded, most downloaded | ✅ | two small queries |
| Student dashboard | ✅ | totals, my uploads, per-semester bars |
| Admin tools | ✅ (kept small) | S3↔DB report, import, clean-up, delete any note |
| File size & format validation | ✅ | client + server |
| **Extra I added** | S3 consistency report/import, duplicate detection, health banner, `npm run check` | directly solve the original problem |
| **Deliberately left out** | e-mail verification, password reset, comments/ratings, virus scan, CloudFront | would add complexity without helping the course outcomes (listed under future scope) |

**Known limitations (be honest in viva):** files up to 20 MB only; duplicate detection only covers files uploaded through the app (imported files have no hash); JWT stored in `localStorage` (fine for a college project, an `HttpOnly` cookie is stronger); text search uses regular expressions (fine for hundreds of notes, a MongoDB text/Atlas Search index would scale better); no virus scanning.
