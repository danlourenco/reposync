import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AugmentationEngine } from '../../core/augmentation/augmentation-engine.js'
import type { AugmentationRule, AugmentationContext } from '../../types/augmentation.js'

describe('AugmentationEngine', () => {
  let engine: AugmentationEngine
  
  beforeEach(() => {
    engine = new AugmentationEngine()
  })

  describe('processFile', () => {
    it('should return unchanged content when no rules apply', async () => {
      const content = 'test: value'
      const result = await engine.processFile('test.yaml', content)
      
      expect(result.changed).toBe(false)
      expect(result.newContent).toBe(content)
      expect(result.appliedRules).toEqual([])
      expect(result.changes).toEqual([])
    })

    it('should apply version update rule for config.yml', async () => {
      // Mock the rule loader to return our test rule
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Update config.yml version',
        target_files: ['config.yml'],
        conditions: [
          { type: 'yaml_has_key', key: 'remote_artifact' },
          { type: 'value_matches', key: 'remote_artifact', pattern: '.*-\\d+\\.\\d+\\.\\d+\\.zip$' }
        ],
        actions: [
          {
            type: 'update_version_in_value',
            key: 'remote_artifact',
            version_pattern: '(.*-)([0-9]+\\.[0-9]+\\.[0-9]+)(\\.zip)$',
            version_source: 'git_tag',
            comparison: 'greater_than'
          }
        ]
      }])

      const content = `
remote_artifact: s3://bucket/app-1.0.0.zip
other_config: value
`
      const context: AugmentationContext = { gitTag: 'v2.0.0' }
      
      const result = await engine.processFile('config.yml', content, context)
      
      expect(result.changed).toBe(true)
      expect(result.newContent).toContain('app-2.0.0.zip')
      expect(result.appliedRules).toContain('Update config.yml version')
      expect(result.changes).toHaveLength(1)
      expect(result.changes[0].oldValue).toContain('1.0.0')
      expect(result.changes[0].newValue).toContain('2.0.0')
    })

    it('should not update version when current version is greater', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Update config.yml version',
        target_files: ['config.yml'],
        conditions: [
          { type: 'yaml_has_key', key: 'remote_artifact' }
        ],
        actions: [
          {
            type: 'update_version_in_value',
            key: 'remote_artifact',
            version_pattern: '(.*-)([0-9]+\\.[0-9]+\\.[0-9]+)(\\.zip)$',
            version_source: 'git_tag',
            comparison: 'greater_than'
          }
        ]
      }])

      const content = `
remote_artifact: s3://bucket/app-3.0.0.zip
`
      const context: AugmentationContext = { gitTag: 'v2.0.0' }
      
      const result = await engine.processFile('config.yml', content, context)
      
      expect(result.changed).toBe(false)
      expect(result.newContent).toContain('3.0.0')
    })

    it('should handle multiple conditions with AND logic', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Multi-condition rule',
        target_files: ['test.yaml'],
        conditions: [
          { type: 'yaml_has_key', key: 'app' },
          { type: 'yaml_has_key', key: 'version' }
        ],
        actions: [
          { type: 'set_value', key: 'updated', value: true }
        ]
      }])

      const content = `
app: myapp
version: 1.0.0
`
      
      const result = await engine.processFile('test.yaml', content)
      
      expect(result.changed).toBe(true)
      expect(result.newContent).toContain('updated: true')
    })

    it('should fail when any condition fails', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Multi-condition rule',
        target_files: ['test.yaml'],
        conditions: [
          { type: 'yaml_has_key', key: 'app' },
          { type: 'yaml_has_key', key: 'missing_key' }
        ],
        actions: [
          { type: 'set_value', key: 'updated', value: true }
        ]
      }])

      const content = `
app: myapp
version: 1.0.0
`
      
      const result = await engine.processFile('test.yaml', content)
      
      expect(result.changed).toBe(false)
    })

    it('should handle JSON files', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'JSON update rule',
        target_files: ['package.json'],
        conditions: [
          { type: 'json_has_key', key: 'version' }
        ],
        actions: [
          { type: 'replace_value', key: 'version', value: '2.0.0' }
        ]
      }])

      const content = `{
  "name": "test-package",
  "version": "1.0.0"
}`
      
      const result = await engine.processFile('package.json', content)
      
      expect(result.changed).toBe(true)
      expect(result.newContent).toContain('"version": "2.0.0"')
    })

    it('should handle nested object keys', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Nested key rule',
        target_files: ['config.yaml'],
        conditions: [
          { type: 'yaml_has_key', key: 'app.config.database' }
        ],
        actions: [
          { type: 'replace_value', key: 'app.config.database.host', value: 'new-host' }
        ]
      }])

      const content = `
app:
  config:
    database:
      host: old-host
      port: 5432
`
      
      const result = await engine.processFile('config.yaml', content)
      
      expect(result.changed).toBe(true)
      expect(result.newContent).toContain('host: new-host')
    })

    it('should append to arrays', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Array append rule',
        target_files: ['config.yaml'],
        conditions: [
          { type: 'yaml_has_key', key: 'features' }
        ],
        actions: [
          { type: 'append_to_array', key: 'features', value: 'new-feature' }
        ]
      }])

      const content = `
features:
  - feature1
  - feature2
`
      
      const result = await engine.processFile('config.yaml', content)
      
      expect(result.changed).toBe(true)
      expect(result.newContent).toContain('- new-feature')
    })
  })

  describe('previewChanges', () => {
    it('should preview changes without modifying original content', async () => {
      vi.spyOn(engine as any, 'getApplicableRules').mockReturnValue([{
        name: 'Preview rule',
        target_files: ['test.yaml'],
        conditions: [],
        actions: [
          { type: 'set_value', key: 'preview', value: true }
        ]
      }])

      const content = 'existing: value'
      
      const result = await engine.previewChanges('test.yaml', content)
      
      expect(result.changed).toBe(true)
      expect(result.newContent).toContain('preview: true')
      expect(result.originalContent).toBe(content)
    })
  })

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      await expect(engine.initialize()).resolves.not.toThrow()
    })

    it('should reload rules', async () => {
      await expect(engine.reload()).resolves.not.toThrow()
    })
  })
})