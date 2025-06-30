import { describe, it, expect, beforeEach } from 'vitest'
import { ActionHandler } from '../../core/augmentation/action-handler.js'
import type { Action, AugmentationContext } from '../../types/augmentation.js'

describe('ActionHandler', () => {
  let handler: ActionHandler

  beforeEach(() => {
    handler = new ActionHandler()
  })

  describe('update_version_in_value', () => {
    it('should update version in YAML artifact path', async () => {
      const action: Action = {
        type: 'update_version_in_value',
        key: 'remote_artifact',
        version_pattern: '(.*-)([0-9]+\\.[0-9]+\\.[0-9]+)(\\.zip)$',
        version_source: 'git_tag',
        comparison: 'greater_than'
      }
      
      const content = `
remote_artifact: s3://bucket/app-1.0.0.zip
other_config: value
`
      const context: AugmentationContext = { gitTag: 'v2.0.0' }
      
      const result = await handler.apply(action, content, 'test.yaml', context)
      
      expect(result.content).toContain('app-2.0.0.zip')
      expect(result.change).toBeDefined()
      expect(result.change?.oldValue).toContain('1.0.0')
      expect(result.change?.newValue).toContain('2.0.0')
    })

    it('should not update when target version is not greater', async () => {
      const action: Action = {
        type: 'update_version_in_value',
        key: 'remote_artifact',
        version_pattern: '(.*-)([0-9]+\\.[0-9]+\\.[0-9]+)(\\.zip)$',
        version_source: 'git_tag',
        comparison: 'greater_than'
      }
      
      const content = `
remote_artifact: s3://bucket/app-3.0.0.zip
`
      const context: AugmentationContext = { gitTag: 'v2.0.0' }
      
      const result = await handler.apply(action, content, 'test.yaml', context)
      
      expect(result.content).toContain('3.0.0')
      expect(result.change).toBeUndefined()
    })

    it('should handle JSON content', async () => {
      const action: Action = {
        type: 'update_version_in_value',
        key: 'image.tag',
        version_pattern: '(v)([0-9]+\\.[0-9]+\\.[0-9]+)$',
        version_source: 'git_tag',
        comparison: 'always'
      }
      
      const content = `{
  "image": {
    "tag": "v1.0.0",
    "repository": "myapp"
  }
}`
      const context: AugmentationContext = { gitTag: 'v2.1.0' }
      
      const result = await handler.apply(action, content, 'config.json', context)
      
      expect(result.content).toContain('"tag": "v2.1.0"')
    })

    it('should handle nested keys', async () => {
      const action: Action = {
        type: 'update_version_in_value',
        key: 'services.api.image',
        version_pattern: '(myapp:)([0-9]+\\.[0-9]+\\.[0-9]+)$',
        version_source: 'git_tag'
      }
      
      const content = `
services:
  api:
    image: myapp:1.0.0
    ports:
      - 3000
`
      const context: AugmentationContext = { gitTag: 'v1.5.0' }
      
      const result = await handler.apply(action, content, 'docker-compose.yaml', context)
      
      expect(result.content).toContain('image: myapp:1.5.0')
    })

    it('should return unchanged content when pattern does not match', async () => {
      const action: Action = {
        type: 'update_version_in_value',
        key: 'remote_artifact',
        version_pattern: '(.*-)([0-9]+\\.[0-9]+\\.[0-9]+)(\\.zip)$',
        version_source: 'git_tag'
      }
      
      const content = `
remote_artifact: s3://bucket/app-latest.tar.gz
`
      const context: AugmentationContext = { gitTag: 'v2.0.0' }
      
      const result = await handler.apply(action, content, 'test.yaml', context)
      
      expect(result.content).toBe(content)
      expect(result.change).toBeUndefined()
    })
  })

  describe('replace_value', () => {
    it('should replace YAML value', async () => {
      const action: Action = {
        type: 'replace_value',
        key: 'environment',
        value: 'production'
      }
      
      const content = `
environment: staging
app_name: myapp
`
      
      const result = await handler.apply(action, content, 'config.yaml', {})
      
      expect(result.content).toContain('environment: production')
      expect(result.change?.oldValue).toBe('staging')
      expect(result.change?.newValue).toBe('production')
    })

    it('should replace JSON value', async () => {
      const action: Action = {
        type: 'replace_value',
        key: 'version',
        value: '2.0.0'
      }
      
      const content = `{
  "name": "test-app",
  "version": "1.0.0"
}`
      
      const result = await handler.apply(action, content, 'package.json', {})
      
      expect(result.content).toContain('"version": "2.0.0"')
    })

    it('should handle nested key replacement', async () => {
      const action: Action = {
        type: 'replace_value',
        key: 'database.host',
        value: 'prod-db.example.com'
      }
      
      const content = `
database:
  host: dev-db.example.com
  port: 5432
`
      
      const result = await handler.apply(action, content, 'config.yaml', {})
      
      expect(result.content).toContain('host: prod-db.example.com')
    })
  })

  describe('set_value', () => {
    it('should set new value when key does not exist', async () => {
      const action: Action = {
        type: 'set_value',
        key: 'new_feature',
        value: true
      }
      
      const content = `
existing_config: value
`
      
      const result = await handler.apply(action, content, 'config.yaml', {})
      
      expect(result.content).toContain('new_feature: true')
      expect(result.change?.oldValue).toBeUndefined()
      expect(result.change?.newValue).toBe(true)
    })

    it('should not override existing value', async () => {
      const action: Action = {
        type: 'set_value',
        key: 'existing_config',
        value: 'new_value'
      }
      
      const content = `
existing_config: original_value
`
      
      const result = await handler.apply(action, content, 'config.yaml', {})
      
      expect(result.content).toContain('original_value')
      expect(result.change).toBeUndefined()
    })
  })

  describe('append_to_array', () => {
    it('should append to existing YAML array', async () => {
      const action: Action = {
        type: 'append_to_array',
        key: 'features',
        value: 'new-feature'
      }
      
      const content = `
features:
  - feature1
  - feature2
`
      
      const result = await handler.apply(action, content, 'config.yaml', {})
      
      expect(result.content).toContain('- new-feature')
      expect(result.change?.newValue).toEqual(['feature1', 'feature2', 'new-feature'])
    })

    it('should create array when key does not exist', async () => {
      const action: Action = {
        type: 'append_to_array',
        key: 'new_array',
        value: 'first-item'
      }
      
      const content = `
existing_config: value
`
      
      const result = await handler.apply(action, content, 'config.yaml', {})
      
      expect(result.content).toContain('new_array:\n  - first-item')
    })

    it('should handle JSON arrays', async () => {
      const action: Action = {
        type: 'append_to_array',
        key: 'dependencies',
        value: 'new-package'
      }
      
      const content = `{
  "dependencies": ["package1", "package2"]
}`
      
      const result = await handler.apply(action, content, 'config.json', {})
      
      expect(result.content).toContain('"new-package"')
    })
  })

  describe('custom', () => {
    it('should return unchanged content for custom actions', async () => {
      const action: Action = {
        type: 'custom',
        script: 'custom logic here'
      }
      
      const content = 'test: value'
      
      const result = await handler.apply(action, content, 'test.yaml', {})
      
      expect(result.content).toBe(content)
      expect(result.change).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle unknown action types gracefully', async () => {
      const action: Action = {
        type: 'unknown_action' as any
      }
      
      const content = 'test: value'
      
      const result = await handler.apply(action, content, 'test.yaml', {})
      
      expect(result.content).toBe(content)
      expect(result.change).toBeUndefined()
    })

    it('should handle malformed content gracefully', async () => {
      const action: Action = {
        type: 'replace_value',
        key: 'test',
        value: 'new_value'
      }
      
      const content = 'invalid content [{'
      
      const result = await handler.apply(action, content, 'test.yaml', {})
      
      expect(result.content).toBe(content)
    })
  })
})