import { describe, it, expect } from 'vitest'
import { safeParseJSON, parseGitHubResponse, parseConfigFile } from '../../utils/json-utils.js'

describe('JSON Utils with destr', () => {
  describe('safeParseJSON', () => {
    it('should parse valid JSON strings', () => {
      expect(safeParseJSON('{"name": "test", "value": 123}')).toEqual({ name: 'test', value: 123 })
      expect(safeParseJSON('[1, 2, 3]')).toEqual([1, 2, 3])
      expect(safeParseJSON('"string value"')).toBe('string value')
      expect(safeParseJSON('true')).toBe(true)
      expect(safeParseJSON('null')).toBe(null)
    })

    it('should return default value for invalid JSON', () => {
      expect(safeParseJSON('invalid json', { default: {} })).toEqual({})
      expect(safeParseJSON('{broken json', { default: null })).toBe(null)
      expect(safeParseJSON('', { default: [] })).toEqual([])
    })

    it('should handle primitive values directly', () => {
      expect(safeParseJSON('123')).toBe(123)
      expect(safeParseJSON('123.45')).toBe(123.45)
      expect(safeParseJSON('true')).toBe(true)
      expect(safeParseJSON('false')).toBe(false)
    })

    it('should handle undefined and null inputs', () => {
      expect(safeParseJSON(undefined, { default: 'default' })).toBe('default')
      expect(safeParseJSON(null, { default: 'default' })).toBe('default')
    })

    it('should not throw on malformed JSON', () => {
      expect(() => safeParseJSON('{ bad: json }')).not.toThrow()
      expect(() => safeParseJSON('undefined')).not.toThrow()
    })
  })

  describe('parseGitHubResponse', () => {
    it('should parse GitHub API responses safely', () => {
      const validResponse = '{"id": 123, "name": "repo", "owner": {"login": "user"}}'
      expect(parseGitHubResponse(validResponse)).toEqual({
        id: 123,
        name: 'repo',
        owner: { login: 'user' }
      })
    })

    it('should handle GitHub error responses', () => {
      const errorResponse = '{"message": "Not Found", "documentation_url": "https://docs.github.com"}'
      const result = parseGitHubResponse(errorResponse)
      expect(result).toEqual({
        message: 'Not Found',
        documentation_url: 'https://docs.github.com'
      })
    })

    it('should return empty object for invalid responses', () => {
      expect(parseGitHubResponse('not json')).toEqual({})
      expect(parseGitHubResponse('')).toEqual({})
      expect(parseGitHubResponse(null as any)).toEqual({})
    })

    it('should handle rate limit responses', () => {
      const rateLimitResponse = `{
        "message": "API rate limit exceeded",
        "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
      }`
      const result = parseGitHubResponse(rateLimitResponse)
      expect(result.message).toBe('API rate limit exceeded')
    })
  })

  describe('parseConfigFile', () => {
    it('should parse valid config file content', () => {
      const configContent = `{
        "source_repo": "https://github.com/source/repo.git",
        "target_repos": [
          {"name": "Target 1", "url": "https://github.com/target/repo1.git"}
        ]
      }`
      
      const result = parseConfigFile(configContent)
      expect(result).toEqual({
        source_repo: 'https://github.com/source/repo.git',
        target_repos: [
          { name: 'Target 1', url: 'https://github.com/target/repo1.git' }
        ]
      })
    })

    it('should handle comments in JSON (JSON5-like)', () => {
      const configWithComments = `{
        // Source repository
        "source_repo": "https://github.com/source/repo.git",
        /* Target repositories */
        "target_repos": []
      }`
      
      // destr should handle this gracefully
      const result = parseConfigFile(configWithComments)
      expect(result).toHaveProperty('source_repo')
    })

    it('should return null for invalid config content', () => {
      expect(parseConfigFile('not a config')).toBeNull()
      expect(parseConfigFile('')).toBeNull()
      expect(parseConfigFile('{invalid')).toBeNull()
    })

    it('should handle missing required fields gracefully', () => {
      const incompleteConfig = '{"source_repo": "https://github.com/source/repo.git"}'
      const result = parseConfigFile(incompleteConfig)
      expect(result).toEqual({
        source_repo: 'https://github.com/source/repo.git'
      })
    })
  })
})