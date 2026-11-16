import type { ErrorRequestHandler, Request, Response } from 'express'
import { MongoServerError } from 'mongodb'
import type { Schema } from '@briefharbor/contracts'

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors: Record<string, string> = {}) {
    super(message)
  }
}
export const missing = () => new HttpError(404, 'NOT_FOUND', 'This record is unavailable or you do not have access.')
export const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Your role does not permit this action.')
export const unauthorized = () => new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.')
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message)

export function validate<T>(schema: Schema<T>, input: unknown, field = 'body') {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join('.') || field, issue.message]))
    throw new HttpError(422, 'VALIDATION', 'Check the submitted fields.', fields)
  }
  return parsed.data
}
export function send<T>(response: Response, schema: Schema<T>, data: unknown, status = 200) {
  response.status(status).json({ data: schema.parse(data) })
}
export const errors: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return }
  let failure = error instanceof HttpError ? error : new HttpError(500, 'INTERNAL', 'The request could not be completed.')
  if (error instanceof MongoServerError && (error.code === 11000 || error.hasErrorLabel('TransientTransactionError'))) {
    failure = conflict('The record changed. Reload and try again.')
  } else if (error?.type === 'entity.parse.failed') {
    failure = new HttpError(422, 'VALIDATION', 'Submit a valid JSON body.')
  } else if (error?.type === 'entity.too.large') {
    failure = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.')
  }
  if (failure.status >= 500) console.error('API request failed:', error instanceof Error ? error.name : 'Unknown error')
  res.status(failure.status).json({ error: { code: failure.code, message: failure.message, fieldErrors: failure.fieldErrors } })
}
export function actorId(request: Request) {
  if (!request.session.userId) throw unauthorized()
  return request.session.userId
}
