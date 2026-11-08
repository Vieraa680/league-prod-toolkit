import fs from 'fs'
import { promisify } from 'util'
import path from 'path'
import { exec } from 'child_process'
import type { PackageJson } from '../core/modules/Module'

const execPromise = promisify(exec)

const modulePath = './modules'

const main = async (): Promise<void> => {
  const data = await fs.promises.readdir(modulePath)
  const typesPath = path.resolve('./types')
  const hasLocalTypes = fs.existsSync(typesPath)
  const rootTs = path.resolve('./node_modules/typescript')

  const args = process.argv.slice(2).filter((arg) => arg !== 'ni')
  const shouldInstall = !process.argv.includes('ni')

  for (const folderName of data) {
    if (args.length > 0 && !args.includes(folderName)) {
      continue
    }

    const currentModulePath = path.join(modulePath, folderName)
    const packageJsonPath = path.join(currentModulePath, 'package.json')

    try {
      // Check that package.json exists
      await fs.promises.stat(packageJsonPath)
    } catch {
      continue
    }

    const pkgJson = JSON.parse(
      (await fs.promises.readFile(packageJsonPath)).toString()
    ) as PackageJson

    if (
      (pkgJson.dependencies !== undefined ||
        pkgJson.devDependencies !== undefined) &&
      shouldInstall
    ) {
      console.log('installing ' + folderName)

      // run install
      try {
        await execPromise('npm ci --allow-git=all', {
          cwd: currentModulePath
        })
      } catch {
        try {
          await execPromise('npm i --allow-git=all', {
            cwd: currentModulePath
          })
        } catch (e: any) {
          console.error(`Failed to install module dependencies: ${pkgJson.name}`)
          if (typeof e?.stderr === 'string' && e.stderr.length > 0) {
            console.error(e.stderr)
          }
        }
      }

      console.log('installed ' + folderName)
    }

    // Ensure @rcv-prod-toolkit/types is available locally from types/
    if (hasLocalTypes) {
      const typesTargetDir = path.join(currentModulePath, 'node_modules', '@rcv-prod-toolkit')
      const typesTarget = path.join(typesTargetDir, 'types')
      try {
        await fs.promises.mkdir(typesTargetDir, { recursive: true })
        try {
          await fs.promises.lstat(typesTarget)
        } catch {
          await fs.promises.symlink(typesPath, typesTarget, 'junction')
        }
      } catch (err: any) {
        console.warn(`Could not symlink types for ${folderName}: ${err.message as string}`)
      }
    }

    // Ensure typescript is available locally from root node_modules
    if (fs.existsSync(rootTs)) {
      const tsTarget = path.join(currentModulePath, 'node_modules', 'typescript')
      try {
        await fs.promises.mkdir(path.join(currentModulePath, 'node_modules'), { recursive: true })
        try {
          await fs.promises.lstat(tsTarget)
        } catch {
          await fs.promises.symlink(rootTs, tsTarget, 'junction')
        }
      } catch (err: any) {
        console.warn(`Could not symlink typescript for ${folderName}: ${err.message as string}`)
      }
    }

    if (
      pkgJson.toolkit.needsBuild !== undefined &&
      pkgJson.toolkit.needsBuild
    ) {
      console.log('='.repeat(20))
      console.log('start building ' + folderName)
      try {
        const { stdout } = await execPromise('npm run build', {
          cwd: currentModulePath
        })
        console.log(stdout)
        console.log('finished building ' + folderName)
      } catch (err: any) {
        console.error(`Failed building ${folderName}:`)
        const stdout = typeof err?.stdout === 'string' ? err.stdout : ''
        const stderr = typeof err?.stderr === 'string' ? err.stderr : ''
        if (stdout.length > 0) console.log(stdout)
        if (stderr.length > 0) console.error(stderr)
        if (stdout.length === 0 && stderr.length === 0) {
          console.error((err?.message as string) ?? String(err))
        }
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()
