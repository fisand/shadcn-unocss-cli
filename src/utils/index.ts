import { init, parse } from 'es-module-lexer'
import { transform } from 'esbuild'
import fs from 'fs-extra'
import path from 'node:path'
import process from 'node:process'

export async function getRadixDeps(data: string) {
  const result = await transform(data, {
    loader: 'tsx',
    sourcemap: true,
  })

  await init
  const [imports] = parse(result.code)
  return imports.filter((im) => im.n?.startsWith('@radix-ui/')).map((im) => im.n)
}

export async function generateUnocssConfig() {
  const BASE_PATH = process.cwd()

  const CONFIG_PATH = path.resolve(BASE_PATH, 'unocss.config.ts')

  if (fs.existsSync(CONFIG_PATH)) {
    return
  }

  const content = `import { presetWind } from '@unocss/preset-wind3'
import { defineConfig } from 'unocss'
import presetAnimations from 'unocss-preset-animations'
import { presetShadcn } from 'unocss-preset-shadcn'

export default defineConfig({
  presets: [
    presetWind(),
    presetAnimations(),
    presetShadcn(),
  ],
})`

  await fs.writeFile(CONFIG_PATH, content, 'utf-8')
}


const DEPS = ['@unocss/reset']
const DEV_DEPS = ['clsx', 'class-variance-authority', 'lucide-react', 'tailwind-merge', '@unocss/preset-wind3', 'unocss-preset-animations', 'unocss-preset-shadcn', 'unocss']

export async function checkDeps() {
  const pkg = await fs.readJSON(path.resolve(process.cwd(), 'package.json'))

  const devMissing = [...DEV_DEPS].filter((dep) => !pkg.dependencies[dep] && !pkg.devDependencies[dep])
  const missing = [...DEPS].filter((dep) => !pkg.dependencies[dep])

  return {
    devMissing,
    missing,
  }
}
