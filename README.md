# BriefHarbor

A crisis communications workspace for PR teams managing corporate incidents. Each case connects media deadlines, evidence, exact statement revisions, named approvals, and records of external delivery.

## Current functionality

| Area | Workflow |
| --- | --- |
| Case intake | Assigned owners, client isolation, scenario and severity filters, next update, close and reopen with a reason |
| Evidence | Assigned owners verify and mark facts shareable. Supersession creates a new unverified version and preserves the earlier claim. |
| Statements | Versioned drafts, cited fact versions and immutable submitted text |
| Review | Separate named PR, legal and optional client reviewers. Changes requested require a comment. Stale and duplicate decisions are rejected. |
| Export | Exact current text after required approvals and a fresh check of cited evidence and reviewer access |
| Delivery | Actual external send records with idempotent retries. Evidence changes flag historical recipients for follow-up. |
| Coordination | Assigned tasks, overdue labels, dashboard task/review queue, audit timeline and downloadable reports |
| Scenarios | Data breach, lawsuit, executive scandal and hostile public event guidance, sample cases and review policies |

The authenticated application uses Next.js and TypeScript, Express and TypeScript, and MongoDB through its official Node.js driver. Shared Zod contracts validate requests and responses. Transactional workflow writes increment a shared case version before checking dependent records.

The public demo simulates roles and stores fictional data in this browser. The authenticated application uses Express sessions and MongoDB persistence. External delivery is recorded manually after a send through the firm's own channel.

## Preview the frontend

Use Node.js 22 LTS. Development used Node.js 22.19.0 and npm 11.6.0.

~~~powershell
npm.cmd install
npm.cmd run dev:demo
~~~

Open http://localhost:3000. The role selector includes Coordinator, Fact owner, PR lead, Legal reviewer and Client reviewer. Reset demo restores the fictional case.

~~~powershell
npm.cmd run build:demo
~~~

The export is written to apps/web/out. The [GitHub Pages demo](https://gauravkal006.github.io/BriefHarbor/) updates when its GitHub workflow deploys this source. Set Settings > Pages > Source to GitHub Actions.

## Clean checkout and authenticated workspace

~~~powershell
git clone https://github.com/gauravkal006/BriefHarbor.git
cd BriefHarbor
npm.cmd install
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
node -p "require('node:crypto').randomBytes(32).toString('hex')"
notepad apps/api/.env
~~~

Set SESSION_SECRET to the generated value. Set ALLOW_DEMO_SEED=true and choose a private DEMO_PASSWORD of 12–256 characters. Leave NODE_ENV=development for local seeding. Set NEXT_PUBLIC_BRIEFHARBOR_DEMO=false in the web environment.

The authoring session cannot resolve the npm registry, so package-lock.json generation is pending. Once npm install succeeds, commit the generated lockfile and use npm ci on fresh checkouts.

With Docker Desktop running in Linux-container mode, run these commands from the repository root. The setup uses a named volume and loopback networking.

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/mongo-local.ps1
npm.cmd run seed
npm.cmd run seed
npm.cmd run dev
~~~

For Atlas, use a transaction-capable deployment. Set MONGODB_URI and MONGODB_DB in apps/api/.env, create a database user with index and read/write permissions for that database, and allow the development IP.

For a native MongoDB installation, start a local replica set.

~~~powershell
New-Item -ItemType Directory -Force .local-mongo | Out-Null
mongod --dbpath .local-mongo --bind_ip 127.0.0.1 --port 27017 --replSet rs0
~~~

In a second terminal, initialize it once.

~~~powershell
mongosh 'mongodb://127.0.0.1:27017/?directConnection=true' --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
~~~

Use MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true.

Open http://localhost:3000 exactly. Express uses port 4000. Next.js forwards same-origin /api requests to Express. Index bootstrap runs before the API becomes ready.

| Synthetic account | Role |
| --- | --- |
| coordinator@riverstone.example.test | Coordinator and statement author |
| pr@riverstone.example.test | PR lead and reviewer |
| legal@riverstone.example.test | Legal reviewer |
| client@riverstone.example.test | Client reviewer |
| facts@riverstone.example.test | Fact owner |
| viewer@bluedune.example.test | Separate Client B viewer |

Use your configured DEMO_PASSWORD. Reseeding preserves existing case state and updates password hashes. New cases start with creator and owner assignments. Response workflow > Settings lets coordinators and PR leads assign eligible active client members to the case. PR leads control status and review policy.

## Recruiter demonstration

1. As coordinator, open the Riverstone breach and show an overdue reporter inquiry.
2. As fact owner, verify the portal restriction and mark it shareable.
3. As coordinator, open Response workflow, create a public statement, save its draft, cite the verified fact and choose separate PR and legal reviewers.
4. Try export before approval. As legal reviewer, request changes with a comment. Edit and submit a new revision as coordinator. Show the earlier text in history.
5. Approve the current revision as PR and legal. Export as coordinator and record an actual external send with its inquiry or audience, channel and time.
6. Supersede the cited fact as its owner. Show future export rejected and historical delivery flagged for follow-up.
7. Open Tasks and Report. Sign in as Client B and try the Riverstone direct URL to demonstrate isolation.
8. Open the additional scenario cases. Executive personnel statements require client review. Sensitive event claims require legal review.
9. As PR lead, resolve open inquiries and pending reviews, close with a reason, then reopen when new information arrives.

## Checks

Use a dedicated briefharbor_test database. API tests create synthetic records and the first smoke test temporarily revokes a seeded membership. API test files execute serially.

~~~powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:demo
~~~

With the seeded app running, use these commands for live API and browser checks. Stop development servers before a production build uses the same Next output directory.

~~~powershell
npm.cmd run test:api
npx.cmd playwright install chromium
npm.cmd run test:ui
~~~

Browser checks cover 1440 px and 390 px. API tests cover session security, nested IDs, cross-client isolation, self-approval, required review, requests for changes, stale revisions, immutable text, export gating, delivery retries, evidence follow-up, tasks, closure and concurrency.

The browser-local workflow and reviewer-policy suites, source lint and frontend typecheck passed with cached dependencies. The cached Next build is blocked by a filesystem EPERM while writing generated case routes. Cached package versions differ from the declared fresh-install ranges, so these checks do not establish clean-install compatibility. Live database checks, a clean-install build, full API typecheck, browser automation and hosted verification remain pending because this session lacks dependency installation and database access. See docs/DEPLOYMENT.md for Vercel configuration.

## Repository

| Path | Contents |
| --- | --- |
| apps/web | Next.js UI, typed API adapter, public demo and browser checks |
| apps/api | Express routes, MongoDB models/indexes/seed, tests and Vercel entry |
| packages/contracts | Shared validation and scenario review policy |
| scripts | Frontend demo build and local database setup |
| docs/DEPLOYMENT.md | Vercel setup and staging checks |

## Contributor

**Gaurav Janardan Kalamkhede** · [@gauravkal006](https://github.com/gauravkal006)
