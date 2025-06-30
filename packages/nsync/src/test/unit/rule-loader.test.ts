import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { RuleLoader } from '../../core/augmentation/rule-loader.js'
import { existsSync } from 'fs'
import { homedir } from 'os'

// Mock fs and os modules
vi.mock('fs', () => ({
  existsSync: vi.fn()
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user')
}))

// Mock c12 loadConfig
vi.mock('c12', () => ({
  loadConfig: vi.fn()
}))

const mockExistsSync = vi.mocked(existsSync)
const mockLoadConfig = vi.mocked((await import('c12')).loadConfig)

describe('RuleLoader', () => {
  let ruleLoader: RuleLoader

  beforeEach(() => {
    ruleLoader = new RuleLoader()
    vi.clearAllMocks()
    // Reset the loader's internal state
    ruleLoader.reset()
  })

  afterEach(() => {
    delete process.env.REPOSYNC_RULES_PATH
  })

  describe('loadRules', () => {
    it('should return empty array when no config files exist', async () => {
      mockExistsSync.mockReturnValue(false)
      mockLoadConfig.mockResolvedValue({ config: {} })

      const rules = await ruleLoader.loadRules()

      expect(rules).toEqual([])
    })

    it('should load rules from global config', async () => {
      const globalRules = [
        {
          name: 'Global Rule',
          target_files: ['*.yaml'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockImplementation((path) => 
        path === '/home/user/.reposync/rules.yaml'
      )
      
      mockLoadConfig
        .mockResolvedValueOnce({
          config: {
            file_augmentation: {
              rules: globalRules
            }
          }
        })
        .mockResolvedValue({ config: {} })

      const rules = await ruleLoader.loadRules()

      expect(rules).toEqual(globalRules)
    })

    it('should load rules from project config', async () => {
      const projectRules = [
        {
          name: 'Project Rule',
          target_files: ['config.yml'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockImplementation((path) => 
        path === './.reposync/rules.yaml'
      )
      
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValueOnce({ config: {} })
        .mockResolvedValueOnce({
          config: {
            file_augmentation: {
              rules: projectRules
            }
          }
        })
        .mockResolvedValue({ config: {} })

      const rules = await ruleLoader.loadRules()

      expect(rules).toEqual(projectRules)
    })

    it('should load rules from environment variable path', async () => {
      process.env.REPOSYNC_RULES_PATH = '/custom/rules.yaml'
      
      const envRules = [
        {
          name: 'Env Rule',
          target_files: ['*.json'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockImplementation((path) => 
        path === '/custom/rules.yaml'
      )
      
      // Reset mock and setup for this specific test
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValueOnce({ config: {} }) // main config (no rcFile check)
        .mockResolvedValueOnce({              // env path
          config: {
            file_augmentation: {
              rules: envRules
            }
          }
        })

      const rules = await ruleLoader.loadRules()
      
      expect(rules).toEqual(envRules)
    })

    it('should merge rules from multiple sources', async () => {
      const globalRules = [
        {
          name: 'Global Rule',
          target_files: ['*.yaml'],
          conditions: [],
          actions: []
        }
      ]

      const projectRules = [
        {
          name: 'Project Rule',
          target_files: ['config.yml'],
          conditions: [],
          actions: []
        }
      ]

      const envRules = [
        {
          name: 'Env Rule',
          target_files: ['*.json'],
          conditions: [],
          actions: []
        }
      ]

      process.env.REPOSYNC_RULES_PATH = '/custom/rules.yaml'
      
      // Mock to return true for all the paths that will be checked
      mockExistsSync.mockImplementation((path) => {
        return path.includes('.reposync/rules.yaml') || path === '/custom/rules.yaml'
      })
      
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValueOnce({
          config: { file_augmentation: { rules: globalRules } }
        })  // global config
        .mockResolvedValueOnce({
          config: { file_augmentation: { rules: projectRules } }
        })  // project config
        .mockResolvedValueOnce({ config: {} })  // main config
        .mockResolvedValueOnce({
          config: { file_augmentation: { rules: envRules } }
        })  // env config

      const rules = await ruleLoader.loadRules()

      // Should have all rules from all sources
      expect(rules).toHaveLength(3)
      expect(rules.map(r => r.name)).toEqual(['Global Rule', 'Project Rule', 'Env Rule'])
      
      delete process.env.REPOSYNC_RULES_PATH
    })

    it('should filter out disabled rules', async () => {
      const rules = [
        {
          name: 'Enabled Rule',
          enabled: true,
          target_files: ['*.yaml'],
          conditions: [],
          actions: []
        },
        {
          name: 'Disabled Rule',
          enabled: false,
          target_files: ['*.json'],
          conditions: [],
          actions: []
        },
        {
          name: 'Default Enabled Rule',
          target_files: ['*.txt'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockReturnValue(false)
      
      // Only main config will be called since existsSync returns false
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValueOnce({
          config: { file_augmentation: { rules } }
        })  // main config with the rules

      const loadedRules = await ruleLoader.loadRules()

      expect(loadedRules).toHaveLength(2)
      expect(loadedRules.map(r => r.name)).toEqual(['Enabled Rule', 'Default Enabled Rule'])
    })

    it('should cache loaded rules on subsequent calls', async () => {
      const rules = [
        {
          name: 'Test Rule',
          target_files: ['*.yaml'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockReturnValue(false)
      
      // Only main config will be called since existsSync returns false
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValueOnce({
          config: { file_augmentation: { rules } }
        })  // main config

      // First call
      const firstLoad = await ruleLoader.loadRules()
      
      // Second call (should use cache)
      const secondLoad = await ruleLoader.loadRules()

      expect(firstLoad).toEqual(secondLoad)
      // loadConfig should be called 1 time (only main config, on first load)
      expect(mockLoadConfig).toHaveBeenCalledTimes(1)
    })

    it('should handle load errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true)
      mockLoadConfig.mockReset()
      mockLoadConfig.mockRejectedValue(new Error('Load failed'))

      const rules = await ruleLoader.loadRules()

      expect(rules).toEqual([])
    })
  })

  describe('getRulesByFile', () => {
    beforeEach(async () => {
      const rules = [
        {
          name: 'YAML Rule',
          target_files: ['*.yaml', '*.yml'],
          conditions: [],
          actions: []
        },
        {
          name: 'Config Rule',
          target_files: ['config.yml', 'config.yml.*'],
          conditions: [],
          actions: []
        },
        {
          name: 'JSON Rule',
          target_files: ['package.json'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockReturnValue(false)
      
      // Only main config will be called since existsSync returns false
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValueOnce({
          config: { file_augmentation: { rules } }
        })  // main config with rules

      await ruleLoader.loadRules()
    })

    it('should return matching rules for YAML files', () => {
      const rules = ruleLoader.getRulesByFile('config.yaml')
      expect(rules).toHaveLength(1)
      expect(rules[0].name).toBe('YAML Rule')
    })

    it('should return matching rules for config.yml', () => {
      const rules = ruleLoader.getRulesByFile('config.yml')
      expect(rules).toHaveLength(2) // Both YAML Rule and Config Rule match
      expect(rules.map(r => r.name)).toContain('YAML Rule')
      expect(rules.map(r => r.name)).toContain('Config Rule')
    })

    it('should return matching rules for config.yml variants', () => {
      const rules = ruleLoader.getRulesByFile('config.yml.yaml')
      expect(rules).toHaveLength(2) // Both YAML and config.yml rules
      expect(rules.map(r => r.name)).toContain('YAML Rule')
      expect(rules.map(r => r.name)).toContain('Config Rule')
    })

    it('should return no rules for non-matching files', () => {
      const rules = ruleLoader.getRulesByFile('README.md')
      expect(rules).toHaveLength(0)
    })
  })

  describe('reset', () => {
    it('should clear loaded rules and allow reloading', async () => {
      const rules = [
        {
          name: 'Test Rule',
          target_files: ['*.yaml'],
          conditions: [],
          actions: []
        }
      ]

      mockExistsSync.mockReturnValue(false)
      mockLoadConfig.mockReset()
      mockLoadConfig
        .mockResolvedValue({
          config: { file_augmentation: { rules } }
        })  // main config (used for both calls)

      // Load rules
      await ruleLoader.loadRules()
      expect(ruleLoader.getRules()).toEqual(rules)

      // Reset
      ruleLoader.reset()
      expect(ruleLoader.getRules()).toEqual([])

      // Load again
      await ruleLoader.loadRules()
      expect(ruleLoader.getRules()).toEqual(rules)
    })
  })
})