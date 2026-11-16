import type { Metadata } from 'next'
import { SessionProvider } from '../components/session'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'BriefHarbor', template: '%s | BriefHarbor' },
  description: 'Private crisis communications workspace',
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><SessionProvider>{children}</SessionProvider></body></html>
}
