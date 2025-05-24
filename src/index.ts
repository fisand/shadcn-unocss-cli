import process from 'node:process'
import fs from 'fs-extra'
import color from 'picocolors'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'node:path'
import { exec as exec_ } from "node:child_process"
import { promisify } from "node:util"

import {
  intro,
  outro,
  spinner,
  text,
  isCancel,
  cancel,
  multiselect,
  confirm,
  note,
} from '@clack/prompts'

import { ALL_SHADCN_COMPONENTS } from './constants/shadcn'
import { checkDeps, generateUnocssConfig, getRadixDeps } from './utils'
import { RemoteComponent } from './models'

// Constants
const BASE_PATH = process.cwd()
const GITHUB_RAW_CONTENT_URL = 'https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/www/registry/new-york/ui'
const INLINE_LIB_PATH = '@/lib/utils'
const INLINE_UI_PATH = '@/registry/new-york/ui'

const exec = promisify(exec_)

// Utility functions
const cancelCheck = (input: unknown) => {
  if (isCancel(input)) {
    cancel('Operation cancelled')
    return process.exit(0)
  }
}

async function runCommand(cmd: string) {
  try {
    await exec(cmd)
  } catch (err) {
    console.error(`Error: ${err}`)
  }
}

// Configuration management
async function loadOrCreateComponentsJSON() {
  const componentsJSONPath = path.resolve(BASE_PATH, 'components.json')

  if (fs.existsSync(componentsJSONPath)) {
    const content = await fs.readFile(componentsJSONPath, 'utf-8')
    const aliases = JSON.parse(content).aliases

    // Ensure all required fields exist with fallback values
    return {
      components: aliases.components || '@/components',
      utils: aliases.utils || '@/lib/utils',
      ui: aliases.ui || '@/components/ui',
      path: aliases.path || './src/components/ui',
      useNext: aliases.useNext || false,
    }
  }

  return await createComponentsJSON(componentsJSONPath)
}

async function createComponentsJSON(componentsJSONPath: string) {
  note(`${color.blue("Initialize components.json")}`)

  const componentsPath = await text({
    message: 'Enter the path to the components',
    initialValue: './src/components/ui',
  })
  cancelCheck(componentsPath)

  const useNext = await confirm({
    message: 'Do you use Next.js?',
    initialValue: false,
  })
  cancelCheck(useNext)

  const components = await text({
    message: 'Enter the alias for the components',
    initialValue: '@/components',
  })
  cancelCheck(components)

  const utils = await text({
    message: 'Enter the alias for the utils',
    initialValue: '@/lib/utils',
  })
  cancelCheck(utils)

  const ui = await text({
    message: 'Enter the alias for the ui',
    initialValue: '@/components/ui',
  })
  cancelCheck(ui)

  if (!(await fs.exists(path.resolve(BASE_PATH, './src/lib/utils.ts')))) {
    await fs.writeFile(path.resolve(BASE_PATH, './src/lib/utils.ts'), `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`)
  }

  const content = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tsx": true,
  "aliases": {
    "path": "${componentsPath.toString()}",
    "components": "${components.toString()}",
    "utils": "${utils.toString()}",
    "ui": "${ui.toString()}",
    "useNext": ${useNext.toString()}
  }
}`

  await fs.writeFile(componentsJSONPath, content, 'utf-8')

  return {
    components,
    utils,
    ui,
    path: componentsPath,
    useNext,
  }
}

async function prepareProject() {
  await generateUnocssConfig()
  return await loadOrCreateComponentsJSON()
}

// Component processing
function processComponentContent(content: string, utils: string, ui: string, useNext: boolean) {
  return content
    .replace(INLINE_LIB_PATH, utils)
    .replace(INLINE_UI_PATH, ui)
    .replace(!Boolean(useNext) ? /^\"use client\"\n.*\n/m : '', '')
}

async function downloadShadcnComponents(components: string[], dirPath: string, utils: string, ui: string, useNext: boolean) {
  const s = spinner()
  s.start('Downloading components...')

  const radixDeps: string[] = []

  for (const component of components) {
    const response = await fetch(`${GITHUB_RAW_CONTENT_URL}/${component}.tsx`)
    const data = await response.text()

    try {
      const deps = await getRadixDeps(data)
      radixDeps.push(...deps.filter((dep): dep is string => dep !== undefined))

      const targetDir = path.resolve(BASE_PATH, dirPath.toString())
      await fs.ensureDir(targetDir)

      const processedContent = processComponentContent(data, utils, ui, useNext)
      await fs.writeFile(path.resolve(targetDir, `${component}.tsx`), processedContent)
    } catch (error) {
      console.error(error)
    }
  }

  s.stop('Successfully downloaded components')
  return radixDeps
}

async function installRemoteComponent(data: RemoteComponent, utils: string, ui: string, useNext: boolean) {
  for (const file of data.files) {
    await fs.ensureDir(path.resolve(BASE_PATH, path.dirname(file.path)))

    const processedContent = processComponentContent(file.content, utils, ui, useNext)
    await fs.writeFile(path.resolve(BASE_PATH, file.path), processedContent)
  }

  const s = spinner()
  s.start("Installing dependencies via pnpm")
  await runCommand(`pnpm add ${data.dependencies.join(' ')}`)
  s.stop("Completed")
}

// Dependency management
async function installDependencies(dependencies: string[]) {
  note(`${color.blue("Install the following dependencies: ")} \n\n${dependencies.join('\n')}`)

  const s = spinner()
  s.start("Installing radix-ui dependencies via pnpm")
  await runCommand(`pnpm add ${dependencies.join(' ')}`)

  const { devMissing, missing } = await checkDeps()

  if (devMissing.length > 0) {
    await runCommand(`pnpm add -D ${devMissing.join(' ')}`)
  }
  if (missing.length > 0) {
    await runCommand(`pnpm add ${missing.join(' ')}`)
  }

  s.stop("Installed")
}

// Main application logic
async function handleAddCommand(url: string) {
  const response = await fetch(url)
  const data = await response.json() as RemoteComponent
  const { utils, ui, useNext } = await prepareProject()

  try {
    await installRemoteComponent(data, utils, ui, useNext)
  } catch (error) {
    console.error(error)
  }
}

async function handleInteractiveMode() {
  console.log()
  intro(`${color.bgCyan(color.black(" use unocss for shadcn/ui "))}`)

  const { utils, ui, path: dirPath, useNext } = await prepareProject()

  const selectedComponents = await multiselect({
    message: 'Select the components you want to use',
    options: ALL_SHADCN_COMPONENTS.map((component) => ({ label: component, value: component })),
  })
  cancelCheck(selectedComponents)

  try {
    const dependencies = await downloadShadcnComponents(
      selectedComponents as string[],
      dirPath,
      utils,
      ui,
      useNext
    )

    await installDependencies(dependencies)
  } catch (error) {
    console.error(error)
  }

  outro(`${color.green("Enjoy now!")}`)
}

// CLI setup
yargs(hideBin(process.argv))
  .scriptName("shadcn-uno")
  .usage('$0 <cmd> [args]')
  .command('add <url>', 'Add remote components', (yargs) => {
    yargs.positional('url', {
      type: 'string',
      describe: 'The name of the url to add'
    })
  }, async (argv) => {
    if (!argv.url) {
      console.error('Please provide a url')
      return
    }
    await handleAddCommand(argv.url as string)
  })
  .command('$0', 'Interactive mode', () => { }, async () => {
    await handleInteractiveMode()
  })
  .help()
  .parse()