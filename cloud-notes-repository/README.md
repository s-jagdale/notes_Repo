# Cloud-Based Student Notes Repository

Upload, store, search, view and download semester notes (PDF). Built for a TY B.Tech Cloud Computing project.

| Layer | Technology | Job |
|---|---|---|
| Frontend | React 18 + Vite, plain CSS | Pages: login, browse/search, upload, dashboard, admin |
| Backend | Node.js + Express (REST API) | Login, validation, talks to S3 and MongoDB |
| Database | **MongoDB Atlas** (free M0 cluster) | Users + note metadata + the **S3 object key** |
| File storage | **Amazon S3** (your existing bucket, private) | The actual PDF files |
| AWS access | AWS SDK for JavaScript **v3** | Upload, check, delete, temporary download links |

No other AWS service is used (no EC2, Lambda, RDS, DynamoDB or CloudFront).

> Read `docs/01_ANALYSIS_AND_ARCHITECTURE.md` first. It explains why the previous version could not show S3 notes and how this version fixes it.

---

## 1. How it works (30-second version)

```
Browser (React)  ──HTTPS/JSON──▶  Express API  ──▶  MongoDB Atlas   (who uploaded what, title, subject, s3Key…)
                                       │
                                       └──────────▶  Amazon S3       (the PDF itself, bucket stays PRIVATE)
```

**Upload:** browser → API → validate → **PutObject to S3** → check S3 really has it → **save metadata + s3Key in MongoDB**.
**View/Download:** browser asks API → API finds the note in MongoDB → checks the file exists in S3 → creates a **5-minute pre-signed URL** → browser opens it.

The list of notes always comes from MongoDB, and every MongoDB record points to its file with `s3Key`. Files that were put into S3 by hand (AWS console) are linked by **Import from S3** (step 6).

---

## 2. Prerequisites

* Node.js 18 or newer (`node -v`) and npm
* Visual Studio Code
* Your existing S3 bucket (default in this project: `student-notes-repo-2026-demo01`, region `ap-south-1`)
* A free MongoDB Atlas account

---

## 3. Configure AWS (existing bucket, no new resources)

### 3.1 Check the bucket
* Keep **Block all public access = ON** (Permissions tab). The app never needs a public bucket.
* **No bucket CORS needed.** The browser never uploads to S3 directly; only your backend talks to S3.
* Note the bucket **name** and **region** (shown top-right in the console, e.g. *Asia Pacific (Mumbai)* = `ap-south-1`).
* Optional but recommended: Properties → Bucket Versioning → Enable.

### 3.2 Create a dedicated IAM user with minimum permissions
1. AWS Console → **IAM → Policies → Create policy → JSON**, paste (replace the bucket name if yours differs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::student-notes-repo-2026-demo01"
    },
    {
      "Sid": "ObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::student-notes-repo-2026-demo01/*"
    }
  ]
}
```
Name it `student-notes-app-policy`.

2. **IAM → Users → Create user** (name `student-notes-app`, no console access) → attach the policy above.
3. User → **Security credentials → Create access key → "Application running outside AWS"** → copy the **Access key ID** and **Secret access key** (shown only once).

Why `s3:ListBucket` is included: without it, S3 answers **403** (not 404) for a file that does not exist, which looks exactly like a permission error and is confusing to debug. It is also needed by *Import from S3*.

Never use root-account keys, and never commit keys to Git.

---

## 4. Configure MongoDB Atlas

1. Atlas → create a **free M0** cluster (pick a region near you, e.g. Mumbai).
2. **Database Access → Add New Database User** → username + password (use letters and numbers only, to avoid URL-encoding problems) → role *Read and write to any database*.
3. **Network Access → Add IP Address** → *Add Current IP Address* (for a classroom demo you may use `0.0.0.0/0`, but do not do that for real data).
4. **Database → Connect → Drivers → Node.js** → copy the connection string:
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
5. Replace `<password>` and **add the database name** before the `?`:
   `mongodb+srv://myuser:MyPass123@cluster0.xxxxx.mongodb.net/student_notes?retryWrites=true&w=majority`

Collections (`users`, `notes`) are created automatically the first time the app saves data.

---

## 5. Install and run

Open the project folder in VS Code, then open a terminal (**Terminal → New Terminal**).

```bash
# 1. install everything (one time)
npm run setup
#    (same as:  cd server && npm install  and  cd ../client && npm install)

# 2. create your settings file
cd server
cp .env.example .env        # Windows PowerShell:  copy .env.example .env
```

Open `server/.env` and fill in:

| Variable | What to enter |
|---|---|
| `MONGODB_URI` | Atlas string from step 4.5 |
| `JWT_SECRET` | any long random text. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_EMAILS` | e-mail(s) that become admin when they register, e.g. `you@gmail.com` |
| `AWS_REGION` | e.g. `ap-south-1` |
| `S3_BUCKET_NAME` | bucket **name only** (no `s3://`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | from step 3.2 |
| `S3_ENDPOINT` | **leave empty** |

### Test your connections first (important)

```bash
cd server
npm run check
```

It tests `.env` → MongoDB → S3 (bucket, listing, upload, signed download link, delete) and prints **PASS/FAIL with the exact fix** for every step. Do not continue until everything is PASS.

### Start the app (two terminals)

```bash
# Terminal 1 - backend  (http://localhost:4000)
cd server
npm run dev

# Terminal 2 - frontend (http://localhost:5173)
cd client
npm run dev
```

Open **http://localhost:5173**, click **Register** (use an e-mail from `ADMIN_EMAILS` to get the admin role).

Production-style run of the backend: `npm start` (no auto-restart). Build the frontend: `cd client && npm run build`.

---

## 6. Show the notes that are already in your bucket

Your bucket already contains files uploaded by hand, e.g. `Semester-1/cloud computing/Cloud_Computing_Foundations_Unit_1_Notes.pdf`. The app lists notes from MongoDB, so those files need records. Choose one:

* **In the app:** log in as admin → **Admin** → **Import from S3**; or
* **Command line:** `cd server && npm run import-s3`

It reads the key layout `Semester-<N>/<Subject>/<file>.pdf` (also `Semester-N/Subject/Category/file.pdf`) and creates the records, using S3's real upload date. It is safe to run many times. Files that do not follow the layout are listed as "skipped".

Other admin helper: `npm run make-admin -- someone@example.com` promotes an existing user.

---

## 7. Features

* Register / login (bcrypt-hashed passwords, JWT tokens), student and admin roles
* Upload PDF (type + signature + size validation, duplicate-file detection by SHA-256)
* Browse, search (title / subject / description), filter (semester, subject, category), sort (recent, most downloaded, title), pagination
* **View** (inline in a new tab) and **Download** through temporary pre-signed links
* Delete: owner or admin; removes the S3 file **and** the database record
* Dashboard: totals, recent uploads, most downloaded, notes per semester, my uploads
* Admin: S3 ↔ MongoDB consistency report, import files from S3, remove broken records
* Health banner when the API, MongoDB or S3 is not reachable
* Interface: semester index tabs, colour-coded binder cards (colour = subject), grid / list layout, drag-and-drop upload with progress bar, light and dark mode (choices are remembered), responsive down to phone width

## 8. REST API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | MongoDB + S3 status |
| POST | `/api/auth/register`, `/api/auth/login` | public | get a JWT |
| GET | `/api/auth/me` | user | current user |
| GET | `/api/notes?search=&semester=&subject=&category=&sort=&page=&limit=&mine=1` | user | browse |
| GET | `/api/notes/meta`, `/api/notes/stats` | user | filter values / dashboard |
| POST | `/api/notes` (multipart: `file`, `title`, `subject`, `semester`, `category`, `description`) | user | upload |
| GET | `/api/notes/:id/url?mode=view\|download` | user | temporary S3 link |
| DELETE | `/api/notes/:id` | owner/admin | delete |
| GET | `/api/admin/s3-report` | admin | compare S3 vs MongoDB |
| POST | `/api/admin/sync-s3`, `/api/admin/remove-broken` | admin | import / clean up |

## 9. Project structure

```
cloud-notes-repository/
├── README.md                     ← you are here
├── docs/                         ← architecture, learning roadmap, CO mapping, viva Q&A, demo script, test report
├── server/
│   ├── .env.example              ← copy to .env
│   ├── src/
│   │   ├── index.js              start-up: check .env → connect MongoDB → check S3 → listen
│   │   ├── app.js                Express app (middleware + routes)
│   │   ├── config.js, db.js      settings + MongoDB connection and friendly errors
│   │   ├── s3.js                 ALL AWS S3 code (SDK v3) + AWS error explanations
│   │   ├── models/               User.js, Note.js (Mongoose schemas)
│   │   ├── routes/               auth.js, notes.js, admin.js
│   │   ├── middleware/           auth.js (JWT), errorHandler.js
│   │   ├── services/s3Sync.js    S3 ↔ MongoDB comparison and import
│   │   └── utils/                validators.js, errors.js
│   ├── scripts/                  check-config.js, import-s3.js, make-admin.js
│   └── tests/                    automated integration tests (npm test)
└── client/
    ├── src/
    │   ├── api.js                the only place that calls the backend
    │   ├── AuthContext.jsx       login state
    │   ├── pages/                AuthPage, Browse, Upload, Dashboard, Admin
    │   └── components/           Navbar, NoteCard, HealthBanner
    └── vite.config.js            proxies /api to the backend in development
```

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Server stops with `[CONFIG] …` list | `.env` incomplete | Fix each numbered item |
| `Could not reach MongoDB within 10 seconds` | Atlas IP not allowed / cluster paused | Atlas → Network Access → add your IP |
| `MongoDB rejected the username or password` | wrong user/password | Re-create the DB user; avoid `@ : /` in the password |
| `S3 bucket "…" was not found` | wrong `S3_BUCKET_NAME` | Copy the exact name from the console |
| `AWS_REGION … does not match the region of the bucket` | wrong region | Use the bucket's region code (e.g. `ap-south-1`) |
| `AWS denied the request (403)` | IAM policy missing an action | Use the policy from step 3.2 (incl. `s3:ListBucket`) |
| `AWS rejected AWS_ACCESS_KEY_ID` / `signature` | wrong/old key or secret | Create a new access key, re-paste (no spaces/quotes) |
| Note listed but **"missing from S3"** | file deleted in the console | Admin → **Remove broken records** |
| File in S3 but not in the app | never had a database record | Admin → **Import from S3** |
| "Cannot reach the server" banner | backend not running | `cd server && npm run dev` |
| Download link says `ExpiredToken`/`AccessDenied` after a while | link older than 5 minutes (or IAM key rotated) | Click View/Download again |

## 11. Tests

```bash
cd server
npm test        # 16 integration tests (needs a MongoDB reachable at TEST_MONGODB_URI, default mongodb://127.0.0.1:27017/notes_test)
```
The tests use a local fake S3 server, never your real bucket. See `docs/06_TEST_REPORT.md` for exactly what has and has not been tested, and the checklist to run with **your** Atlas and AWS credentials.

## 12. Security notes

* Secrets live only in `server/.env` (ignored by Git). The React app contains **no** AWS or MongoDB credentials.
* Bucket is private; access is only through short-lived pre-signed URLs created after the user is authenticated.
* The IAM user can touch only this bucket and only the actions listed.
* Passwords are hashed with bcrypt; login attempts are rate-limited; `helmet` sets security headers; all inputs are validated on the server.
* A pre-signed URL works for anyone who has it until it expires (default 5 minutes, `PRESIGNED_URL_EXPIRES_SECONDS`).
* If a key ever appears in a screenshot, chat or Git history, **delete that access key in IAM and create a new one**.
* `npm audit` may report 2 moderate findings in `react-router` (client). They concern server-side-rendering hydration and redirects to user-supplied URLs; this app is a browser-only SPA and only navigates to fixed internal paths, so neither applies. The backend's runtime dependencies report 0 findings. Upgrading to react-router v7 is a sensible future step.
