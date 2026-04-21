import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repoName ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
