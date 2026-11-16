import { defineConfig } from '@playwright/test'
import { loadEnvFile } from 'node:process'
import { existsSync } from 'node:fs'

if (existsSync('apps/api/.env')) loadEnvFile('apps/api/.env')
export default defineConfig({
  testDir: './apps/web/test',
  workers: 1,
  timeout: 75_000,
  use: { baseURL: process.env.WEB_ORIGIN || 'http://localhost:3000' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
