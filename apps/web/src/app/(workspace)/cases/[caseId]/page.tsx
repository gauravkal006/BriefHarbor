import { Suspense } from 'react'
import { CaseWorkspace, DemoCaseWorkspace } from '../../../../components/case-workspace'
import { demoCaseSegment, isDemo } from '../../../../lib/demo-mode'

export function generateStaticParams() {
  return isDemo ? [{ caseId: demoCaseSegment }] : []
}

export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  return isDemo ? <Suspense fallback={<p role="status">Loading case.</p>}><DemoCaseWorkspace /></Suspense> : <CaseWorkspace key={caseId} caseId={caseId} />
}
