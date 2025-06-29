import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileSyncService } from '../../core/file-sync.js'
import { TestHelpers } from '../utils/test-helpers.js'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'pathe'
import { existsSync } from 'fs'

describe('FileSyncService', () => {
  let fileSyncService: FileSyncService
  let testHelpers: TestHelpers

  beforeEach(() => {
    fileSyncService = new FileSyncService()
    testHelpers = new TestHelpers()
  })

  afterEach(async () => {
    await testHelpers.cleanup()
  })

  describe('syncDirectories', () => {
    it('should sync files from source to target', async () => {
      const sourceDir = await testHelpers.createTempDir()
      const targetDir = await testHelpers.createTempDir()

      // Create source files
      await testHelpers.createMockRepo(sourceDir, {
        'src/app.ts': 'console.log("app");',
        'package.json': '{"name": "test"}',
        'README.md': '# Test Repo'
      })

      // Create target with existing file
      await testHelpers.createMockRepo(targetDir, {
        'InfrastructureAsCodeFile': 'remote_artifact: my-api-1.0.0.zip',
        'old-file.txt': 'should be removed'
      })

      const result = await fileSyncService.syncDirectories({
        sourceDir,
        targetDir,
        dryRun: false
      })

      // Check that files were synced
      expect(result.filesAdded.length + result.filesModified.length).toBeGreaterThan(0)
      expect(result.filesPreserved).toContain('InfrastructureAsCodeFile')

      // Verify InfrastructureAsCodeFile was preserved
      const infrastructureFileContent = await readFile(join(targetDir, 'InfrastructureAsCodeFile'), 'utf-8')
      expect(infrastructureFileContent).toBe('remote_artifact: my-api-1.0.0.zip')

      // Verify source files were copied
      expect(existsSync(join(targetDir, 'src/app.ts'))).toBe(true)
      expect(existsSync(join(targetDir, 'package.json'))).toBe(true)
    })

    it('should work in dry-run mode', async () => {
      const sourceDir = await testHelpers.createTempDir()
      const targetDir = await testHelpers.createTempDir()

      await testHelpers.createMockRepo(sourceDir)
      await testHelpers.createMockRepo(targetDir)

      const result = await fileSyncService.syncDirectories({
        sourceDir,
        targetDir,
        dryRun: true
      })

      expect(result.filesAdded.length + result.filesModified.length).toBeGreaterThan(0)
      expect(result.filesPreserved).toContain('InfrastructureAsCodeFile')
    })

    it('should exclude specified patterns', async () => {
      const sourceDir = await testHelpers.createTempDir()
      const targetDir = await testHelpers.createTempDir()

      await testHelpers.createMockRepo(sourceDir, {
        'node_modules/package/index.js': 'module.exports = {};',
        '.git/config': 'git config',
        'src/app.ts': 'console.log("app");',
        'test.log': 'log content'
      })

      await testHelpers.createMockRepo(targetDir)

      const result = await fileSyncService.syncDirectories({
        sourceDir,
        targetDir,
        excludePatterns: ['node_modules', '.git', '*.log'],
        dryRun: false
      })

      expect(result.filesExcluded.some(f => f.includes('node_modules'))).toBe(true)
      expect(result.filesExcluded.some(f => f.includes('.git'))).toBe(true)
      expect(result.filesExcluded.some(f => f.includes('.log'))).toBe(true)

      // Verify excluded files weren't copied
      expect(existsSync(join(targetDir, 'node_modules'))).toBe(false)
      expect(existsSync(join(targetDir, '.git'))).toBe(false)
      expect(existsSync(join(targetDir, 'test.log'))).toBe(false)

      // Verify allowed files were copied
      expect(existsSync(join(targetDir, 'src/app.ts'))).toBe(true)
    })

    it('should preserve custom files', async () => {
      const sourceDir = await testHelpers.createTempDir()
      const targetDir = await testHelpers.createTempDir()

      await testHelpers.createMockRepo(sourceDir, {
        'config.yml': 'source_config: true',
        'src/app.ts': 'console.log("app");'
      })

      await testHelpers.createMockRepo(targetDir, {
        'config.yml': 'target_config: true',
        'custom.env': 'TARGET_ENV=production'
      })

      const result = await fileSyncService.syncDirectories({
        sourceDir,
        targetDir,
        preserveFiles: ['config.yml', 'custom.env'],
        dryRun: false
      })

      expect(result.filesPreserved).toContain('config.yml')
      expect(result.filesPreserved).toContain('custom.env')

      // Verify preserved files kept original content
      const configContent = await readFile(join(targetDir, 'config.yml'), 'utf-8')
      expect(configContent).toBe('target_config: true')

      const envContent = await readFile(join(targetDir, 'custom.env'), 'utf-8')
      expect(envContent).toBe('TARGET_ENV=production')
    })
  })

  describe('updateInfrastructureFileVersions', () => {
    it('should update version references in InfrastructureAsCodeFile', async () => {
      const targetDir = await testHelpers.createTempDir()

      const infrastructureFileContent = `
remote_artifact: my-api-1.2.3.zip
another_artifact: tool-0.5.1.jar
third_artifact: lib-2.1.0.tar.gz
`

      await writeFile(join(targetDir, 'InfrastructureAsCodeFile'), infrastructureFileContent)

      const updated = await fileSyncService.updateInfrastructureFileVersions(
        targetDir,
        '1.4.5',
        false
      )

      expect(updated).toBe(true)

      const updatedContent = await readFile(join(targetDir, 'InfrastructureAsCodeFile'), 'utf-8')
      expect(updatedContent).toContain('my-api-1.4.5.zip')
      expect(updatedContent).toContain('tool-1.4.5.jar')
      expect(updatedContent).toContain('lib-1.4.5.tar.gz')
    })

    it('should work with different InfrastructureAsCodeFile extensions', async () => {
      const targetDir = await testHelpers.createTempDir()

      await writeFile(join(targetDir, 'InfrastructureAsCodeFile.yml'), 'remote_artifact: app-1.0.0.zip')
      await writeFile(join(targetDir, 'InfrastructureAsCodeFile.yaml'), 'remote_artifact: service-2.0.0.jar')

      const updated = await fileSyncService.updateInfrastructureFileVersions(
        targetDir,
        '3.0.0',
        false
      )

      expect(updated).toBe(true)

      const ymlContent = await readFile(join(targetDir, 'InfrastructureAsCodeFile.yml'), 'utf-8')
      const yamlContent = await readFile(join(targetDir, 'InfrastructureAsCodeFile.yaml'), 'utf-8')

      expect(ymlContent).toContain('app-3.0.0.zip')
      expect(yamlContent).toContain('service-3.0.0.jar')
    })

    it('should work in dry-run mode', async () => {
      const targetDir = await testHelpers.createTempDir()

      const originalContent = 'remote_artifact: my-api-1.0.0.zip'
      await writeFile(join(targetDir, 'InfrastructureAsCodeFile'), originalContent)

      const updated = await fileSyncService.updateInfrastructureFileVersions(
        targetDir,
        '2.0.0',
        true
      )

      expect(updated).toBe(true)

      // File should not be modified in dry-run
      const content = await readFile(join(targetDir, 'InfrastructureAsCodeFile'), 'utf-8')
      expect(content).toBe(originalContent)
    })

    it('should return false when no updates needed', async () => {
      const targetDir = await testHelpers.createTempDir()

      await writeFile(join(targetDir, 'InfrastructureAsCodeFile'), 'no_version_references: true')

      const updated = await fileSyncService.updateInfrastructureFileVersions(
        targetDir,
        '2.0.0',
        false
      )

      expect(updated).toBe(false)
    })

    it('should handle missing InfrastructureAsCodeFile gracefully', async () => {
      const targetDir = await testHelpers.createTempDir()

      const updated = await fileSyncService.updateInfrastructureFileVersions(
        targetDir,
        '2.0.0',
        false
      )

      expect(updated).toBe(false)
    })
  })

  describe('extractVersionFromTag', () => {
    it('should extract version from tag with v prefix', () => {
      const version = fileSyncService.extractVersionFromTag('v1.2.3')
      expect(version).toBe('1.2.3')
    })

    it('should extract version from tag without v prefix', () => {
      const version = fileSyncService.extractVersionFromTag('2.1.0')
      expect(version).toBe('2.1.0')
    })

    it('should handle complex version strings', () => {
      const version = fileSyncService.extractVersionFromTag('v1.2.3-beta.1')
      expect(version).toBe('1.2.3-beta.1')
    })
  })

  describe('pattern matching', () => {
    it('should exclude files matching glob patterns', async () => {
      const sourceDir = await testHelpers.createTempDir()
      const targetDir = await testHelpers.createTempDir()

      await testHelpers.createMockRepo(sourceDir, {
        'test.log': 'log file',
        'debug.log': 'debug log',
        'app.js': 'application',
        'config.json': 'config',
        'temp.tmp': 'temporary'
      })

      await testHelpers.createMockRepo(targetDir)

      const result = await fileSyncService.syncDirectories({
        sourceDir,
        targetDir,
        excludePatterns: ['*.log', '*.tmp'],
        dryRun: false
      })

      expect(result.filesExcluded.some(f => f.includes('.log'))).toBe(true)
      expect(result.filesExcluded.some(f => f.includes('.tmp'))).toBe(true)

      expect(existsSync(join(targetDir, 'test.log'))).toBe(false)
      expect(existsSync(join(targetDir, 'debug.log'))).toBe(false)
      expect(existsSync(join(targetDir, 'temp.tmp'))).toBe(false)
      expect(existsSync(join(targetDir, 'app.js'))).toBe(true)
      expect(existsSync(join(targetDir, 'config.json'))).toBe(true)
    })
  })
})