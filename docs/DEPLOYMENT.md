# Vercel deployment

Use two projects linked to the repository, with root directories apps/web and apps/api. Next.js forwards same-origin /api requests to Express. All business rules and database access stay in Express. Each warm API instance reuses its initialized MongoDB pool.

References

- https://vercel.com/docs/frameworks/backend/express
- https://vercel.com/docs/monorepos
- https://www.mongodb.com/docs/drivers/node/current/crud/transactions/

## Before deployment

Install dependencies, generate and commit package-lock.json, then run the documented lint, typecheck, build, API and browser checks against a replica-set test database. The authoring session could not complete dependency installation or live MongoDB checks.

Choose Node.js 22 in both projects. Include files outside each project root so packages/contracts is available. The checked-in vercel.json files provide build commands. Leave the output directory at its framework default. After committing the lockfile, use cd ../.. && npm ci as both install commands.

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

The repository npm commands were attempted. Installation failed with ENOTFOUND for registry.npmjs.org, leaving the root workspace without its required dependencies and lockfile. Docker access returned permission denied and apps/api/.env is absent, so live API tests could not start. Playwright is unavailable.

An ignored verification copy used locally cached dependencies to run source lint, shared-contract compilation, frontend typechecking and the two browser-storage test suites. Those checks passed. The cached Next 15.5.2 build reached compilation/page generation during diagnosis but did not produce a final build after the route changes. Repeated attempts returned EPERM creating generated case route directories. Browser layout checks and Vercel deployment are still unverified.

After network and database setup, run npm install, retain package-lock.json, rerun all repository checks and the hosted checklist above. Test output from the cached environment is not a replacement for these checks.
