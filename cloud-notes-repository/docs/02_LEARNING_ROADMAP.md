# 02 · Learning Roadmap (read in this order)

Plan: about 6–8 hours in total. For every stage: **read → open the file named → run it → change one small thing → watch what happens.**

---

## Stage 1 — Architecture and workflow (45 min)
**Idea.** An application has layers: *what the user sees* (frontend), *the rules* (backend), *the facts* (database) and *the big files* (storage). Splitting them lets each do one job.

**In this project**
* Frontend `client/` — React, runs in the browser.
* Backend `server/` — Express, runs on Node.js. Only it knows passwords/keys.
* MongoDB Atlas — stores users and note details.
* S3 — stores PDF bytes.

**Do:** read `docs/01_ANALYSIS_AND_ARCHITECTURE.md` (diagram + workflows). Draw the upload workflow on paper from memory.
**Check yourself:** Why is the PDF *not* stored in MongoDB? Why does the browser not hold the AWS key?

---

## Stage 2 — React frontend basics (1 h)
**Concepts used**
* **Component** — a function that returns HTML-like code (JSX): `NoteCard`, `Navbar`.
* **State** (`useState`) — values that, when changed, redraw the screen (e.g. the search text, the list of notes).
* **Effect** (`useEffect`) — code that runs after drawing, usually to fetch data (`Browse.jsx` loads notes).
* **Props** — inputs to a component (`<NoteCard note={…} />`).
* **Routing** (`react-router-dom`) — different URLs show different pages (`/upload`, `/dashboard`).
* **Context** (`AuthContext.jsx`) — shared data, here "who is logged in".

**Open and read, in order:** `client/src/main.jsx` → `App.jsx` → `pages/Browse.jsx` → `components/NoteCard.jsx` → `pages/Upload.jsx`.
**Try:** change the number of notes per page (`limit: 9` in `Browse.jsx`) and see the grid change.
**Why Vite?** A fast tool that serves React during development and builds it for production. Its `proxy` in `vite.config.js` forwards `/api` to the backend.

---

## Stage 3 — Node.js and Express backend (1 h)
* **Node.js** runs JavaScript outside the browser.
* **Express** receives HTTP requests and calls the function registered for each URL.
* **Middleware** = steps a request passes through (`app.js`): security headers → CORS → JSON parser → routes → error handler.
* **async/await** — wait for slow things (database, S3) without freezing the server. `asyncHandler` forwards failures to the error handler.
* **Validation** (`utils/validators.js`) — never trust input.

**Read:** `server/src/index.js` (start-up order) → `app.js` → `routes/notes.js` → `middleware/auth.js`.
**Try:** call the API without the frontend: `curl http://localhost:4000/api/health`.

---

## Stage 4 — REST API communication (45 min)
* A **REST API** is a set of URLs + HTTP verbs: `GET` read, `POST` create, `DELETE` remove.
* Data travels as **JSON**; files travel as **multipart/form-data**.
* Replies carry a **status code**: 200 OK, 201 created, 400 bad input, 401 not logged in, 403 not allowed, 404 not found, 409 duplicate, 413 too large, 502/503 a cloud service problem.
* **JWT** — a signed token that proves who you are; sent as `Authorization: Bearer <token>`.

**Do:** open the browser's DevTools → Network tab → upload a file → click the request → see URL, method, headers, status, response. Match each to the API table in the README.

---

## Stage 5 — MongoDB Atlas and collections (1 h)
* **Document database:** data is stored as JSON-like documents grouped in **collections** (like tables, but flexible).
* **Atlas** is MongoDB run for you in the cloud. You must allow your IP (**Network Access**) and create a **database user**.
* **Mongoose** defines a **schema** (`models/Note.js`): field types, required, allowed values.
* **Index** = a lookup table that makes searching fast; a **unique index** forbids duplicates (`s3Key`, `email`).
* **Aggregation** = grouping/counting (used for "notes per semester").

**Do:** after uploading, open Atlas → Browse Collections → `notes` → find your document and read `s3Key`. Compare that text to the key in the S3 console. *That equality is the whole integration.*

---

## Stage 6 — AWS S3: buckets, objects, uploads, downloads (1 h)
* **Bucket** (container, globally unique name, belongs to a region) → **objects** (file + metadata) → **key** (the object's name).
* Slashes in keys give "folders" (prefixes) in the console — only a display trick.
* **Private by default.** Block Public Access stays on.
* **Pre-signed URL** = a temporary, signed link to one object.
* **IAM** = who may do what. We created a user that can only touch this bucket.
* **Versioning / encryption / lifecycle** = optional features described in your earlier document.

**Do:** open your bucket → `Semester-1/cloud computing/` → click an object → try its "Object URL" in the browser (AccessDenied) → then use the app's View (works). Explain why.

---

## Stage 7 — AWS SDK for JavaScript v3 (45 min)
Everything is in **one file**: `server/src/s3.js`.
* `S3Client` — the connection object (region + credentials).
* Commands — `PutObjectCommand`, `HeadObjectCommand`, `GetObjectCommand`, `DeleteObjectCommand`, `ListObjectsV2Command`, `HeadBucketCommand`; sent with `client.send(command)`.
* `getSignedUrl` — from `@aws-sdk/s3-request-presigner`, creates the temporary link **locally** (no network call).
* Error handling — `explainS3Error` turns AWS error names into advice.

**Try:** run `npm run check` and read each PASS line next to the function in `check-config.js` that produced it.

---

## Stage 8 — Putting frontend + backend + database + cloud together (1 h)
Trace one upload end to end, with the files open side by side:

1. `Upload.jsx` → `api.upload()` (`api.js`)
2. `routes/notes.js` `router.post('/')` → multer → validation
3. `s3.js` `putObject` → S3
4. `s3.js` `headObject` (verify)
5. `models/Note.js` → `Note.create` → Atlas
6. Response → `Upload.jsx` shows success

Then trace **View**: `NoteCard.jsx` → `utils.js openNote` → `GET /api/notes/:id/url` → `getTemporaryUrl` → browser opens it.
**Remember the rule:** *list comes from MongoDB, file comes from S3, `s3Key` joins them.*

---

## Stage 9 — Testing and debugging (1 h)
* **Layered debugging:** is it the **frontend** (DevTools console), the **API** (server terminal), the **database** (Atlas), or **S3** (AWS error)? `npm run check` tests the last three in isolation.
* **Automated tests:** `npm test` (server/tests/api.test.js). Read one test and see how it uploads a PDF, then downloads it and compares bytes.
* **Typical errors → fixes:** see README §10.

**Experiments (do each once, then undo):**
1. Put a wrong bucket name in `.env` → `npm run check` → read the message.
2. Delete one PDF in the S3 console → open the app → click View → see "missing from S3" → Admin → Remove broken records.
3. Upload a PDF in the S3 console under `Semester-2/maths/test.pdf` → Admin → Import from S3.
4. Stop the backend → see the red banner → start it → Retry.

---

## Glossary
| Term | One-line meaning |
|---|---|
| IaaS / PaaS / SaaS / DBaaS | Rented infrastructure / platform / finished software / managed database |
| Object storage | Files stored by name (key) in a flat bucket, accessed over HTTP |
| Pre-signed URL | Time-limited signed link to a private object |
| IAM | AWS permission system |
| Least privilege | Give only the permissions that are needed |
| ODM | Object-Document Mapper (Mongoose) |
| JWT | Signed login token |
| CORS | Browser rule about calling another origin |
| Middleware | Step that every request passes through |
| Orphan | A file with no record (or a record with no file) |
