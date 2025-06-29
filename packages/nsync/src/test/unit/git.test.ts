import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GitService } from '../../core/git.js'
import { TestHelpers } from '../utils/test-helpers.js'
import { RepoSyncError } from '../../core/types.js'

// Mock simple-git
const mockGitInstance = {
  clone: vi.fn(),
  checkout: vi.fn(),
  branchLocal: vi.fn(),
  checkoutLocalBranch: vi.fn(),
  status: vi.fn(),
  add: vi.fn(),
  addConfig: vi.fn(),
  commit: vi.fn(),
  push: vi.fn(),
  getRemotes: vi.fn(),
  log: vi.fn(),
  listRemote: vi.fn()
}

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockGitInstance)
}))

describe('GitService', () => {
  let gitService: GitService
  let testHelpers: TestHelpers

  beforeEach(() => {
    testHelpers = new TestHelpers()
    gitService = new GitService()
    
    // Reset all mocks
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await testHelpers.cleanup()
  })

  describe('generateBranchName', () => {
    it('should generate a timestamped branch name', () => {
      const branchName = gitService.generateBranchName()
      
      expect(branchName).toMatch(/^release\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/)
    })

    it('should allow custom prefix', () => {
      const branchName = gitService.generateBranchName('hotfix')
      
      expect(branchName).toMatch(/^hotfix\/\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/)
    })
  })

  describe('createTempDirectory', () => {
    it('should create a temporary directory', async () => {
      const tempDir = await gitService.createTempDirectory()
      
      expect(tempDir).toMatch(/nsync-/)
      expect(tempDir).toContain('nsync-')
    })

    it('should allow custom prefix', async () => {
      const tempDir = await gitService.createTempDirectory('custom-')
      
      expect(tempDir).toMatch(/custom-/)
    })
  })

  describe('validateRepositoryAccess', () => {
    it('should return true for accessible repository', async () => {
      mockGitInstance.listRemote.mockResolvedValue('')

      const result = await gitService.validateRepositoryAccess('https://github.com/test/repo.git')
      
      expect(result).toBe(true)
      expect(mockGitInstance.listRemote).toHaveBeenCalledWith(['--heads', 'https://github.com/test/repo.git'])
    })

    it('should return false for inaccessible repository', async () => {
      mockGitInstance.listRemote.mockRejectedValue(new Error('Repository not found'))

      const result = await gitService.validateRepositoryAccess('https://github.com/test/nonexistent.git')
      
      expect(result).toBe(false)
    })
  })

  describe('cloneRepository', () => {
    it('should clone repository successfully', async () => {
      mockGitInstance.clone.mockResolvedValue(undefined as any)

      const targetDir = await testHelpers.createTempDir()
      
      const result = await gitService.cloneRepository({
        url: 'https://github.com/test/repo.git',
        targetDir
      })

      expect(result).toBe(targetDir)
      expect(mockGitInstance.clone).toHaveBeenCalledWith(
        'https://github.com/test/repo.git',
        targetDir,
        []
      )
    })

    it('should clone repository with branch', async () => {
      mockGitInstance.clone.mockResolvedValue(undefined as any)

      const targetDir = await testHelpers.createTempDir()
      
      await gitService.cloneRepository({
        url: 'https://github.com/test/repo.git',
        branch: 'develop',
        targetDir
      })

      expect(mockGitInstance.clone).toHaveBeenCalledWith(
        'https://github.com/test/repo.git',
        targetDir,
        ['--branch', 'develop']
      )
    })

    it('should clone repository with tag', async () => {
      mockGitInstance.clone.mockResolvedValue(undefined as any)
      mockGitInstance.checkout.mockResolvedValue(undefined as any)

      const targetDir = await testHelpers.createTempDir()
      
      await gitService.cloneRepository({
        url: 'https://github.com/test/repo.git',
        tag: 'v1.0.0',
        targetDir
      })

      expect(mockGitInstance.clone).toHaveBeenCalledWith(
        'https://github.com/test/repo.git',
        targetDir,
        ['--branch', 'v1.0.0']
      )
      expect(mockGitInstance.checkout).toHaveBeenCalledWith('v1.0.0')
    })

    it('should throw RepoSyncError on clone failure', async () => {
      mockGitInstance.clone.mockRejectedValue(new Error('Clone failed'))

      const targetDir = await testHelpers.createTempDir()
      
      await expect(
        gitService.cloneRepository({
          url: 'https://github.com/test/repo.git',
          targetDir
        })
      ).rejects.toThrow(RepoSyncError)
    })
  })

  describe('createBranch', () => {
    it('should create new branch successfully', async () => {
      mockGitInstance.branchLocal.mockResolvedValue({ all: [] } as any)
      mockGitInstance.checkoutLocalBranch.mockResolvedValue(undefined as any)

      const repoPath = await testHelpers.createTempDir()
      
      await gitService.createBranch(repoPath, 'feature/test')

      expect(mockGitInstance.branchLocal).toHaveBeenCalled()
      expect(mockGitInstance.checkoutLocalBranch).toHaveBeenCalledWith('feature/test')
    })

    it('should throw error if branch already exists', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      vi.mocked(mockGit.branchLocal).mockResolvedValue({ 
        all: ['feature/test'] 
      } as any)

      const repoPath = await testHelpers.createTempDir()
      
      await expect(
        gitService.createBranch(repoPath, 'feature/test')
      ).rejects.toThrow(RepoSyncError)
    })
  })

  describe('commitChanges', () => {
    it('should commit changes successfully', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      vi.mocked(mockGit.status).mockResolvedValue({ files: [{ path: 'test.txt' }] } as any)
      vi.mocked(mockGit.add).mockResolvedValue(undefined as any)
      vi.mocked(mockGit.addConfig).mockResolvedValue(undefined as any)
      vi.mocked(mockGit.commit).mockResolvedValue({ commit: 'abc123' } as any)

      const repoPath = await testHelpers.createTempDir()
      
      const result = await gitService.commitChanges(repoPath, {
        message: 'Test commit',
        author: { name: 'Test User', email: 'test@example.com' }
      })

      expect(result).toBe('abc123')
      expect(mockGit.status).toHaveBeenCalled()
      expect(mockGit.add).toHaveBeenCalledWith('.')
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.name', 'Test User')
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.email', 'test@example.com')
      expect(mockGit.commit).toHaveBeenCalledWith('Test commit')
    })

    it('should return "No changes" when no files to commit', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      vi.mocked(mockGit.status).mockResolvedValue({ files: [] } as any)

      const repoPath = await testHelpers.createTempDir()
      
      const result = await gitService.commitChanges(repoPath, {
        message: 'Test commit'
      })

      expect(result).toBe('No changes')
      expect(mockGit.add).not.toHaveBeenCalled()
      expect(mockGit.commit).not.toHaveBeenCalled()
    })
  })

  describe('pushBranch', () => {
    it('should push branch successfully', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      vi.mocked(mockGit.push).mockResolvedValue(undefined as any)

      const repoPath = await testHelpers.createTempDir()
      
      await gitService.pushBranch(repoPath, 'feature/test')

      expect(mockGit.push).toHaveBeenCalledWith(['-u', 'origin', 'feature/test'])
    })

    it('should push to custom remote', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      vi.mocked(mockGit.push).mockResolvedValue(undefined as any)

      const repoPath = await testHelpers.createTempDir()
      
      await gitService.pushBranch(repoPath, 'feature/test', 'upstream')

      expect(mockGit.push).toHaveBeenCalledWith(['-u', 'upstream', 'feature/test'])
    })

    it('should throw RepoSyncError on push failure', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      vi.mocked(mockGit.push).mockRejectedValue(new Error('Push failed'))

      const repoPath = await testHelpers.createTempDir()
      
      await expect(
        gitService.pushBranch(repoPath, 'feature/test')
      ).rejects.toThrow(RepoSyncError)
    })
  })

  describe('getRepositoryInfo', () => {
    it('should return repository information', async () => {
      const { simpleGit } = await import('simple-git')
      const mockGit = simpleGit()
      
      vi.mocked(mockGit.status).mockResolvedValue({ current: 'main' } as any)
      vi.mocked(mockGit.getRemotes).mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/test/repo.git' } }
      ] as any)
      vi.mocked(mockGit.log).mockResolvedValue({ 
        latest: { hash: 'abc123' } 
      } as any)

      const repoPath = await testHelpers.createTempDir()
      
      const info = await gitService.getRepositoryInfo(repoPath)

      expect(info).toEqual({
        currentBranch: 'main',
        remoteUrl: 'https://github.com/test/repo.git',
        lastCommit: 'abc123'
      })
    })
  })
})