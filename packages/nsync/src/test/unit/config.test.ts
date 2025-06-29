import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigManager } from '../../core/config.js'
import { TestHelpers } from '../utils/test-helpers.js'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'pathe'
import { existsSync } from 'fs'

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let testHelpers: TestHelpers
  let configPath: string

  beforeEach(async () => {
    testHelpers = new TestHelpers()
    const tempDir = await testHelpers.createTempDir()
    configPath = join(tempDir, 'test-config.json')
    configManager = new ConfigManager({ configPath })
  })

  afterEach(async () => {
    await testHelpers.cleanup()
  })

  describe('load', () => {
    it('should load valid configuration', async () => {
      const mockConfig = testHelpers.createMockConfig()
      await writeFile(configPath, JSON.stringify(mockConfig, null, 2))

      const config = await configManager.load()

      expect(config).toEqual(mockConfig)
    })

    it('should return null for non-existent config', async () => {
      // Use a path that definitely doesn't exist
      const nonExistentConfigManager = new ConfigManager({ configPath: '/definitely/nonexistent/path/config.json' })
      const config = await nonExistentConfigManager.load()
      expect(config).toBeNull()
    })

    it('should throw error for invalid JSON', async () => {
      await writeFile(configPath, '{ invalid json }')

      await expect(configManager.load()).rejects.toThrow()
    })

    it('should validate config schema', async () => {
      const invalidConfig = {
        source_repo: 'not-a-url',
        target_repos: []
      }
      await writeFile(configPath, JSON.stringify(invalidConfig, null, 2))

      await expect(configManager.load()).rejects.toThrow('Configuration validation failed')
    })

    it('should handle missing target repos', async () => {
      const invalidConfig = {
        source_repo: 'https://github.com/test/source.git',
        target_repos: []
      }
      await writeFile(configPath, JSON.stringify(invalidConfig, null, 2))

      await expect(configManager.load()).rejects.toThrow()
    })

    it('should validate target repo structure', async () => {
      const invalidConfig = {
        source_repo: 'https://github.com/test/source.git',
        target_repos: [
          {
            name: '',
            url: 'not-a-url'
          }
        ]
      }
      await writeFile(configPath, JSON.stringify(invalidConfig, null, 2))

      await expect(configManager.load()).rejects.toThrow()
    })
  })

  describe('save', () => {
    it('should save valid configuration', async () => {
      const mockConfig = testHelpers.createMockConfig()

      await configManager.save(mockConfig)

      expect(existsSync(configPath)).toBe(true)

      const savedContent = await readFile(configPath, 'utf-8')
      const savedConfig = JSON.parse(savedContent)
      expect(savedConfig).toEqual(mockConfig)
    })

    it('should validate before saving', async () => {
      const invalidConfig = {
        source_repo: 'not-a-url',
        target_repos: []
      } as any

      await expect(configManager.save(invalidConfig)).rejects.toThrow()
    })

    it('should format JSON nicely', async () => {
      const mockConfig = testHelpers.createMockConfig()
      await configManager.save(mockConfig)

      const savedContent = await readFile(configPath, 'utf-8')
      
      // Should be formatted with indentation
      expect(savedContent).toContain('  "source_repo"')
      expect(savedContent).toContain('    "name"')
    })
  })

  describe('merge', () => {
    it('should merge configurations', async () => {
      const existingConfig = testHelpers.createMockConfig()
      await writeFile(configPath, JSON.stringify(existingConfig, null, 2))

      const updates = {
        target_repos: [
          {
            name: 'New Target',
            url: 'https://github.com/test/new-target.git'
          }
        ]
      }

      const merged = await configManager.merge(updates)

      expect(merged.source_repo).toBe(existingConfig.source_repo)
      expect(merged.target_repos).toEqual(updates.target_repos)
      expect(merged.github).toEqual(existingConfig.github)
    })

    it('should merge with empty existing config', async () => {
      // Create a separate config manager for empty config test
      const emptyConfigPath = join(await testHelpers.createTempDir(), 'empty-config.json')
      const emptyConfigManager = new ConfigManager({ configPath: emptyConfigPath })
      
      const updates = testHelpers.createMockConfig()
      const merged = await emptyConfigManager.merge(updates)

      expect(merged).toEqual(updates)
    })

    it('should validate merged result', async () => {
      const existingConfig = testHelpers.createMockConfig()
      await writeFile(configPath, JSON.stringify(existingConfig, null, 2))

      const invalidUpdates = {
        source_repo: 'not-a-valid-url',
        target_repos: []
      }

      await expect(configManager.merge(invalidUpdates)).rejects.toThrow('Merged configuration is invalid')
    })
  })

  describe('getConfigPath', () => {
    it('should return current config path', () => {
      expect(configManager.getConfigPath()).toBe(configPath)
    })
  })

  describe('setConfigPath', () => {
    it('should update config path', () => {
      const newPath = '/new/path/config.json'
      configManager.setConfigPath(newPath)
      
      expect(configManager.getConfigPath()).toBe(newPath)
    })

    it('should resolve relative paths', () => {
      configManager.setConfigPath('./relative-config.json')
      
      expect(configManager.getConfigPath()).toMatch(/.*relative-config\.json$/)
    })
  })

  describe('enterprise GitHub configuration', () => {
    it('should handle enterprise GitHub config', async () => {
      const enterpriseConfig = testHelpers.createMockConfig({
        github: {
          api_url: 'https://github.enterprise.com/api/v3',
          token: 'enterprise-token'
        }
      })

      await configManager.save(enterpriseConfig)
      const loaded = await configManager.load()

      expect(loaded?.github?.api_url).toBe('https://github.enterprise.com/api/v3')
      expect(loaded?.github?.token).toBe('enterprise-token')
    })

    it('should validate enterprise GitHub URLs', async () => {
      const invalidEnterpriseConfig = testHelpers.createMockConfig({
        github: {
          api_url: 'not-a-url',
          token: 'valid-token'
        }
      })

      await expect(configManager.save(invalidEnterpriseConfig)).rejects.toThrow()
    })

    it('should allow optional GitHub config', async () => {
      const configWithoutGitHub = {
        source_repo: 'https://github.com/test/source.git',
        target_repos: [
          {
            name: 'Target',
            url: 'https://github.com/test/target.git'
          }
        ]
      }

      await configManager.save(configWithoutGitHub)
      const loaded = await configManager.load()

      expect(loaded?.github).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Try to save to a non-existent directory
      const invalidPath = '/nonexistent/directory/config.json'
      const invalidConfigManager = new ConfigManager({ configPath: invalidPath })
      const mockConfig = testHelpers.createMockConfig()

      await expect(invalidConfigManager.save(mockConfig)).rejects.toThrow()
    })

    it('should provide helpful error messages', async () => {
      const invalidConfig = {
        source_repo: 'https://github.com/test/source.git',
        target_repos: [
          {
            name: '',
            url: 'https://github.com/test/target.git'
          }
        ]
      }
      await writeFile(configPath, JSON.stringify(invalidConfig, null, 2))

      try {
        await configManager.load()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).toContain('Configuration validation failed')
      }
    })
  })
})