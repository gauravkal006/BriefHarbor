import { spawnSync } from 'node:child_process'

const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this task through npm run build:demo or npm run dev:demo.')

const env = { ...process.env, NEXT_PUBLIC_BRIEFHARBOR_DEMO: 'true' }
const mode = process.argv[2] === 'dev' ? 'dev' : 'build'

for (const [task, workspace] of [['build', '@briefharbor/contracts'], [mode, '@briefharbor/web']]) {
  const result = spawnSync(process.execPath, [npm, 'run', task, '-w', workspace], { env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
