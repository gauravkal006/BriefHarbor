# API and data contract

## Express and MongoDB setup

Use the official MongoDB Node.js driver with one pooled MongoClient per API process. Collections are users, clients, memberships, cases, caseAssignments, factVersions, inquiries, statements, statementRevisions, reviewerRequirements, decisions, exports, deliveries, tasks, auditEvents and sessions. Carry clientId and caseId on case-owned documents. Validate ObjectIds at route boundaries, store dates as BSON Date, and serialize public IDs and UTC dates into DTO strings. Bootstrap indexes before readiness. Use explicit environment-gated, repeatable demo seeding in the development database.

Use Express session middleware with a MongoDB-backed store, TTL on session expiry, HttpOnly cookies, SameSite=Lax, and Secure cookies over HTTPS. Regenerate the session on login and destroy it on logout. Use POST /auth/login, POST /auth/logout, GET /auth/session, and GET /auth/csrf for the session-bound mutation token. Validate the configured origin on unsafe requests, apply CSRF to login and logout too, and use generic login failures with rate limiting. Hash seeded passwords with a maintained password hasher such as Argon2id. Read the demo password from the environment and never log it. Disable demo seed unless explicitly enabled in a development environment. Use same-origin forwarding for browser requests. Scope database connectivity checks to /health/ready and return only generic readiness status.

## Model and integrity

| Record | Minimum fields and rules |
|---|---|
| User | ID, unique normalized email, password hash, display name, account status |
| Client, Membership | Client ID/name. Membership joins user and client, with active status and role grants. |
| Case, CaseAssignment | Client, type, title, severity, owner, status, next update. Assignments bind active users and case roles. |
| FactVersion | Case, logical fact ID, version, claim, source URL or short source reference, verifier, status and visibility. Keep prior versions. |
| Inquiry | Case, outlet, contact, question, owner, deadline, status and closure reason. |
| Statement, StatementRevision | Case, audience, current submitted revision pointer. Submitted text, revision number, author and submission time are immutable. A draft may be edited until submission. |
| RevisionFact, RequiredReviewer, Decision | Bind fact versions and named reviewers to a revision. One decision per reviewer requirement. Changes requested require a comment and end that review. |
| ExportEvent, Delivery | Export binds revision, actor and time. Delivery binds revision, case, inquiry or audience, actor, channel, actual send time, idempotency key and request fingerprint. |
| CaseTask, AuditEvent | Task has assignee, status and deadline. Append audit actor, action, scoped target and time. |

Model severity as LOW, MEDIUM, HIGH, CRITICAL. Case status is NEW, ACTIVE, MONITORING, CLOSED. Review state is DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED. Fact state is UNVERIFIED, VERIFIED, SUPERSEDED. Visibility is INTERNAL or SHAREABLE. An inquiry is OPEN, RESPONDED or CLOSED_WITHOUT_RESPONSE. Derive overdue from OPEN plus deadline earlier than the current instant.

All private child records resolve to their parent case. Scope nested lookups by parent and reject mismatched associations. Enforce unique membership, assignment per role, revision number per statement, decisions per requirement, and delivery idempotency key per case. Index case list filters, inquiry deadlines and reviewer queues. MongoDB does not enforce foreign keys between collections. Check related IDs and ownership in Express within the same transaction when a write spans documents. Add unique compound indexes for memberships (clientId, userId), assignments (caseId, userId, role), revisions (statementId, version), decisions (revisionId, reviewerRequirementId) and deliveries (caseId, idempotencyKey). Index inquiry deadlines by client, case and status. Use a replica set or sharded deployment for multi-document transactions.

## Authorization

| Actor | Permit |
|---|---|
| Agency administrator | Manage client membership for assigned clients. Case content requires a separate case assignment. |
| PR lead | Activate case, assign owners and reviewers, approve as the named PR reviewer, close or reopen with reason. |
| Coordinator | Create a case under a permitted client, enter inquiries, author drafts, export approved releases and log actual delivery. Grant creator access in the case creation transaction. |
| Fact owner | Verify or supersede an assigned fact and mark it shareable. |
| Legal or client reviewer | Read allowed case material and decide on their assigned revision. |

Derive actor ID from the session. Load active membership and assignment on each request, including each export. Scope client selectors and record lists server-side. Use 404 for unassigned private records and 403 for blocked actions inside a case the actor can see. Recheck rights when membership is revoked.

## API conventions

First milestone includes health and auth routes, clients, cases, facts and inquiries. Second milestone adds statements, reviewer decisions, export, delivery, tasks and reports. For tasks, use POST /cases/{caseId}/tasks and PATCH /cases/{caseId}/tasks/{taskId}. Save draft text with PATCH /statements/{id}/draft and freeze it as a new revision on submission. Use GET /statements/{id} for the editor and permitted revision history.

All paths are under /api. Use ISO 8601 UTC strings in DTOs, opaque string IDs, and validated input with field-level errors. Use JSON of the form `{ "data": ... }` on success and `{ "error": { "code": "...", "message": "...", "fieldErrors": {} } }` on failure. Use 201 for new resources, 401 for unauthenticated requests, 422 for invalid input and 409 for stale revisions or incompatible retries. Exports return text/plain on success with an attachment name and Cache-Control: no-store.

| Method and path | Input or result |
|---|---|
| GET /clients | Active memberships eligible for the workspace selector |
| GET /cases | clientId plus optional status, severity and type filters. Return scoped case summaries including nearest open deadline. |
| POST /cases | clientId, title, type, severity, ownerId, nextUpdateAt. Return the created case. |
| GET /cases/{caseId} | Case summary, visible facts, assigned inquiries and statement summaries. |
| PATCH /cases/{caseId} | Allowlisted changes to case state or fields. Include reason for close or reopen. |
| POST /cases/{caseId}/facts | claim, source, fact owner, initial visibility. Initialize UNVERIFIED. |
| PATCH /cases/{caseId}/facts/{factId} | Verify a current version, change visibility or supersede it with reason. |
| POST /cases/{caseId}/inquiries | outlet, contact, question, ownerId, deadlineAt |
| PATCH /cases/{caseId}/inquiries/{inquiryId} | Update owner/deadline or close without response with a reason. |
| POST /cases/{caseId}/statements | audience, optional inquiryId. Create a statement. |
| POST /statements/{id}/revisions | Submit text, cited factVersionIds and named reviewers subject to case policy. Return the new revision. |
| POST /revisions/{id}/decisions | APPROVE or REQUEST_CHANGES, with comment required for changes. |
| POST /revisions/{id}/exports | Validate and record export. Return approved text and public release metadata. |
| POST /cases/{caseId}/deliveries | revisionId, inquiryId or audience, channel and sentAt. Require Idempotency-Key header. |
| GET /cases/{caseId}/report | Scoped timeline, decisions, deliveries and follow-ups. |

CaseSummary includes id, title, clientId, type, severity, status, ownerId, nextUpdateAt and nearestInquiryDeadlineAt. RevisionDetail includes statementId, revisionId, version, text, state, facts permitted for the viewer, reviewer assignments and decisions. Never return restricted material to an unpermitted viewer.

## Rules for versioning and concurrent writes

1. Public releases require PR approval. Lawsuit, executive scandal and breach also require legal approval. Executive personnel statements can require a named client approver. A public-event case can require legal review when configured for sensitive claims. Scope validation is a server rule. Require distinct assigned reviewers where more than one review is required and prohibit author self-approval.
2. Submission sets the statement's current revision atomically. Each decision checks that the revision is current and in review. Use the driver transaction API. As the first domain operation in transactions for revision submission, approval, export and fact changes that affect export eligibility, conditionally update the scoped case document and increment workflowVersion to force a shared write conflict. Read and recheck all gating records in that transaction. Bound retries and return a conflict when exhausted. Keep callbacks free of external effects. Test parallel submission, approval, evidence updates and exports.
3. Export verifies the current revision, completed approvals and all referenced facts still VERIFIED and SHAREABLE. Reviewers check the claim-to-evidence link. Return public text only. Superseding or restricting a fact blocks future exports of dependent revisions, preserves recorded deliveries and creates a follow-up marker when that text was already delivered.
4. Delivery records an actual external send and references a previously exported revision. Historical delivery can be recorded by an authorized coordinator for a previously exported revision even after it is superseded, with a follow-up marker if evidence became invalid. Record the delivery and update the inquiry atomically. Same idempotency key and payload returns original delivery. Same key with a different payload returns 409. Never let retries send a message.

## Implemented second-milestone storage

Statement revisions embed their immutable named reviewer requirements and cited fact-version IDs. Reviewers are distinct within a revision, so a decision's unique key is (revisionId, userId), which identifies exactly one named requirement. Submitted text, version, author, citations, reviewers and timestamp are never edited. Only the review state changes. Decision rows and audit events are append-only through the application API.

API writes for drafts, submission, decisions, export, evidence, delivery, tasks, assignments and case state first increment the scoped case workflowVersion in a transaction. Transaction callbacks contain database operations only and use a 15-second timeout with majority writes and snapshot reads. API timeouts return a conflict. Delivery idempotency keys are scoped to the case and checked against a canonical request fingerprint.

Case assignments can be created by a scoped coordinator or PR lead for an eligible active member's existing client role. Client membership itself is not modified by this endpoint. This permits a newly created case to receive its PR and legal assignments before entering review.

The second-milestone UI enters through the case's Response workflow tab. GET /cases/{caseId}/workflow returns scoped statements, revisions, tasks, deliveries, audit timeline and members. POST /cases/{caseId}/assignments assigns an eligible client's existing role to the case. Fact visibility and supersession use POST /cases/{caseId}/facts/{factId}/evidence with action RESTRICT, SHARE or SUPERSEDE and a reason. SUPERSEDE also requires replacement claim and source. SHARE requires an already verified fact. Previously flagged delivery follow-ups remain flagged after evidence is shared again.
