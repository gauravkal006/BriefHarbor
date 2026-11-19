import { Suspense } from 'react'
import { DemoWorkflowPage, WorkflowPage } from '../../../../../../components/workflow-panel'
import { isDemo } from '../../../../../../lib/demo-mode'

export function generateStaticParams() { return isDemo ? [{ caseId: 'preview', statementId: 'preview' }] : [] }
export default async function Page({ params }: { params: Promise<{ caseId: string; statementId: string }> }) {
  const { caseId, statementId } = await params
  return isDemo ? <Suspense fallback={<p role="status">Loading statement.</p>}><DemoWorkflowPage /></Suspense> :
    <WorkflowPage caseId={caseId} statementId={statementId} />
}
