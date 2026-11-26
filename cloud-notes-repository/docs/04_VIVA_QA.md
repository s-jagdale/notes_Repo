# 04 · Viva Preparation — 50 Questions and Answers

Tags: **[B]** basic · **[I]** intermediate · **[C]** challenging. Answers are written the way you would say them aloud — short first sentence, then detail only if asked.

---

## A. Project introduction and cloud concepts

**Q1 [B] Tell us about your project.**
It is a Cloud-Based Student Notes Repository. Students register, upload PDF notes, and others can search, filter, view and download them. The PDF files are stored in Amazon S3, the details of each note are stored in MongoDB Atlas, and a React frontend talks to a Node.js/Express backend through REST APIs.

**Q2 [B] What problem does it solve, and what were your objectives?**
Notes are scattered across WhatsApp groups and personal devices, so they get lost and are hard to find. Objectives: central storage, easy search by semester/subject/category, secure access, and a working link between our app, database and S3. A second goal was to fix our earlier attempt, where files in S3 did not appear in the app.

**Q3 [B] Which cloud service models and deployment model does your project use?**
Deployment: **public cloud** (AWS, MongoDB Atlas). Service models: **S3 is storage as a service (IaaS-level)**, **MongoDB Atlas is database as a service (managed PaaS-style)**, and our finished web application is **SaaS** for students — they only need a browser. We did not use compute IaaS such as EC2; our backend runs on a local machine.

**Q4 [I] Explain the shared responsibility model with your project.**
AWS is responsible for security *of* the cloud: data-centres, hardware, S3 durability, patching. We are responsible for security *in* the cloud: IAM permissions, keeping the bucket private, protecting access keys, and our application's login and validation. Atlas similarly runs the servers, backups and engine, while we choose the database user, the IP allow-list and the password.

**Q5 [B] Why use the cloud instead of storing files on a college PC?**
Cloud storage is always available over the internet, scales without buying disks, is durable (S3 stores data redundantly across facilities), pay-per-use, and has built-in access control. A single PC is a single point of failure.

**Q6 [I] Walk us through the architecture.**
Browser → React app → Express API → (a) MongoDB Atlas for metadata and users, (b) S3 for PDF bytes. Only the API holds credentials. For viewing, the API creates a temporary signed link and the browser fetches the PDF directly from S3.

---

## B. AWS S3

**Q7 [B] What is Amazon S3?**
Simple Storage Service — AWS object storage. You store files as *objects* inside *buckets* and access them over HTTPS.

**Q8 [B] Bucket vs object vs key?**
A bucket is a globally uniquely named container. An object is the file plus its metadata. The key is the object's name inside the bucket, like `Semester-1/cloud computing/Unit_2.pdf`.

**Q9 [B] Are S3 folders real?**
No. S3 has a flat structure. The slashes in a key create a *prefix*, and the console displays prefixes as folders. That is why our key `Semester-1/cloud computing/…` shows as folders.

**Q10 [I] Is a file uploaded to S3 public automatically?**
No. New objects are private, and Block Public Access is on. Only principals allowed by IAM/bucket policy can read them. That is exactly why a plain S3 URL shows *AccessDenied* and we use pre-signed URLs.

**Q11 [I] What is a pre-signed URL and how does it work?**
A URL that includes the access key ID, an expiry time and a signature (SigV4, computed from the secret key and the request details). S3 recomputes the signature; if it matches and the link is not expired, S3 serves the object with the permissions of the signing user. Our backend signs it locally — no network call — and it expires in 300 seconds.

**Q12 [C] Can someone who gets the link misuse it?**
Yes, until it expires, because it is a bearer link: whoever holds it can do the one signed operation (GET of that one key). We reduce risk with a short expiry, GET-only, one object, and creating it only after authentication. Also, the link is only as powerful as the IAM user that signed it.

**Q13 [I] Which S3 operations does your code use?**
`PutObject` (upload), `HeadObject` (verify size/existence), `GetObject` via pre-signed URL (view/download), `DeleteObject`, `ListObjectsV2` (admin report/import), `HeadBucket` (health check). All through AWS SDK for JavaScript v3.

**Q14 [I] How does S3 provide durability and what about versioning/encryption?**
S3 stores objects redundantly across multiple devices and facilities in a region (designed for 11 nines of durability). Versioning (optional) keeps old versions on overwrite/delete; default server-side encryption (SSE-S3) encrypts data at rest automatically. Encryption does not make a bucket private — access control does.

**Q15 [C] Why did you include `s3:ListBucket` in the IAM policy even though you never "list" for users?**
Two reasons. The admin import uses `ListObjectsV2`. More importantly, without `s3:ListBucket`, S3 returns **403 instead of 404** for a missing key, so a missing file would look like a permission problem and make debugging hard.

**Q16 [I] Object vs block vs file storage vs database — why S3 *and* MongoDB?**

| | Object (S3) | Block (EBS) | File (EFS) | Document DB (MongoDB) |
|---|---|---|---|---|
| Unit | whole object by key | fixed-size blocks | files in directories | JSON-like documents |
| Access | HTTP API | attached to one VM as a disk | NFS mount on VMs | query language |
| Good for | PDFs, images, backups | OS/disks, databases | shared files for servers | structured, queryable records |
| Our use | **PDFs** | not needed (needs EC2) | not needed | **metadata, users** |

PDFs are large, unstructured, rarely changed and need cheap durable storage → object storage. Metadata is small, structured and needs search/filter → database. Storing PDFs in MongoDB would bloat it (16 MB document limit) and cost more.

---

## C. MongoDB and database design

**Q17 [B] What is MongoDB Atlas?**
MongoDB's fully managed cloud database service (DBaaS). We use the free M0 shared cluster.

**Q18 [B] What do you store in MongoDB?**
Two collections: `users` (name, email, bcrypt hash, role) and `notes` (title, subject, semester, category, uploader, size, counts, dates, and the `s3Key`). **Never the file itself.**

**Q19 [I] How are a database record and the S3 object linked?**
By `s3Key`, a unique field in the note document equal to the object's key in the bucket. Upload creates both; delete removes both; the admin report compares both sides.

**Q20 [I] What is Mongoose and why use it?**
An ODM library for Node. It gives schemas (field types, required, enum, max length), validation, and easy queries, so bad data is rejected before reaching the database.

**Q21 [I] Which indexes did you create and why?**
Unique on `users.email` and `notes.s3Key` (data integrity), and on `subject`, `semester`, `category`, `contentHash`, `createdAt` (fast filters, duplicate check, sort by newest).

**Q22 [I] Why MongoDB and not RDS / MySQL?**
Our data is a document per note with fields that may evolve (e.g. add tags later) and no complex joins. MongoDB maps naturally to JSON used by React/Express, has a free Atlas tier, and needs no additional AWS service. RDS would add an AWS service, cost, and a fixed schema we do not need. If we needed transactions across many tables, a relational DB would be the better choice.

**Q23 [C] Why not DynamoDB or Supabase (your previous attempt)?**
DynamoDB is an extra AWS service with a different data-modelling style (access patterns first), harder to explain and filter by several fields. Supabase (PostgreSQL) was our earlier choice; its row-level-security rules were unfinished and can silently return empty lists, and the new brief asked for MongoDB. For a student project the priority was simplicity and a clearly explainable stack.

**Q24 [C] What is denormalisation in your schema? What is the downside?**
We copy the uploader's name into each note (`uploaderName`) so listing notes needs no join/second query. Downside: if a user changes their name, old notes keep the old name. Acceptable here; for strict consistency we would use `populate()` or update many.

---

## D. Frontend, backend and REST

**Q25 [B] What is REST?**
An API style using HTTP methods on resource URLs: GET read, POST create, DELETE remove; data as JSON; stateless — every request carries its own proof of identity (our JWT).

**Q26 [B] Give examples of your endpoints.**
`POST /api/auth/login`, `GET /api/notes?semester=1`, `POST /api/notes` (upload), `GET /api/notes/:id/url?mode=download`, `DELETE /api/notes/:id`, `GET /api/health`.

**Q27 [I] How does the React app talk to the backend?**
Through `fetch` calls collected in `client/src/api.js`, which adds the `Authorization: Bearer <token>` header. In development, Vite proxies `/api` to port 4000, so the browser sees one origin.

**Q28 [I] What is CORS and do you need it?**
Browsers block a page from reading responses from a different origin unless the server allows it. In development the Vite proxy removes the problem; in production we allow only `CLIENT_ORIGIN` using the `cors` package. The S3 bucket needs **no** CORS because the browser never uploads to S3 directly.

**Q29 [I] What is middleware in Express?**
A function that runs before the route handler and can change the request, reject it or pass it on. We use `helmet`, `cors`, `express.json`, `morgan` (logging), our JWT `requireAuth`, `requireAdmin`, `multer`, and a final error handler.

---

## E. Upload and download workflow

**Q30 [B] Explain how upload works.**
User selects a PDF → React sends it as multipart form-data to the backend → backend validates → uploads to S3 → verifies it → saves metadata and `s3Key` in MongoDB → replies success.

**Q31 [I] What validation do you do and where?**
Browser: extension/type and size (for quick feedback). Server (the one that matters): file type, extension, the first bytes must be `%PDF-`, size limit, title/subject/semester/category rules, duplicate SHA-256. Never trust the client.

**Q32 [C] What if S3 succeeds but MongoDB fails (or the reverse)?**
That would create an orphan or a broken record, which was the core problem before. Order matters: S3 write → `HeadObject` verify → DB save. If the DB save fails we delete the S3 object. On delete we remove S3 first, then the DB record, so a failure leaves the note still correctly linked. The admin report can detect and repair mismatches at any time. It is not a true distributed transaction, but compensating actions make it reliable for this scale.

**Q33 [I] How does download work and why not stream through your server?**
The backend authenticates the user, finds the note, checks the object exists, signs a GET URL and returns it. The browser downloads straight from S3. Streaming through Express would use our server's bandwidth and memory for every download.

---

## F. Authentication, security, IAM, credentials

**Q34 [C] Evaluate: public bucket vs pre-signed URLs vs CloudFront.**
Public bucket: simplest but anyone with a link can read and it can leak data; rejected. Pre-signed URLs: private bucket, per-request authorisation, expiring links, no extra service; **chosen**. CloudFront with signed cookies: better for global scale and caching but adds a service and setup; mentioned as future scope.

**Q35 [C] Evaluate: upload through backend vs browser direct to S3.**
Direct (pre-signed PUT) saves server bandwidth but needs bucket CORS, makes it easy to save the DB row even if the PUT failed (our earlier bug), and cannot inspect file content first. Backend upload is slightly heavier but simpler, validates content, verifies S3 and can roll back. For 20 MB PDFs the simplicity wins.

**Q36 [I] Explain your IAM policy.**
A dedicated IAM user with one policy: `s3:ListBucket` and `s3:GetBucketLocation` on the bucket ARN, and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `bucket/*`. That is **least privilege**: only this bucket, only needed actions — not `AmazonS3FullAccess` and not root.

**Q37 [I] What network and transport security is in place?**
All traffic to S3 and Atlas is over TLS. Atlas only accepts connections from IPs in its Network Access list. The S3 bucket has Block Public Access on. The API sets security headers (helmet), restricts CORS to the frontend origin and rate-limits login.

**Q38 [I] How does login work?**
Register stores a bcrypt hash. Login compares the password to the hash and, if correct, returns a signed JWT (7 days) containing the user id. The browser sends it on each request; the server verifies the signature and loads the user.

**Q39 [I] Why hash passwords with bcrypt?**
If the database leaks, attackers should not get passwords. bcrypt is a slow, salted hash — each password has its own salt and brute-forcing is expensive. We never store or log the real password.

**Q40 [B] Why environment variables?**
So secrets (AWS keys, MongoDB password, JWT secret) are not in the source code. `.env` is in `.gitignore`; `.env.example` shows the names without values. The React code contains no secrets at all.

**Q41 [C] What if your AWS access key leaks?**
Immediately deactivate and delete it in IAM and create a new one, then update `.env`; check CloudTrail/billing for misuse. Because the key is least-privilege, damage is limited to that one bucket. (We did warn that the starter ZIP contained a key.)

---

## G. Error handling and debugging

**Q42 [I] What was wrong with your previous version, and how did you investigate?**
Notes in S3 did not show. We found that the app listed only database rows while files were also uploaded manually in S3 (no rows); the previous code saved rows without verifying S3; browser-to-S3 upload depends on CORS; and errors were generic. We rebuilt: one verified workflow, an import/consistency tool, and specific error messages.

**Q43 [I] How do you tell a wrong bucket, wrong region, wrong key and missing permission apart?**
Error names/status codes: `NoSuchBucket`/404 → bucket name; `PermanentRedirect`/301 or *AuthorizationHeaderMalformed* → wrong region; `InvalidAccessKeyId` → bad key; `SignatureDoesNotMatch` → wrong secret; 403 `AccessDenied` → IAM policy. `src/s3.js` maps each to an explanation and `npm run check` tests them in order.

**Q44 [I] What happens if MongoDB or S3 is down?**
Start-up: bad `.env` stops with a numbered list; MongoDB unreachable stops with advice (check IP allow-list); S3 problem only warns. Runtime: API returns clear JSON errors (503/502), the React app shows banners instead of a blank page. `/api/health` shows both statuses.

**Q45 [I] A note is in the list but the PDF will not open. Why?**
Someone deleted the object in S3 (console). `HeadObject` reports missing, API returns `S3_OBJECT_MISSING`. Admin → Remove broken records fixes the database.

**Q46 [C] How did you test the system?**
Automated integration tests (16) with a real MongoDB driver and the real AWS SDK against local stand-ins; a browser test (24 checks) for the full journey including backend restart; plus `npm run check` for the real cloud accounts. We state clearly which parts need the real Atlas/AWS credentials.

---

## H. Advantages, limitations, future scope

**Q47 [B] Advantages?**
Central, durable, secure, searchable, no local disk dependence, works from any device, minimal cost, simple stack.

**Q48 [I] Limitations?**
PDF-only and 20 MB; JWT in localStorage; regex search; no e-mail verification or password reset; no virus scanning; duplicate detection only for app uploads; backend runs locally (no compute service).

**Q49 [I] Future scope?**
Deploy the API on EC2 or Elastic Beanstalk (also gives CO2), CloudFront for faster delivery, Atlas Search for better text search, S3 versioning/lifecycle rules, presigned multipart uploads for large files, notifications, ratings/comments, SSO with college e-mail.

**Q50 [C] How would you scale it to 10,000 students?**
Stateless API → run several instances behind a load balancer; keep files in S3 (scales automatically); move to a paid Atlas tier with proper indexes/Atlas Search; add CloudFront caching; use cookies/refresh tokens; add monitoring and rate limits; store file hashes in S3 metadata for global duplicate checks.
