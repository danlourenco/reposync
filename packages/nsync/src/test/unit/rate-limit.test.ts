import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRateLimitedGitHubClient, createDebouncedLogger, rateLimitedFetch, clearRateLimitState } from '../../utils/rate-limit.js'

describe('Rate Limiting with perfect-debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearRateLimitState()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    clearRateLimitState()
  })

  describe('createRateLimitedGitHubClient', () => {
    it('should debounce rapid API calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ data: 'success' })
      const client = createRateLimitedGitHubClient(mockFetch, { delay: 100 })

      // Make multiple rapid calls
      const promises = [
        client('endpoint1'),
        client('endpoint1'),
        client('endpoint1')
      ]

      // Fast-forward time
      await vi.runAllTimersAsync()

      const results = await Promise.all(promises)
      
      // Should only call the underlying fetch once due to debouncing
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(results).toEqual([
        { data: 'success' },
        { data: 'success' },
        { data: 'success' }
      ])
    })

    it('should make separate calls for different endpoints', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ data: 'success' })
      const client = createRateLimitedGitHubClient(mockFetch, { delay: 100 })

      // Make calls to different endpoints
      const promises = [
        client('endpoint1'),
        client('endpoint2'),
        client('endpoint3')
      ]

      await vi.runAllTimersAsync()
      await Promise.all(promises)

      // Should call fetch for each unique endpoint
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should respect the configured delay', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ data: 'success' })
      const client = createRateLimitedGitHubClient(mockFetch, { delay: 500 })

      client('endpoint')
      
      // Advance time but not enough
      await vi.advanceTimersByTimeAsync(400)
      expect(mockFetch).not.toHaveBeenCalled()

      // Advance past the delay
      await vi.advanceTimersByTimeAsync(100)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should handle errors gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('API Error'))
      const client = createRateLimitedGitHubClient(mockFetch, { delay: 100 })

      const promise = client('endpoint')
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('API Error')
    })
  })

  describe('createDebouncedLogger', () => {
    it('should debounce rapid log messages', async () => {
      const mockLog = vi.fn()
      const debouncedLog = createDebouncedLogger(mockLog, { delay: 200 })

      // Rapid logging
      debouncedLog('message 1')
      debouncedLog('message 2')
      debouncedLog('message 3')
      debouncedLog('final message')

      await vi.runAllTimersAsync()

      // Should only log the last message
      expect(mockLog).toHaveBeenCalledTimes(1)
      expect(mockLog).toHaveBeenCalledWith('final message')
    })

    it('should log different severity levels independently', async () => {
      const mockInfo = vi.fn()
      const mockError = vi.fn()
      const logger = {
        info: createDebouncedLogger(mockInfo, { delay: 100 }),
        error: createDebouncedLogger(mockError, { delay: 100 })
      }

      logger.info('info message')
      logger.error('error message')

      await vi.runAllTimersAsync()

      expect(mockInfo).toHaveBeenCalledWith('info message')
      expect(mockError).toHaveBeenCalledWith('error message')
    })

    it('should handle multiple arguments', async () => {
      const mockLog = vi.fn()
      const debouncedLog = createDebouncedLogger(mockLog, { delay: 100 })

      debouncedLog('message', { extra: 'data' }, 123)

      await vi.runAllTimersAsync()

      expect(mockLog).toHaveBeenCalledWith('message', { extra: 'data' }, 123)
    })
  })

  describe('rateLimitedFetch', () => {
    it('should rate limit fetch requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ 
        ok: true, 
        json: async () => ({ data: 'test' }) 
      })
      
      const limitedFetch = rateLimitedFetch(mockFetch, { 
        maxRequests: 2, 
        windowMs: 1000 
      })

      // Make 3 requests
      const promises = [
        limitedFetch('https://api.github.com/repos/1'),
        limitedFetch('https://api.github.com/repos/2'),
        limitedFetch('https://api.github.com/repos/3')
      ]

      // First 2 should go through immediately
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Advance time to allow the third request
      await vi.advanceTimersByTimeAsync(1000)
      
      const results = await Promise.all(promises)
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(results).toHaveLength(3)
    })

    it('should queue requests when rate limit is exceeded', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ 
        ok: true, 
        json: async () => ({ data: 'test' }) 
      })
      
      const limitedFetch = rateLimitedFetch(mockFetch, { 
        maxRequests: 1, 
        windowMs: 500 
      })

      const start = Date.now()
      const promise1 = limitedFetch('https://api.github.com/repos/1')
      const promise2 = limitedFetch('https://api.github.com/repos/2')

      // First request should be immediate
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Advance time to process queued request
      await vi.advanceTimersByTimeAsync(500)
      await Promise.all([promise1, promise2])

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should handle different domains independently', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ 
        ok: true, 
        json: async () => ({ data: 'test' }) 
      })
      
      const limitedFetch = rateLimitedFetch(mockFetch, { 
        maxRequests: 1, 
        windowMs: 1000 
      })

      // Different domains should have separate rate limits
      await Promise.all([
        limitedFetch('https://api.github.com/repos/1'),
        limitedFetch('https://github.company.com/api/v3/repos/1')
      ])

      // Both should go through as they're different domains
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})