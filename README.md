# BriefHarbor

A crisis communications workspace for PR teams. BriefHarbor connects a media inquiry to its case, deadline, owner, and verified facts so the team can coordinate under pressure.

## Interactive demo

Open the [BriefHarbor GitHub Pages demo](https://gauravkal006.github.io/BriefHarbor/). It uses fictional data and needs no account. Demo edits stay in your browser, and **Reset demo** restores the sample case.

### A 90-second walkthrough

1. Open the **Dashboard** and follow the overdue media deadline into the Riverstone Retail case. Review the reporter's question, the inquiry owner, and the deadline.
2. Open **Facts** and switch **Demo role** to **Fact owner**. Verify the portal restriction from the simulated incident log and mark it shareable. The impact on customer records remains unknown.
3. Switch back to **Coordinator**, create a case with an owner and next update, and refresh to see it persist. You can also add an inquiry or edit its deadline.

## Project status

| Area | Current implementation |
| --- | --- |
| Case intake | Dashboard, case register and filters, case creation, overview, owner, severity, and next update |
| Facts | Claim and source capture, verification by the assigned fact owner, and shareable or internal visibility |
| Media inquiries | Reporter question, owner, editable deadline, overdue status, and closure reason |
| Public preview | Static Next.js build with synthetic data, simulated roles, and browser-local persistence |
| Local full-stack workspace | Express API, MongoDB indexes and seed, session cookies, CSRF checks, and case-scoped access checks. Live integration verification is pending. |
| Planned | Statement drafts, PR and legal approvals, export, manual delivery tracking, and reporting |

`apps/web` contains the Next.js and TypeScript frontend. `apps/api` contains the Node.js and Express API using the official MongoDB driver. `packages/contracts` holds shared Zod request and response schemas.

## Run the frontend

From the repository root, use Node.js 22 LTS. The documented development version is 22.19.0.

```powershell
npm.cmd install
npm.cmd run dev:demo
```

Open [localhost:3000](http://localhost:3000). Use `npm.cmd run build:demo` to export the Pages site to `apps/web/out`.

## Run the local API and database

1. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`.
2. Generate a development session secret with `node -p "require('node:crypto').randomBytes(32).toString('hex')"`. Set it as `SESSION_SECRET`, enable `ALLOW_DEMO_SEED=true`, and set a local `DEMO_PASSWORD` of at least 12 characters.
3. Start Docker Desktop in Linux-container mode and run the local MongoDB script below. For Atlas, use a transaction-capable deployment and set its connection string in the API environment file.
4. Seed the fictional records and run the app. Sign in at [localhost:3000](http://localhost:3000) as `coordinator@riverstone.example.test` or `facts@riverstone.example.test` with your configured demo password.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/mongo-local.ps1
npm.cmd run seed
npm.cmd run dev
```

The project includes lint, typecheck, build, API smoke tests, and Playwright scripts. Run `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build` from the repository root. With the seeded app running, use `npm.cmd run test:api` and `npm.cmd run test:ui` after installing Chromium with `npx.cmd playwright install chromium`.

## Publish the frontend

In the repository, set **Settings → Pages → Source** to **GitHub Actions**. Then run **Publish BriefHarbor demo** from the Actions tab. Later pushes to `main` trigger the same workflow. It builds the frontend at the repository subpath and publishes the static export.

## Contributor

**Gaurav Janardan Kalamkhede** · [@gauravkal006](https://github.com/gauravkal006)
