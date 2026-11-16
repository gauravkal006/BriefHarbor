export const types = {
  DATA_BREACH: 'Data breach', LAWSUIT: 'Lawsuit',
  EXECUTIVE_SCANDAL: 'Executive scandal', HOSTILE_PUBLIC_EVENT: 'Hostile public event',
}
export function label(value: string) {
  if (value in types) return types[value as keyof typeof types]
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
export function dateField(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function utc(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}
