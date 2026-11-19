import { Suspense } from 'react'
import { DemoWorkflowPage, WorkflowPage } from '../../../../../components/workflow-panel'
import { isDemo } from '../../../../../lib/demo-mode'

export function generateStaticParams() { return isDemo ? [{ caseId: 'preview' }] : [] }
export default async function Page({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  return isDemo ? <Suspense fallback={<p role="status">Loading report.</p>}><DemoWorkflowPage report /></Suspense> : <WorkflowPage caseId={caseId} report />
}
