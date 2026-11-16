export const isDemo = process.env.NEXT_PUBLIC_BRIEFHARBOR_DEMO === 'true'
export const demoCaseSegment = 'preview'

export function caseHref(id: string, view?: string) {
  const query = new URLSearchParams()
  if (isDemo) query.set('id', id)
  if (view) query.set('view', view)
  const path = '/cases/' + (isDemo ? demoCaseSegment : encodeURIComponent(id))
  return query.size ? path + '?' + query : path
}
