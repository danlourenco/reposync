import { describe, it, expect, beforeEach } from 'vitest'
import { ConditionEvaluator } from '../../core/augmentation/condition-evaluator.js'
import type { Condition, AugmentationContext } from '../../types/augmentation.js'

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator

  beforeEach(() => {
    evaluator = new ConditionEvaluator()
  })

  describe('yaml_has_key', () => {
    it('should return true when key exists in YAML', async () => {
      const condition: Condition = { type: 'yaml_has_key', key: 'remote_artifact' }
      const content = `
remote_artifact: s3://bucket/app-1.0.0.zip
other_key: value
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(true)
    })

    it('should return false when key does not exist in YAML', async () => {
      const condition: Condition = { type: 'yaml_has_key', key: 'missing_key' }
      const content = `
remote_artifact: s3://bucket/app-1.0.0.zip
other_key: value
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(false)
    })

    it('should handle nested keys', async () => {
      const condition: Condition = { type: 'yaml_has_key', key: 'app.config.database' }
      const content = `
app:
  config:
    database:
      host: localhost
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(true)
    })

    it('should return false for invalid YAML', async () => {
      const condition: Condition = { type: 'yaml_has_key', key: 'key' }
      const content = 'invalid: yaml: content: ['
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(false)
    })
  })

  describe('json_has_key', () => {
    it('should return true when key exists in JSON', async () => {
      const condition: Condition = { type: 'json_has_key', key: 'version' }
      const content = `{
  "name": "test-package",
  "version": "1.0.0"
}`
      
      const result = await evaluator.evaluate(condition, content, 'package.json', {})
      expect(result).toBe(true)
    })

    it('should return false when key does not exist in JSON', async () => {
      const condition: Condition = { type: 'json_has_key', key: 'missing' }
      const content = `{
  "name": "test-package",
  "version": "1.0.0"
}`
      
      const result = await evaluator.evaluate(condition, content, 'package.json', {})
      expect(result).toBe(false)
    })

    it('should handle nested JSON keys', async () => {
      const condition: Condition = { type: 'json_has_key', key: 'scripts.build' }
      const content = `{
  "scripts": {
    "build": "npm run build",
    "test": "vitest"
  }
}`
      
      const result = await evaluator.evaluate(condition, content, 'package.json', {})
      expect(result).toBe(true)
    })
  })

  describe('value_matches', () => {
    it('should return true when YAML value matches pattern', async () => {
      const condition: Condition = { 
        type: 'value_matches', 
        key: 'remote_artifact', 
        pattern: '.*-\\d+\\.\\d+\\.\\d+\\.zip$' 
      }
      const content = `
remote_artifact: s3://bucket/app-1.0.0.zip
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(true)
    })

    it('should return false when YAML value does not match pattern', async () => {
      const condition: Condition = { 
        type: 'value_matches', 
        key: 'remote_artifact', 
        pattern: '.*-\\d+\\.\\d+\\.\\d+\\.zip$' 
      }
      const content = `
remote_artifact: s3://bucket/app-latest.zip
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(false)
    })

    it('should return true when JSON value matches pattern', async () => {
      const condition: Condition = { 
        type: 'value_matches', 
        key: 'version', 
        pattern: '^\\d+\\.\\d+\\.\\d+$' 
      }
      const content = `{
  "version": "1.2.3"
}`
      
      const result = await evaluator.evaluate(condition, content, 'package.json', {})
      expect(result).toBe(true)
    })

    it('should handle nested value matching', async () => {
      const condition: Condition = { 
        type: 'value_matches', 
        key: 'app.image.tag', 
        pattern: '^v\\d+\\.\\d+\\.\\d+$' 
      }
      const content = `
app:
  image:
    tag: v1.2.3
    repository: myapp
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(true)
    })

    it('should return false when value is not a string', async () => {
      const condition: Condition = { 
        type: 'value_matches', 
        key: 'count', 
        pattern: '\\d+' 
      }
      const content = `
count: 42
`
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(false)
    })
  })

  describe('file_exists', () => {
    it('should return true for existing file', async () => {
      const condition: Condition = { type: 'file_exists' }
      
      const result = await evaluator.evaluate(condition, '', 'existing-file.yaml', {})
      expect(result).toBe(true)
    })
  })

  describe('custom', () => {
    it('should return false for custom conditions (not implemented)', async () => {
      const condition: Condition = { type: 'custom', script: 'return true' }
      
      const result = await evaluator.evaluate(condition, '', 'test.yaml', {})
      expect(result).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should return false for unknown condition types', async () => {
      const condition: Condition = { type: 'unknown' as any }
      
      const result = await evaluator.evaluate(condition, '', 'test.yaml', {})
      expect(result).toBe(false)
    })

    it('should handle malformed content gracefully', async () => {
      const condition: Condition = { type: 'yaml_has_key', key: 'test' }
      const content = 'completely invalid content [{'
      
      const result = await evaluator.evaluate(condition, content, 'test.yaml', {})
      expect(result).toBe(false)
    })
  })
})