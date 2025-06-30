import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GitHubService } from '../../core/github.js'
import { TestHelpers } from '../utils/test-helpers.js'
import { RepoSyncError } from '../../core/types.js'

// Mock @octokit/rest
const mockOctokit = {
  rest: {
    repos: {
      listTags: vi.fn(),
      get: vi.fn(),
      getCommit: vi.fn()
    },
    pulls: {
      create: vi.fn()
    },
    users: {
      getAuthenticated: vi.fn()
    }
  }
}

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit)
}))

describe('GitHubService', () => {
  let githubService: GitHubService
  let testHelpers: TestHelpers

  beforeEach(() => {
    testHelpers = new TestHelpers()
    githubService = new GitHubService({ token: 'test-token' })
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default GitHub API URL', () => {
      const service = new GitHubService()
      expect(service).toBeInstanceOf(GitHubService)
    })

    it('should initialize with enterprise GitHub URL', () => {
      const service = new GitHubService({
        baseUrl: 'https://github.enterprise.com'
      })
      expect(service).toBeInstanceOf(GitHubService)
    })

    it('should add /api/v3 to enterprise URL if missing', () => {
      const service = new GitHubService({
        baseUrl: 'https://github.enterprise.com'
      })
      expect(service).toBeInstanceOf(GitHubService)
    })
  })

  describe('parseRepositoryUrl', () => {
    it('should parse HTTPS GitHub URL', () => {
      const result = githubService.parseRepositoryUrl('https://github.com/owner/repo.git')
      
      expect(result).toEqual({
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo'
      })
    })

    it('should parse HTTPS URL without .git suffix', () => {
      const result = githubService.parseRepositoryUrl('https://github.com/owner/repo')
      
      expect(result).toEqual({
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo'
      })
    })

    it('should parse SSH GitHub URL', () => {
      const result = githubService.parseRepositoryUrl('git@github.com:owner/repo.git')
      
      expect(result).toEqual({
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo'
      })
    })

    it('should parse enterprise SSH URL', () => {
      const result = githubService.parseRepositoryUrl('git@github.enterprise.com:owner/repo.git')
      
      expect(result).toEqual({
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo'
      })
    })

    it('should parse enterprise HTTPS URL', () => {
      const result = githubService.parseRepositoryUrl('https://github.enterprise.com/owner/repo.git')
      
      expect(result).toEqual({
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo'
      })
    })

    it('should throw RepoSyncError for invalid URL', () => {
      expect(() => {
        githubService.parseRepositoryUrl('invalid-url')
      }).toThrow(RepoSyncError)
    })

    it('should throw RepoSyncError for incomplete path', () => {
      expect(() => {
        githubService.parseRepositoryUrl('https://github.com/owner')
      }).toThrow(RepoSyncError)
    })
  })

  describe('fetchTags', () => {
    it('should fetch tags successfully', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.repos.listTags.mockResolvedValue({
        data: mockResponse.tags
      })

      const result = await githubService.fetchTags('https://github.com/owner/repo.git')
      
      expect(result).toEqual([
        { name: 'v2.1.0', commit: 'abc123', date: 'unknown' },
        { name: 'v2.0.0', commit: 'def456', date: 'unknown' },
        { name: 'v1.9.0', commit: 'ghi789', date: 'unknown' }
      ])
      expect(mockOctokit.rest.repos.listTags).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 20
      })
    })

    it('should fetch limited number of tags', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.repos.listTags.mockResolvedValue({
        data: mockResponse.tags
      })

      await githubService.fetchTags('https://github.com/owner/repo.git', 5)
      
      expect(mockOctokit.rest.repos.listTags).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 5
      })
    })

    it('should throw RepoSyncError on API failure', async () => {
      mockOctokit.rest.repos.listTags.mockRejectedValue(new Error('API Error'))

      await expect(
        githubService.fetchTags('https://github.com/owner/repo.git')
      ).rejects.toThrow(RepoSyncError)
    })
  })

  describe('fetchTagsWithDates', () => {
    it('should fetch tags with commit dates', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.repos.listTags.mockResolvedValue({
        data: mockResponse.tags
      })
      mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: {
          commit: {
            author: { date: '2023-12-01T10:00:00Z' }
          }
        }
      })

      const result = await githubService.fetchTagsWithDates('https://github.com/owner/repo.git')
      
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({
        name: 'v2.1.0',
        commit: 'abc123',
        date: '2023-12-01T10:00:00Z'
      })
      expect(mockOctokit.rest.repos.getCommit).toHaveBeenCalledTimes(3)
    })

    it('should handle commit fetch failures gracefully', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.repos.listTags.mockResolvedValue({
        data: [mockResponse.tags[0]]
      })
      mockOctokit.rest.repos.getCommit.mockRejectedValue(new Error('Commit not found'))

      const result = await githubService.fetchTagsWithDates('https://github.com/owner/repo.git')
      
      expect(result).toEqual([
        { name: 'v2.1.0', commit: 'abc123', date: 'unknown' }
      ])
    })
  })

  describe('createPullRequest', () => {
    it('should create pull request successfully', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: mockResponse.pullRequest
      })

      const result = await githubService.createPullRequest({
        owner: 'owner',
        repo: 'repo',
        title: 'Test PR',
        body: 'Test description',
        head: 'feature/test',
        base: 'main'
      })
      
      expect(result).toEqual({
        url: 'https://github.com/test/repo/pull/42',
        number: 42
      })
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: 'Test PR',
        body: 'Test description',
        head: 'feature/test',
        base: 'main',
        draft: true
      })
    })

    it('should create draft PR by default', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.pulls.create.mockResolvedValue({
        data: mockResponse.pullRequest
      })

      await githubService.createPullRequest({
        owner: 'owner',
        repo: 'repo',
        title: 'Test PR',
        body: 'Test description',
        head: 'feature/test'
      })
      
      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: true,
          base: 'main'
        })
      )
    })

    it('should throw RepoSyncError on PR creation failure', async () => {
      mockOctokit.rest.pulls.create.mockRejectedValue(new Error('PR creation failed'))

      await expect(
        githubService.createPullRequest({
          owner: 'owner',
          repo: 'repo',
          title: 'Test PR',
          body: 'Test description',
          head: 'feature/test'
        })
      ).rejects.toThrow(RepoSyncError)
    })
  })

  describe('generatePRDescription', () => {
    it('should generate comprehensive PR description', () => {
      const description = githubService.generatePRDescription({
        sourceRepo: 'https://github.com/source/repo.git',
        sourceTag: 'v1.2.3',
        branchName: 'release/20231201-100000',
        timestamp: '2023-12-01T10:00:00Z',
        infrastructureFileUpdated: true
      })
      
      testHelpers.assertContains(description, [
        '*NSYNC Repository Synchronization',
        'source/repo', // Now shows cleaned repo name instead of full URL
        'v1.2.3',
        'release/20231201-100000',
        '2023-12-01T10:00:00Z',
        'Updated InfrastructureAsCodeFile version references',
        'Testing Checklist',
        'File Changes',
        '*NSYNC CLI tool'
      ])
    })

    it('should generate description without InfrastructureAsCodeFile update', () => {
      const description = githubService.generatePRDescription({
        sourceRepo: 'https://github.com/source/repo.git',
        sourceTag: 'v1.2.3',
        branchName: 'release/20231201-100000',
        timestamp: '2023-12-01T10:00:00Z',
        infrastructureFileUpdated: false
      })
      
      expect(description).not.toContain('Updated InfrastructureAsCodeFile version references')
      testHelpers.assertContains(description, [
        '*NSYNC Repository Synchronization',
        'v1.2.3'
      ])
    })
  })

  describe('validateAuthentication', () => {
    it('should return true for valid authentication', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockResponse.user
      })

      const result = await githubService.validateAuthentication()
      
      expect(result).toBe(true)
    })

    it('should return false for invalid authentication', async () => {
      mockOctokit.rest.users.getAuthenticated.mockRejectedValue(new Error('Unauthorized'))

      const result = await githubService.validateAuthentication()
      
      expect(result).toBe(false)
    })
  })

  describe('getAuthenticatedUser', () => {
    it('should return user information', async () => {
      const mockResponse = testHelpers.createMockGitHubResponses()
      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: mockResponse.user
      })

      const result = await githubService.getAuthenticatedUser()
      
      expect(result).toEqual({
        login: 'testuser',
        name: 'Test User'
      })
    })

    it('should use login as name fallback', async () => {
      mockOctokit.rest.users.getAuthenticated.mockResolvedValue({
        data: { login: 'testuser', name: null }
      })

      const result = await githubService.getAuthenticatedUser()
      
      expect(result).toEqual({
        login: 'testuser',
        name: 'testuser'
      })
    })
  })

  describe('validateRepositoryAccess', () => {
    it('should return true for accessible repository', async () => {
      mockOctokit.rest.repos.get.mockResolvedValue({ data: {} })

      const result = await githubService.validateRepositoryAccess('https://github.com/owner/repo.git')
      
      expect(result).toBe(true)
      expect(mockOctokit.rest.repos.get).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo'
      })
    })

    it('should return false for inaccessible repository', async () => {
      mockOctokit.rest.repos.get.mockRejectedValue(new Error('Not found'))

      const result = await githubService.validateRepositoryAccess('https://github.com/owner/repo.git')
      
      expect(result).toBe(false)
    })
  })
})