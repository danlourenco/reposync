import { debounce } from 'perfect-debounce'

interface RateLimitOptions {
  delay?: number
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

// Store for debounced functions by key
const debouncedFunctions = new Map<string, (...args: any[]) => any>()

export function createRateLimitedGitHubClient(
  fetchFn: (...args: any[]) => Promise<any>, 
  options: RateLimitOptions = {}
): (endpoint: string) => Promise<any> {
  const { delay = 100 } = options
  const pendingCalls = new Map<string, { promise?: Promise<any>, calls: Array<{resolve: (value: any) => void, reject: (reason?: any) => void}> }>()
  
  return (endpoint: string) => {
    return new Promise((resolve, reject) => {
      if (!pendingCalls.has(endpoint)) {
        pendingCalls.set(endpoint, { calls: [] })
      }
      
      const pending = pendingCalls.get(endpoint)!
      pending.calls.push({ resolve: resolve as (value: any) => void, reject: reject as (reason?: any) => void })
      
      // If there's already a debounced call in progress, join it
      if (pending.promise) {
        return
      }
      
      // Create the debounced function for this endpoint
      const debouncedFn = debounce(async () => {
        try {
          const result = await fetchFn(endpoint)
          // Resolve all pending calls with the same result
          pending.calls.forEach(({ resolve }) => resolve(result))
          pending.calls = []
        } catch (error) {
          // Reject all pending calls with the same error
          pending.calls.forEach(({ reject }) => reject(error))
          pending.calls = []
          throw error
        }
      }, delay)
      
      // Store the promise and execute
      pending.promise = debouncedFn()
    })
  }
}

export function createDebouncedLogger(
  logFn: (...args: any[]) => void,
  options: RateLimitOptions = {}
): (...args: any[]) => void {
  const { delay = 200 } = options
  
  return debounce(logFn, delay)
}

// Rate limiter with request queuing
interface RateLimiterState {
  requests: number
  resetTime: number
  queue: Array<{ resolve: (value: any) => void; reject: (reason?: any) => void; args: any[] }>
}

const rateLimiters = new Map<string, RateLimiterState>()

export function rateLimitedFetch(
  fetchFn: (...args: any[]) => Promise<any>,
  config: RateLimitConfig
): (...args: any[]) => Promise<any> {
  const { maxRequests, windowMs } = config
  
  return (...args: any[]) => {
    // Extract domain from URL for per-domain limiting
    const url = args[0] as string
    const domain = new URL(url).hostname
    
    if (!rateLimiters.has(domain)) {
      rateLimiters.set(domain, {
        requests: 0,
        resetTime: Date.now() + windowMs,
        queue: []
      })
    }
    
    const limiter = rateLimiters.get(domain)!
    const now = Date.now()
    
    // Reset window if time has passed
    if (now >= limiter.resetTime) {
      limiter.requests = 0
      limiter.resetTime = now + windowMs
    }
    
    // Check if we can make request immediately
    if (limiter.requests < maxRequests) {
      limiter.requests++
      return fetchFn(...args)
    }
    
    // Queue the request
    return new Promise((resolve, reject) => {
      limiter.queue.push({ resolve, reject, args })
      
      // Schedule processing when window resets
      const timeUntilReset = limiter.resetTime - now
      setTimeout(() => {
        processQueue(domain, fetchFn, maxRequests, windowMs)
      }, timeUntilReset)
    })
  }
}

function processQueue(
  domain: string, 
  fetchFn: (...args: any[]) => Promise<any>, 
  maxRequests: number,
  windowMs: number
) {
  const limiter = rateLimiters.get(domain)
  if (!limiter || limiter.queue.length === 0) return
  
  // Reset for new window
  limiter.requests = 0
  limiter.resetTime = Date.now() + windowMs
  
  // Process queued requests up to limit
  const toProcess = limiter.queue.splice(0, maxRequests)
  toProcess.forEach(({ resolve, reject, args }) => {
    limiter.requests++
    fetchFn(...args).then(resolve).catch(reject)
  })
}

// Export for testing - clear all state
export function clearRateLimitState() {
  debouncedFunctions.clear()
  rateLimiters.clear()
}