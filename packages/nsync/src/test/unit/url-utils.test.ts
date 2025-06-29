import { describe, it, expect } from 'vitest'
import { parseRepositoryUrl, normalizeGitUrl, buildGitHubApiUrl, extractRepoPath } from '../../utils/url-utils.js'

describe('URL Utils with ufo', () => {
  describe('parseRepositoryUrl', () => {
    it('should parse standard GitHub HTTPS URLs', { timeout: 2000 }, () => {
      const result = parseRepositoryUrl('https://github.com/user/repo.git')
      expect(result).toEqual({
        host: 'github.com',
        owner: 'user',
        repo: 'repo',
        protocol: 'https',
        fullPath: 'user/repo'
      })
    })

    it('should parse GitHub SSH URLs', () => {
      const result = parseRepositoryUrl('git@github.com:user/repo.git')
      expect(result).toEqual({
        host: 'github.com',
        owner: 'user',
        repo: 'repo',
        protocol: 'ssh',
        fullPath: 'user/repo'
      })
    })

    it('should parse enterprise GitHub HTTPS URLs', () => {
      const result = parseRepositoryUrl('https://github.company.com/org/project.git')
      expect(result).toEqual({
        host: 'github.company.com',
        owner: 'org',
        repo: 'project',
        protocol: 'https',
        fullPath: 'org/project'
      })
    })

    it('should parse enterprise GitHub SSH URLs', () => {
      const result = parseRepositoryUrl('git@github.company.com:org/project.git')
      expect(result).toEqual({
        host: 'github.company.com',
        owner: 'org',
        repo: 'project',
        protocol: 'ssh',
        fullPath: 'org/project'
      })
    })

    it('should handle URLs without .git suffix', () => {
      const result = parseRepositoryUrl('https://github.com/user/repo')
      expect(result).toEqual({
        host: 'github.com',
        owner: 'user',
        repo: 'repo',
        protocol: 'https',
        fullPath: 'user/repo'
      })
    })

    it('should throw error for invalid URLs', () => {
      expect(() => parseRepositoryUrl('not-a-url')).toThrow('Invalid repository URL')
      expect(() => parseRepositoryUrl('https://github.com/invalid')).toThrow('Invalid repository URL format')
    })
  })

  describe('normalizeGitUrl', () => {
    it('should normalize various URL formats to consistent HTTPS format', () => {
      expect(normalizeGitUrl('git@github.com:user/repo.git')).toBe('https://github.com/user/repo.git')
      expect(normalizeGitUrl('https://github.com/user/repo')).toBe('https://github.com/user/repo.git')
      expect(normalizeGitUrl('https://github.com/user/repo.git')).toBe('https://github.com/user/repo.git')
    })

    it('should handle enterprise URLs', () => {
      expect(normalizeGitUrl('git@github.company.com:org/project.git'))
        .toBe('https://github.company.com/org/project.git')
    })
  })

  describe('buildGitHubApiUrl', () => {
    it('should build correct API URLs for GitHub.com', () => {
      const parsed = {
        host: 'github.com',
        owner: 'user',
        repo: 'repo',
        protocol: 'https' as const,
        fullPath: 'user/repo'
      }
      
      expect(buildGitHubApiUrl(parsed, 'repos')).toBe('https://api.github.com/repos/user/repo')
      expect(buildGitHubApiUrl(parsed, 'repos', 'tags')).toBe('https://api.github.com/repos/user/repo/tags')
    })

    it('should build correct API URLs for enterprise GitHub', () => {
      const parsed = {
        host: 'github.company.com',
        owner: 'org',
        repo: 'project',
        protocol: 'https' as const,
        fullPath: 'org/project'
      }
      
      expect(buildGitHubApiUrl(parsed, 'repos')).toBe('https://github.company.com/api/v3/repos/org/project')
      expect(buildGitHubApiUrl(parsed, 'repos', 'pulls'))
        .toBe('https://github.company.com/api/v3/repos/org/project/pulls')
    })
  })

  describe('extractRepoPath', () => {
    it('should extract repository path from various URL formats', () => {
      expect(extractRepoPath('https://github.com/user/repo.git')).toBe('user/repo')
      expect(extractRepoPath('git@github.com:user/repo.git')).toBe('user/repo')
      expect(extractRepoPath('https://github.company.com/org/project')).toBe('org/project')
    })

    it('should return null for invalid URLs', () => {
      expect(extractRepoPath('not-a-url')).toBeNull()
      expect(extractRepoPath('https://github.com/')).toBeNull()
    })
  })
})