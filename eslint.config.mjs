import ts from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['**/dist/**', '**/.next/**', '**/next-env.d.ts'] },
  ...ts.configs.recommended,
  { files: ['apps/web/**/*.tsx'], plugins: { 'react-hooks': hooks }, rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } },
]
