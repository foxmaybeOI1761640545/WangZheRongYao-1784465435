import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function normalizeBasePath(value) {
  if (!value) return '/'
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function resolveBasePath() {
  if (process.env.VITE_BASE_PATH) {
    return normalizeBasePath(process.env.VITE_BASE_PATH)
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
    if (!repositoryName || repositoryName.endsWith('.github.io')) return '/'
    return normalizeBasePath(repositoryName)
  }

  return '/'
}

export default defineConfig({
  plugins: [vue()],
  base: resolveBasePath(),
  build: {
    sourcemap: true,
  },
})
