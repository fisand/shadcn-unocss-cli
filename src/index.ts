import process from 'node:process'
import fs from 'fs-extra'
import color from 'picocolors'


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
} from '@clack/prompts';
import { ALL_SHADCN_COMPONENTS } from './constants/shadcn'
import path from 'node:path'
import { exec as exec_ } from "node:child_process"
import { promisify } from "node:util"
import { checkDeps, generateUnocssConfig, getRadixDeps } from './utils';

const exec = promisify(exec_)

async function runCommand(cmd: string) {
  try {
    await exec(cmd)
  } catch (err) {
    console.error(`Error: ${err}`)
  }
}

const BASE_PATH = process.cwd()
const GITHUB_RAW_CONTENT_URL = 'https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/www/registry/new-york/ui'
const INLINE_LIB_PATH = '@/lib/utils'
const INLINE_UI_PATH = '@/registry/new-york/ui'

const cancelCheck = (input: unknown) => {
  if (isCancel(input)) {
    cancel('Operation cancelled');
    return process.exit(0);
  }
}

async function main() {
  console.log();
  intro(`${color.bgCyan(color.black(" use unocss for shadcn/ui "))}`);

  const { utils, ui } = await prepareProject()

  const dirPath = await text({
    message: 'Enter the path to the directory containing the components',
    initialValue: './src/components/ui',
  })

  cancelCheck(dirPath)

  const useNext = await confirm({
    message: 'Do you use Next.js?',
    initialValue: false,
  })

  cancelCheck(useNext)

  const selectedComponents = await multiselect({
    message: 'Select the components you want to use',
    options: ALL_SHADCN_COMPONENTS.map((component) => ({ label: component, value: component })),
  })

  cancelCheck(selectedComponents)

  const downloadComponents = async (components: string[]) => {
    const s = spinner()
    s.start('Downloading components...')

    const radixDeps = []
    for (const component of components) {
      const response = await fetch(`${GITHUB_RAW_CONTENT_URL}/${component}.tsx`)
      const data = await response.text()


      try {
        radixDeps.push(...await getRadixDeps(data))

        const targetDir = path.resolve(BASE_PATH, dirPath.toString())
        await fs.ensureDir(targetDir)
        await fs.writeFile(path.resolve(targetDir, `${component}.tsx`), data.replace(INLINE_LIB_PATH, utils).replace(INLINE_UI_PATH, ui).replace(!useNext ? /^\"use client\"\n.*\n/m : '', ''))
      } catch (error) {
        console.error(error)
      }
    }
    s.stop('Successfully downloaded components')

    return radixDeps
  }

  const dependencies = await downloadComponents(selectedComponents as string[])

  note(`${color.blue("Install the following dependencies: ")} \n\n${dependencies.join('\n')}`)

  try {
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
  } catch (error) {
    console.error(error)
  }

  outro(`${color.green("Enjoy now!")}`)
}

main()

async function prepareProject() {
  await generateUnocssConfig()
  const { components, utils, ui } = await generateComponentsJSON()

  return {
    components: components.toString(),
    utils: utils.toString(),
    ui: ui.toString(),
  }
}

async function generateComponentsJSON() {
  const componentsJSONPath = path.resolve(BASE_PATH, 'components.json')

  if (fs.existsSync(componentsJSONPath)) {
    const content = await fs.readFile(componentsJSONPath, 'utf-8')
    return JSON.parse(content).aliases
  }

  note(`${color.blue("Initialize components.json")}`)

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

  const content = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "tsx": true,
  "aliases": {
    "components": "${components.toString()}",
    "utils": "${utils.toString()}",
    "ui": "${ui.toString()}"
  }
}`

  await fs.writeFile(componentsJSONPath, content, 'utf-8')

  return {
    components,
    utils,
    ui,
  }
}
