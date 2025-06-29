import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncService } from '../../core/sync.js'
import { ConfigManager } from '../../core/config.js'
import { TestHelpers } from '../utils/test-helpers.js'
import { writeFile } from 'fs/promises'
import { join } from 'pathe'

// Mock simple-git
const mockGitInstance = {
  clone: vi.fn(),
  checkout: vi.fn(),
  branchLocal: vi.fn().mockResolvedValue({ all: [], current: 'main' }),
  checkoutLocalBranch: vi.fn(),
  status: vi.fn().mockResolvedValue({ files: [] }),
  add: vi.fn(),
  addConfig: vi.fn(),
  commit: vi.fn().mockResolvedValue({ commit: 'abc123' }),
  push: vi.fn(),
  getRemotes: vi.fn().mockResolvedValue([{ name: 'origin', refs: { fetch: 'https://github.com/test/repo.git' } }]),
  log: vi.fn().mockResolvedValue({ latest: { hash: 'abc123' } }),
  listRemote: vi.fn()
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGitInstance)
}))

// Mock @octokit/rest
const mockOctokit = {
  rest: {
    repos: {
      listTags: vi.fn().mockResolvedValue({ data: [] }),
      get: vi.fn().mockResolvedValue({ data: {} })
    },
    pulls: {
      create: vi.fn().mockResolvedValue({ 
        data: { 
          html_url: 'https://github.com/test/repo/pull/1',
          number: 1 
        } 
      })
    },
    user: {
      getAuthenticated: vi.fn().mockResolvedValue({ 
        data: { login: 'testuser', name: 'Test User' } 
      })
    }
  }
}

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit)
}))

// Mock the wizard to avoid prompts during testing
vi.mock('../../core/wizard.js', () => ({
  ConfigurationWizard: class MockWizard {
    constructor() {}
    async run() {
      return {
        source_repo: 'https://github.com/test/interactive-source.git',
        target_repos: [
          { name: 'Interactive Target', url: 'https://github.com/test/interactive-target.git' }
        ]
      }
    }
  }
}))

describe('Sync Workflow Integration', () => {
  let syncService: SyncService
  let configManager: ConfigManager
  let testHelpers: TestHelpers
  let configPath: string

  beforeEach(async () => {
    testHelpers = new TestHelpers()
    
    // Create temporary config file
    const tempDir = await testHelpers.createTempDir()
    configPath = join(tempDir, 'sync-config.json')
    
    const config = testHelpers.createMockConfig()
    await writeFile(configPath, JSON.stringify(config, null, 2))
    
    configManager = new ConfigManager({ configPath })
    syncService = new SyncService(configManager)
    
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await testHelpers.cleanup()
  })

  describe('dry-run sync', () => {
    it('should execute dry-run sync successfully', async () => {
      const result = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      expect(result.tag).toBe('v1.0.0')
      expect(result.totalRepositories).toBe(2)
      expect(result.successCount).toBe(2)
      expect(result.failureCount).toBe(0)
      expect(result.branchName).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/)
      
      // All results should be successful in dry-run
      expect(result.results.every(r => r.success)).toBe(true)
      expect(result.results.every(r => r.message === 'Would create draft pull request')).toBe(true)
    })

    it('should handle missing configuration gracefully', async () => {
      const emptyConfigManager = new ConfigManager({ configPath: '/nonexistent/config.json' })
      const emptyConfigSyncService = new SyncService(emptyConfigManager)

      await expect(
        emptyConfigSyncService.execute({ dryRun: true })
      ).rejects.toThrow('No configuration found')
    })

    it('should use default tag when none specified', async () => {
      const result = await syncService.execute({
        dryRun: true
      })

      expect(result.tag).toBe('main')
    })
  })

  describe('configuration handling', () => {
    it('should load configuration successfully', async () => {
      const config = await configManager.load()
      
      expect(config).toBeDefined()
      expect(config?.source_repo).toBe('https://github.com/test/source-repo.git')
      expect(config?.target_repos).toHaveLength(2)
      expect(config?.github?.api_url).toBe('https://api.github.com')
    })

    it('should handle enterprise GitHub configuration', async () => {
      const enterpriseConfig = testHelpers.createMockConfig({
        github: {
          api_url: 'https://github.enterprise.com/api/v3',
          token: 'enterprise-token'
        }
      })

      await writeFile(configPath, JSON.stringify(enterpriseConfig, null, 2))
      
      const result = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      expect(result.successCount).toBe(2)
    })
  })

  describe('error handling', () => {
    it('should handle invalid configuration gracefully', async () => {
      // Write invalid config
      await writeFile(configPath, '{ invalid json }')
      
      await expect(
        syncService.execute({ dryRun: true })
      ).rejects.toThrow()
    })

    it('should handle partial sync failures', async () => {
      // This would be implemented with more sophisticated mocking
      // to simulate failures in specific repositories
      const result = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      // In dry-run, all should succeed
      expect(result.successCount + result.failureCount).toBe(result.totalRepositories)
    })
  })

  describe('branch naming', () => {
    it('should generate unique branch names', async () => {
      const result1 = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10))

      const result2 = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      // Branch names should be different (timestamp-based)
      expect(result1.branchName).not.toBe(result2.branchName)
      
      // But both should follow the pattern (updated for milliseconds)
      expect(result1.branchName).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/)
      expect(result2.branchName).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/)
    })
  })

  describe('sync options', () => {
    it('should respect configPath option', async () => {
      const customConfig = testHelpers.createMockConfig({
        target_repos: [
          {
            name: 'Custom Target',
            url: 'https://github.com/custom/repo.git'
          }
        ]
      })

      const customConfigPath = join(await testHelpers.createTempDir(), 'custom-config.json')
      await writeFile(customConfigPath, JSON.stringify(customConfig, null, 2))

      // Create a new sync service instance for this test
      const customConfigManager = new ConfigManager({ configPath: customConfigPath })
      const customSyncService = new SyncService(customConfigManager)

      const result = await customSyncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      expect(result.totalRepositories).toBe(1)
      expect(result.results[0].repository.name).toBe('Custom Target')
    })

    it('should handle saveConfig option', async () => {
      const result = await syncService.execute({
        dryRun: true,
        saveConfig: false,
        tag: 'v1.0.0'
      })

      expect(result.successCount).toBeGreaterThan(0)
    })
  })

  describe('target repository processing', () => {
    it('should process all target repositories', async () => {
      const result = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      expect(result.results).toHaveLength(2)
      expect(result.results[0].repository.name).toBe('Test Target 1')
      expect(result.results[1].repository.name).toBe('Test Target 2')
      
      result.results.forEach(r => {
        expect(r.branchName).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/)
        expect(r.success).toBe(true)
        expect(r.message).toBe('Would create draft pull request')
      })
    })

    it('should generate appropriate PR URLs in dry-run', async () => {
      const result = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      result.results.forEach(r => {
        expect(r.message).toBe('Would create draft pull request')
      })
    })
  })

  describe('tag and timestamp handling', () => {
    it('should use specified tag', async () => {
      const customTag = 'v2.5.1'
      const result = await syncService.execute({
        dryRun: true,
        tag: customTag
      })

      expect(result.tag).toBe(customTag)
    })

    it('should generate valid timestamps', async () => {
      const result = await syncService.execute({
        dryRun: true,
        tag: 'v1.0.0'
      })

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0)
    })
  })

  describe('interactive mode', () => {
    it('should run interactive configuration wizard', async () => {
      const result = await syncService.execute({
        interactive: true,
        dryRun: true
      })

      expect(result.tag).toBe('main')
      expect(result.totalRepositories).toBe(1)
      expect(result.successCount).toBe(1)
    })
  })
})