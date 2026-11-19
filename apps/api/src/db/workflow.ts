import type { ObjectId } from 'mongodb'
import type { ReviewerRole, RevisionDto } from '@briefharbor/contracts'

export type Scope = { clientId: ObjectId; caseId: ObjectId }
export type Statement = Scope & {
  _id: ObjectId; audience: string; inquiryId: string | null; draft: string; draftVersion: number;
  authorId: string; currentRevisionId: string | null; revisionCount: number;
}
export type Revision = Scope & {
  _id: ObjectId; statementId: string; version: number; text: string; authorId: string; submittedAt: Date;
  factVersionIds: string[]; state: RevisionDto['state']; reviewers: { userId: string; role: ReviewerRole }[];
}
export type Decision = Scope & {
  revisionId: string; userId: string; decision: 'APPROVE' | 'REQUEST_CHANGES'; comment: string; at: Date;
}
export type ExportRecord = Scope & { revisionId: string; actorId: string; at: Date }
export type Delivery = Scope & {
  _id: ObjectId; revisionId: string; inquiryId: string | null; audience: string | null;
  channel: string; sentAt: Date; actorId: string; followUp: boolean; idempotencyKey: string; fingerprint: string;
}
export type Task = Scope & {
  _id: ObjectId; title: string; assigneeId: string; deadlineAt: Date; status: 'OPEN' | 'DONE'; reason: string | null;
}
