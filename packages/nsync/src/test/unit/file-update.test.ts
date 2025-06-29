import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileUpdateService } from '../../core/file-update.js'
import { TestHelpers } from '../utils/test-helpers.js'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'pathe'
import type { FilePreservationRule } from '../../core/file-update.js'

describe('FileUpdateService', () => {
  let fileUpdateService: FileUpdateService
  let testHelpers: TestHelpers
  let testDir: string

  beforeEach(async () => {
    testHelpers = new TestHelpers()
    testDir = await testHelpers.createTempDir()
  })

  afterEach(async () => {
    await testHelpers.cleanup()
  })

  describe('Pattern-based updates', () => {
    it('should update infrastructure file with pattern rule', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['InfrastructureAsCodeFile*'],
        description: 'Update artifact versions',
        update_rules: [{
          name: 'artifact_versions',
          type: 'pattern',
          pattern: '{prefix}-{version}.{ext}',
          fields: ['remote_artifact'],
          version_strategy: 'replace_if_newer'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      // Create test InfrastructureAsCodeFile
      const infrastructureFilePath = join(testDir, 'InfrastructureAsCodeFile')
      await writeFile(infrastructureFilePath, 'remote_artifact: com/org/my-api-0.1.44.zip\nother_field: unchanged')

      // Update with newer version
      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '0.1.78',
        { tag: 'v0.1.78', tag_without_v: '0.1.78' }
      )

      expect(results).toHaveLength(1)
      expect(results[0].modified).toBe(true)
      expect(results[0].changes).toHaveLength(1)
      expect(results[0].changes[0].oldValue).toBe('com/org/my-api-0.1.44.zip')
      expect(results[0].changes[0].newValue).toBe('com/org/my-api-0.1.78.zip')

      // Verify file content
      const updatedContent = await readFile(infrastructureFilePath, 'utf-8')
      expect(updatedContent).toContain('remote_artifact: com/org/my-api-0.1.78.zip')
      expect(updatedContent).toContain('other_field: unchanged')
    })

    it('should not update if version is not newer', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['InfrastructureAsCodeFile'],
        update_rules: [{
          name: 'artifact_versions',
          type: 'pattern',
          pattern: '{prefix}-{version}.{ext}',
          fields: ['remote_artifact'],
          version_strategy: 'replace_if_newer'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const infrastructureFilePath = join(testDir, 'InfrastructureAsCodeFile')
      await writeFile(infrastructureFilePath, 'remote_artifact: com/org/my-api-2.0.0.zip')

      // Try to update with older version
      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '1.5.0',
        { tag: 'v1.5.0', tag_without_v: '1.5.0' }
      )

      expect(results[0].modified).toBe(false)
      expect(results[0].changes).toHaveLength(0)

      // Verify file content unchanged
      const content = await readFile(infrastructureFilePath, 'utf-8')
      expect(content).toContain('remote_artifact: com/org/my-api-2.0.0.zip')
    })

    it('should handle multiple fields in pattern rule', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['InfrastructureAsCodeFile'],
        update_rules: [{
          name: 'artifact_versions',
          type: 'pattern',
          pattern: '{prefix}-{version}.{ext}',
          fields: ['remote_artifact', 'backup_tool'],
          version_strategy: 'replace_if_newer'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const infrastructureFilePath = join(testDir, 'InfrastructureAsCodeFile')
      await writeFile(infrastructureFilePath, `remote_artifact: service-1.0.0.zip
backup_tool: backup-tool-1.0.0.jar
other_field: unchanged`)

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.1.0',
        { tag: 'v2.1.0', tag_without_v: '2.1.0' }
      )

      expect(results[0].modified).toBe(true)
      expect(results[0].changes).toHaveLength(2)

      const updatedContent = await readFile(infrastructureFilePath, 'utf-8')
      expect(updatedContent).toContain('remote_artifact: service-2.1.0.zip')
      expect(updatedContent).toContain('backup_tool: backup-tool-2.1.0.jar')
      expect(updatedContent).toContain('other_field: unchanged')
    })
  })

  describe('JSON field updates', () => {
    it('should update JSON field with template', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['package.json'],
        update_rules: [{
          name: 'package_version',
          type: 'json_field',
          path: 'version',
          value: '{tag_without_v}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const packagePath = join(testDir, 'package.json')
      await writeFile(packagePath, JSON.stringify({
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21'
        }
      }, null, 2))

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.1.0',
        { tag: 'v2.1.0', tag_without_v: '2.1.0' }
      )

      expect(results[0].modified).toBe(true)
      expect(results[0].changes[0].newValue).toBe('2.1.0')

      const updatedContent = await readFile(packagePath, 'utf-8')
      const packageJson = JSON.parse(updatedContent)
      expect(packageJson.version).toBe('2.1.0')
      expect(packageJson.name).toBe('test-package')
      expect(packageJson.dependencies.lodash).toBe('^4.17.21')
    })

    it('should handle nested JSON paths', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['config.json'],
        update_rules: [{
          name: 'api_version',
          type: 'json_field',
          path: 'api.version',
          value: '{sync_version}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const configPath = join(testDir, 'config.json')
      await writeFile(configPath, JSON.stringify({
        api: {
          version: '1.0.0',
          endpoint: 'https://api.example.com'
        },
        database: {
          host: 'localhost'
        }
      }, null, 2))

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '3.2.1',
        { sync_version: '3.2.1' }
      )

      expect(results[0].modified).toBe(true)

      const updatedContent = await readFile(configPath, 'utf-8')
      const config = JSON.parse(updatedContent)
      expect(config.api.version).toBe('3.2.1')
      expect(config.api.endpoint).toBe('https://api.example.com')
      expect(config.database.host).toBe('localhost')
    })
  })

  describe('YAML field updates', () => {
    it('should update YAML field', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['*.yml'],
        update_rules: [{
          name: 'chart_version',
          type: 'yaml_field',
          path: 'appVersion',
          value: '{tag_without_v}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const chartPath = join(testDir, 'Chart.yml')
      await writeFile(chartPath, `apiVersion: v2
name: my-chart
description: A Helm chart
version: 0.1.0
appVersion: "1.0.0"
dependencies:
  - name: redis
    version: "^6.0.0"`)

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.5.0',
        { tag: 'v2.5.0', tag_without_v: '2.5.0' }
      )

      expect(results[0].modified).toBe(true)

      const updatedContent = await readFile(chartPath, 'utf-8')
      expect(updatedContent).toContain('appVersion: 2.5.0')
      expect(updatedContent).toContain('name: my-chart')
      expect(updatedContent).toContain('version: 0.1.0')
    })
  })

  describe('Regex updates', () => {
    it('should apply regex replacement', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['Dockerfile'],
        update_rules: [{
          name: 'base_image',
          type: 'regex',
          regex: 'FROM (?<image>[\\w/]+):(?<version>[\\d.]+)',
          replacement: 'FROM {image}:{sync_version}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const dockerfilePath = join(testDir, 'Dockerfile')
      await writeFile(dockerfilePath, `FROM node:16.14.0
WORKDIR /app
COPY package.json .
RUN npm install`)

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '18.17.0',
        { sync_version: '18.17.0' }
      )

      expect(results[0].modified).toBe(true)

      const updatedContent = await readFile(dockerfilePath, 'utf-8')
      expect(updatedContent).toContain('FROM node:18.17.0')
      expect(updatedContent).toContain('WORKDIR /app')
    })
  })

  describe('Version strategies', () => {
    it('should respect always_replace strategy', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['test.txt'],
        update_rules: [{
          name: 'version_field',
          type: 'yaml_field',
          path: 'version',
          value: '{sync_version}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const testPath = join(testDir, 'test.txt')
      await writeFile(testPath, 'version: 5.0.0')

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.0.0',
        { sync_version: '2.0.0' }
      )

      expect(results[0].modified).toBe(true)
      expect(results[0].changes[0].newValue).toBe('2.0.0')
    })

    it('should respect never_replace strategy', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['test.txt'],
        update_rules: [{
          name: 'version_field',
          type: 'yaml_field',
          path: 'version',
          value: '{sync_version}',
          version_strategy: 'never_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const testPath = join(testDir, 'test.txt')
      await writeFile(testPath, 'version: 1.0.0')

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.0.0',
        { sync_version: '2.0.0' }
      )

      expect(results[0].modified).toBe(false)
    })
  })

  describe('Multiple files and rules', () => {
    it('should handle multiple files with different rules', async () => {
      const rules: FilePreservationRule[] = [
        {
          files: ['InfrastructureAsCodeFile*'],
          update_rules: [{
            name: 'artifacts',
            type: 'pattern',
            pattern: '{prefix}-{version}.{ext}',
            fields: ['remote_artifact'],
            version_strategy: 'replace_if_newer'
          }]
        },
        {
          files: ['package.json'],
          update_rules: [{
            name: 'npm_version',
            type: 'json_field',
            path: 'version',
            value: '{tag_without_v}',
            version_strategy: 'always_replace'
          }]
        }
      ]

      fileUpdateService = new FileUpdateService(rules)

      // Create test files
      await writeFile(join(testDir, 'InfrastructureAsCodeFile'), 'remote_artifact: service-1.0.0.zip')
      await writeFile(join(testDir, 'package.json'), JSON.stringify({
        name: 'test',
        version: '1.0.0'
      }, null, 2))

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.1.0',
        { tag: 'v2.1.0', tag_without_v: '2.1.0' }
      )

      expect(results).toHaveLength(2)
      expect(results.every(r => r.modified)).toBe(true)

      // Verify InfrastructureAsCodeFile
      const infrastructureContent = await readFile(join(testDir, 'InfrastructureAsCodeFile'), 'utf-8')
      expect(infrastructureContent).toContain('service-2.1.0.zip')

      // Verify package.json
      const packageContent = await readFile(join(testDir, 'package.json'), 'utf-8')
      const packageJson = JSON.parse(packageContent)
      expect(packageJson.version).toBe('2.1.0')
    })
  })

  describe('Dry run mode', () => {
    it('should preview changes without applying them', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['InfrastructureAsCodeFile'],
        update_rules: [{
          name: 'artifacts',
          type: 'pattern',
          pattern: '{prefix}-{version}.{ext}',
          fields: ['remote_artifact'],
          version_strategy: 'replace_if_newer'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const infrastructureFilePath = join(testDir, 'InfrastructureAsCodeFile')
      const originalContent = 'remote_artifact: service-1.0.0.zip'
      await writeFile(infrastructureFilePath, originalContent)

      // Run in dry-run mode
      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.1.0',
        { tag: 'v2.1.0', tag_without_v: '2.1.0' },
        true // dry run
      )

      expect(results[0].modified).toBe(true)
      expect(results[0].changes[0].newValue).toBe('service-2.1.0.zip')

      // Verify file was not actually changed
      const content = await readFile(infrastructureFilePath, 'utf-8')
      expect(content).toBe(originalContent)
    })
  })

  describe('Error handling', () => {
    it('should handle missing files gracefully', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['nonexistent.txt'],
        update_rules: [{
          name: 'test',
          type: 'yaml_field',
          path: 'version',
          value: '{sync_version}'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '1.0.0',
        {}
      )

      expect(results).toHaveLength(0)
    })

    it('should handle invalid JSON gracefully', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['invalid.json'],
        update_rules: [{
          name: 'test',
          type: 'json_field',
          path: 'version',
          value: '{sync_version}'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      await writeFile(join(testDir, 'invalid.json'), '{ invalid json }')

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '1.0.0',
        { sync_version: '1.0.0' }
      )

      expect(results[0].modified).toBe(false)
    })
  })

  describe('Template functions', () => {
    it('should process template variables correctly', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['config.yml'],
        update_rules: [{
          name: 'version_update',
          type: 'yaml_field',
          path: 'version',
          value: '{tag_without_v}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      await writeFile(join(testDir, 'config.yml'), 'version: 1.0.0')

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.1.0',
        { 
          tag: 'v2.1.0',
          tag_without_v: '2.1.0',
          custom_var: 'test'
        }
      )

      expect(results[0].modified).toBe(true)
      expect(results[0].changes[0].newValue).toBe('2.1.0')
    })
  })

  describe('Glob pattern matching', () => {
    it('should match files with glob patterns', async () => {
      const rules: FilePreservationRule[] = [{
        files: ['*.yaml', 'config/*'],
        update_rules: [{
          name: 'version_update',
          type: 'yaml_field',
          path: 'version',
          value: '{sync_version}',
          version_strategy: 'always_replace'
        }]
      }]

      fileUpdateService = new FileUpdateService(rules)

      // Create multiple files
      await writeFile(join(testDir, 'app.yaml'), 'version: 1.0.0')
      await writeFile(join(testDir, 'deployment.yaml'), 'version: 1.0.0')

      const results = await fileUpdateService.updatePreservedFiles(
        testDir,
        '2.1.0',
        { sync_version: '2.1.0' }
      )

      expect(results).toHaveLength(2)
      expect(results.every(r => r.modified)).toBe(true)
    })
  })
})