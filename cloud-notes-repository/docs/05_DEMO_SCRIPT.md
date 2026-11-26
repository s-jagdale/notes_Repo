# 05 · Presentation and Demonstration Script (≈ 12–15 minutes)

Speak naturally — these are the words to learn, not to read. **Bold** = action on screen.
**Before you start:** backend + frontend running, `npm run check` all PASS, bucket and Atlas open in two browser tabs, one sample PDF ready (not yet uploaded), admin account registered, test student account in a private window.

---

### 1. Introduction (30 s)
"Good morning, ma'am/sir. Our project is a **Cloud-Based Student Notes Repository**. It lets students upload, search, view and download semester notes, with the files stored in **Amazon S3** and the note details in **MongoDB Atlas**."

### 2. Problem statement (30 s)
"In our class, notes are shared in many WhatsApp groups and on personal devices. They get lost, nobody knows which version is latest, and there is no way to search by subject or semester. Sharing public links is also unsafe."

### 3. Why we chose this project (30 s)
"It is a real need for us, and it naturally uses several cloud ideas from our syllabus: object storage, a managed database, access control and secure sharing. Our first version could not show S3 notes in the application, so we rebuilt it with a simpler, properly integrated design — and that debugging taught us the most."

### 4. Technologies and their purpose (45 s)
"The **frontend** is React, which shows the pages. The **backend** is Node.js with Express, exposing REST APIs. **MongoDB Atlas** is our cloud database for users and note details. **Amazon S3** stores the actual PDFs. We use the **AWS SDK v3** to talk to S3. We deliberately used no other AWS service, to keep the project simple and low-cost."

### 5. System architecture (1 min)
**Show the architecture diagram.**
"The browser talks only to our Express API. The API talks to MongoDB for metadata and to S3 for files. The browser never has AWS keys. The bucket is **private**; when a student wants a file, the API creates a **temporary pre-signed link** that expires in five minutes, and the browser downloads directly from S3. In cloud terms: S3 is storage as a service, Atlas is database as a service, and our web app is SaaS for students."

### 6. MongoDB integration (45 s)
**Switch to Atlas → Browse Collections → `notes`.**
"We have two collections, `users` and `notes`. Each note document has title, subject, semester, category, uploader, size, counts and — most importantly — the **`s3Key`**, which is the exact name of the file in S3. We never store the PDF inside MongoDB; that would be costly and slow. Unique indexes on `email` and `s3Key` protect data integrity."

### 7. AWS S3 integration (45 s)
**Switch to the S3 console → bucket → Semester-1 → cloud computing.**
"This is our existing bucket in Mumbai. Folders are just key prefixes — `Semester-1/cloud computing/…`. Block Public Access is on. The app uses a dedicated IAM user with least-privilege permissions for only this bucket. **Open an object's URL directly → AccessDenied.** This shows the file is private."

### 8. Live demonstration (4–5 min)
1. **Login page → register / log in as admin.** "Passwords are stored as bcrypt hashes; login returns a JWT."
2. **Admin → Import from S3.** "These two PDFs were uploaded manually in the console earlier, so MongoDB did not know them. This was one cause of our original problem. The admin tool compares S3 with the database and creates the missing records." **Go to Browse → the notes appear.**
3. **Click View.** "The API checked the note, confirmed the object exists, created a 5-minute signed URL — you can see the signature in the address bar — and S3 served the PDF."
4. **Click Download.** "Same mechanism, but with an `attachment` header."
5. **Upload page → choose the sample PDF → fill subject/semester/category → Upload.** "The file goes to our backend, which validates that it is really a PDF, uploads it to S3, verifies it with a HeadObject call, and only then saves the record in MongoDB."
6. **S3 console → refresh → show the new object under `Semester-N/<subject>/…`. Atlas → refresh → show the new document with the same `s3Key`.** "This equality is the whole integration."
7. **Browse → search a word, filter by semester/category, sort by most downloaded.**
8. **Dashboard → totals, recently uploaded, most downloaded, per-semester bars.**
9. **Private window → log in as a student → no Delete button on others' notes, no Admin menu.** "Authorisation is checked on the server as well as hidden in the UI."
10. **Delete the note you uploaded → refresh S3 and Atlas.** "Both the file and the record are removed."
11. **Persistence:** **stop the backend (Ctrl+C) → refresh → red banner.** "Friendly error, no crash." **Start it again → refresh.** "Notes are still there, because they live in MongoDB and S3, not in the server's memory."

### 9. How upload and download work (1 min)
"Upload: browser → API → validate → **S3 PutObject** → **verify** → **MongoDB save**. If saving to MongoDB fails, we delete the S3 file, so there are no orphan files. Download: browser asks the API → API reads the note from MongoDB → checks the object in S3 → signs a GET URL → the browser downloads straight from S3. The list always comes from MongoDB; the file always comes from S3; the `s3Key` joins them."

### 10. Course Outcome mapping (1 min)
"Our project demonstrates five of the six Course Outcomes. **CO1:** we categorise and use IaaS-level storage, DBaaS and SaaS. **CO3:** we distinguish object storage for PDFs from a document database for metadata. **CO4:** we chose MongoDB Atlas and justified it against RDS, DynamoDB and Supabase. **CO5:** we evaluated security options — private bucket versus public, pre-signed URLs, least-privilege IAM, secrets in environment variables. **CO6:** we examined networking and security trade-offs while building: CORS, backend upload versus browser upload, and diagnosing 403 and region errors. **CO2**, compute configuration, is future scope — hosting the API on EC2."

### 11. Challenges and how we solved them (1 min)
"Our biggest challenge was that **files in S3 did not appear in the app**. We found the app listed only database records, while some files were uploaded directly to S3, and our old code saved records without checking S3. We solved it by making S3 the confirmed first step of every upload, verifying it, linking by `s3Key`, adding an import and consistency report, and giving specific error messages for wrong bucket, region, keys or permissions. Another challenge was security: we moved all credentials to environment variables and used a least-privilege IAM user."

*(If asked, show `npm run check` — "this tests every connection step by step".)*

### 12. Conclusion and future scope (45 s)
"In conclusion, we built a working cloud application where the frontend, backend, MongoDB Atlas and S3 are properly integrated, secure and easy to maintain. **Future scope:** host the API on EC2 or Elastic Beanstalk, use CloudFront for faster delivery, Atlas Search for better searching, S3 versioning and lifecycle rules, notifications, and college-email login. Thank you — we are happy to answer questions."

---

## Cheat-sheet if the live demo breaks
| Problem | Say / do |
|---|---|
| Atlas unreachable | "Our IP changed; Atlas allows only listed IPs." → Atlas → Network Access → add IP. Run `npm run check`. |
| S3 403 | "This is the IAM policy — it needs ListBucket, Get, Put, Delete." Show the policy. |
| Link expired | "Signed links last 5 minutes by design." Click View again. |
| Browser blocks the View tab | Allow pop-ups for localhost, or use Download. |
| Internet down | Show the screenshots and the test report (`docs/06_TEST_REPORT.md`), and walk through the code path. |
