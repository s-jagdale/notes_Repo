# 03 · Course Outcome (CO) Mapping — Course 2310323T

COs read from your image (levels as printed there):

| CO | Statement | Bloom |
|---|---|---|
| CO1 | Categorize different types of cloud computing services and models | L3 |
| CO2 | Choose appropriate compute service configuration within a cloud environment | L3 |
| CO3 | Distinguish between storage-related services utilised in application development | L3 |
| CO4 | Choose the suitable database service for a given application scenario | L3 |
| CO5 | Evaluate various networking and security configurations based on specific problem-solving requirements | L5 |
| CO6 | Examine different networking and security choices while developing an application | L4 |

## Coverage summary

| | |
|---|---|
| Total COs | 6 |
| **Demonstrated by this project** | **CO1, CO3, CO4, CO5, CO6 = 5 of 6 (83 %)** |
| Requirement | more than 50 % ✅ |
| **Not claimed** | **CO2** — it needs a compute-service choice (EC2 / Lambda / Elastic Beanstalk sizing). Your brief says not to add such services. The backend currently runs on a laptop. Say this openly: *"CO2 is future scope — deploying the API on EC2 and choosing the instance type."* Adding EC2 only to claim a CO would go against the brief. |

## CO mapping table

| CO | Description | How the project implements it | Demonstration evidence (what to show) |
|---|---|---|---|
| **CO1** | Categorise cloud services and models | The project deliberately uses **three service models**: **Amazon S3 = IaaS-level storage service (Storage-as-a-Service)**, **MongoDB Atlas = DBaaS (managed PaaS-style database)**, and the finished web app is delivered to students as **SaaS** (browser only, nothing to install). Both cloud services run in a **public cloud**; the Node/React code is *our* layer. Shared-responsibility split: AWS/Atlas manage hardware, durability, patching; we manage IAM, keys, app logic. | • Architecture diagram in `01_ANALYSIS_AND_ARCHITECTURE.md` with each box labelled IaaS/DBaaS/SaaS • AWS console + Atlas console side by side • Table "who manages what" (see viva Q3, Q4) |
| **CO3** | Distinguish storage services used in application development | We use **two different storage types for two different jobs** and justify it: **S3 object storage** for large unstructured PDFs (cheap, durable, HTTP access, prefixes, versioning) vs **MongoDB document database** for small structured metadata that must be queried/filtered. We compare with block (EBS) and file (EFS) storage and explain why they do not fit. Private bucket + pre-signed URLs; S3 "folders" are key prefixes; object key is stored in the DB. | • S3 console: bucket → `Semester-1/cloud computing/` objects • Atlas → Browse Collections → `notes` document showing `s3Key` • Upload a PDF live and show it appears in **both** places • Comparison table in viva Q16 |
| **CO4** | Choose the suitable database service for a scenario | Database selection is justified for this scenario: flexible schema, JSON-like documents, query by subject/semester/category, free tier, no extra AWS service. Compared against RDS (MySQL/Postgres), DynamoDB, Supabase (the previous attempt). Schema design, unique and secondary indexes, denormalisation trade-off, aggregation for dashboard. | • Decision table (`01_…` §Phase 2b and viva Q22–Q24) • Atlas collections + indexes tab • Dashboard (aggregation) and filter queries • `server/src/models/Note.js` |
| **CO5** | **Evaluate** networking and security configurations for specific requirements | Evaluated and chosen against alternatives: **(a)** private bucket + Block Public Access vs public bucket; **(b)** pre-signed URL (5 min) vs public URL vs streaming through server; **(c)** backend upload vs browser-direct upload (CORS needed); **(d)** IAM least-privilege policy vs `AmazonS3FullAccess`; **(e)** HTTPS/TLS to S3 and Atlas; **(f)** Atlas network access (IP allow-list) vs `0.0.0.0/0`; **(g)** secrets in `.env`, never in React; **(h)** JWT + bcrypt + role checks, rate limiting, helmet headers, input validation. | • IAM policy JSON in README §3.2 • S3 → Permissions → Block Public Access = On • Show that a raw S3 URL gives *AccessDenied* but the app's signed link works, and that the link stops working after expiry • Atlas → Network Access list • `.env.example` vs `.env` (ignored by Git) • Evaluation table (viva Q34–Q37) |
| **CO6** | **Examine** networking/security choices while developing an application | The development process itself is the evidence: root-cause analysis of the previous failure (`01_…` Phase 2), diagnosing 403 vs 404 vs region errors (`src/s3.js` error translator), CORS reasoning (why the Vite proxy and backend upload remove CORS problems), `/api/health` and `npm run check` to isolate network vs credential vs permission faults, rollback on partial failure. | • Run `npm run check` live and show PASS/FAIL lines • Change bucket name in `.env` → show the exact message → fix it • Stop the backend → red "Cannot reach the server" banner • Root-cause table |

## "No fake CO claims" checklist
* Every row points to something you can open and show in the running application or consoles.
* No service was added to inflate coverage.
* CO2 is stated as not covered, with a concrete future-scope path.
