import type { Case, FactVersion, MediaInquiry } from '../db/index.js'

export const summary = (item: Case, nearest: Date | null) => ({
  id: item._id.toHexString(), clientId: item.clientId.toHexString(), title: item.title, type: item.type,
  severity: item.severity, status: item.status, synthetic: item.synthetic, ownerId: item.ownerId.toHexString(),
  nextUpdateAt: item.nextUpdateAt.toISOString(), nearestInquiryDeadlineAt: nearest?.toISOString() ?? null,
})
export const factDto = (item: FactVersion) => ({
  id: item._id.toHexString(), logicalFactId: item.logicalFactId.toHexString(), version: item.version,
  ownerId: item.ownerId.toHexString(), claim: item.claim, source: item.source, visibility: item.visibility,
  status: item.status, verifierId: item.verifierId?.toHexString() ?? null, verifiedAt: item.verifiedAt?.toISOString() ?? null,
})
export const inquiryDto = (item: MediaInquiry) => ({
  id: item._id.toHexString(), ownerId: item.ownerId.toHexString(), outlet: item.outlet, contact: item.contact, question: item.question,
  deadlineAt: item.deadlineAt.toISOString(), status: item.status, closureReason: item.closureReason,
})
