# Vercel deployment

Use two projects linked to the repository, with root directories apps/web and apps/api. Next.js forwards same-origin /api requests to Express. All business rules and database access stay in Express. Each warm API instance reuses its initialized MongoDB pool.

References

- https://vercel.com/docs/frameworks/backend/express
- https://vercel.com/docs/monorepos
- https://www.mongodb.com/docs/drivers/node/current/crud/transactions/

## Before deployment

Run npm ci, then run the documented lint, typecheck, build, API and browser checks against a replica-set test database. The lockfile is committed. Live MongoDB and hosted checks require the deployment environment.

Choose Node.js 22 in both projects. Include files outside each project root so packages/contracts is available. The checked-in vercel.json files provide build commands. Leave the output directory at its framework default. After committing the lockfile, use cd ../.. && npm ci as both install commands.

## Frontend showcase without MongoDB

Import the repository as one Vercel project with Root Directory `apps/web` and framework Next.js. Enable files outside the root directory so the shared contracts package is available. Keep the checked-in build and install commands and the default output directory.

Set `NEXT_PUBLIC_BRIEFHARBOR_DEMO=true`. Leave `NEXT_PUBLIC_BRIEFHARBOR_BASE_PATH` empty. This deployment does not need `API_ORIGIN`, MongoDB credentials or an API project. Rebuild after changing the demo flag.

After deployment, open `/`, `/login`, `/signup` and `/dashboard` directly. Sign-up creates a browser-local demo profile with name and email; it never requests a password. Sample workflow changes persist in that browser. Reset demo clears both the profile and sample changes. Recruiters can also choose Explore without signing in.

For the authenticated deployment, use the two projects described below and set the demo flag to false. Sign-up then uses Express and MongoDB; new accounts have no memberships. Provision client access separately through a trusted database operator or use the seeded synthetic identities in private staging.

## Express project

Select Root Directory apps/api and framework Express. The root index.ts exports the Express app with lazy database initialization. Local development still runs src/server.ts.

| API environment variable | Value |
| --- | --- |
| NODE_ENV | production |
| MONGODB_URI | Atlas connection string |
| MONGODB_DB | Database dedicated to this environment |
| SESSION_SECRET | Random value of at least 32 characters |
| WEB_ORIGIN | Exact HTTPS frontend origin, without trailing slash |
| TRUST_PROXY_HOPS | 1 for the Vercel function proxy. Verify the proxy chain in staging. |
| ALLOW_DEMO_SEED | false |

Configure Atlas credentials and network access for Vercel. The deployment must support transactions. Persistent records and sessions live in MongoDB.

For private synthetic staging, create a separate briefharbor_test_staging database and seed it locally with NODE_ENV=development and ALLOW_DEMO_SEED=true. Deploy the API runtime with NODE_ENV=production and ALLOW_DEMO_SEED=false. Keep the staging password private.

## Next.js project

Select Root Directory apps/web and framework Next.js.

| Web environment variable | Value |
| --- | --- |
| API_ORIGIN | Exact HTTPS API project origin |
| NEXT_PUBLIC_BRIEFHARBOR_DEMO | false |
| NEXT_PUBLIC_BRIEFHARBOR_BASE_PATH | Empty |

WEB_ORIGIN in the API must match the frontend origin exactly. Cookies pass through the frontend rewrite and remain host-only. Confirm Secure, HttpOnly and SameSite=Lax in staging. Rebuild after changing frontend build environment variables.

## Private staging

Use separate projects or stable staging domains, separate Atlas credentials and a separate session secret. Configure the API for the stable staging frontend origin. Random preview URLs need their exact origin configured before mutations will work.

If API Deployment Protection is enabled, authorize the frontend rewrite to reach that API and test the configuration. Keep bypass credentials server-side. Frontend Deployment Protection can control access to the private demo.

## Hosted checks

1. Visit the frontend /api/health/ready and confirm the generic ready response.
2. Sign in, refresh, sign out and verify the old session no longer works.
3. Verify CSRF rejection, client isolation and named review permissions.
4. Complete the export and manual-delivery flow, retry the same key and reject a changed payload.
5. Supersede evidence and confirm future export is blocked while historical delivery remains with a follow-up flag.
6. Inspect the case at mobile and desktop widths and check function logs for startup failures.

Account configuration, Atlas connectivity and hosted smoke checks remain pending until the deployment environment is available.

## Authoring verification record

The account-access update generated the workspace lockfile with npm install --package-lock-only. A normal npm install reached dependency installation but Windows rejected workspace symlink creation. An isolated verification copy installed the declared dependencies without workspace symlinks and passed source lint, shared-contract compilation, frontend and API typechecks, the Vercel API entry typecheck, API compilation, and four browser-storage/registration tests.

The Next.js 15.5.29 demo build compiled successfully, then Windows returned EPERM while creating generated route directories during static export. This is not a completed production build. All four new account UI checks passed against intercepted API responses at desktop and mobile widths, and signup screenshots were reviewed. Both existing navigation checks passed on the first browser run; a later desktop attempt timed out during development route compilation. The demo browser flow was blocked by EPERM writing generated dashboard chunks. Full demo browser navigation and hosted verification remain pending. Live MongoDB integration tests are also unverified: apps/api/.env is absent and the Docker engine is inaccessible to this session.

Before using real client data, run the repository checks on a clean checkout with MongoDB and complete the hosted checklist above. The public browser-local demo does not require a database.