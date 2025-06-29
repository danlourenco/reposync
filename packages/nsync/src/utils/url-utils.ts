import { parseURL, withoutTrailingSlash, joinURL } from 'ufo'

export interface ParsedRepository {
  host: string
  owner: string
  repo: string
  protocol: 'https' | 'ssh'
  fullPath: string
}

export function parseRepositoryUrl(url: string): ParsedRepository {
  // Handle SSH URLs (git@host:owner/repo.git)
  if (url.includes('@') && !url.startsWith('https://')) {
    const sshMatch = url.match(/git@([^:]+):(.+)/)
    if (!sshMatch) {
      throw new Error('Invalid repository URL')
    }
    
    const [, host, path] = sshMatch
    const cleanPath = path.replace(/\.git$/, '')
    const pathParts = cleanPath.split('/')
    
    if (pathParts.length < 2) {
      throw new Error('Invalid repository URL format')
    }
    
    return {
      host,
      owner: pathParts[0],
      repo: pathParts[1],
      protocol: 'ssh',
      fullPath: `${pathParts[0]}/${pathParts[1]}`
    }
  }
  
  // Handle HTTPS URLs
  const parsed = parseURL(url)
  if (!parsed.host) {
    throw new Error('Invalid repository URL')
  }
  
  const pathParts = (parsed.pathname || '').split('/').filter(p => p.length > 0)
  if (pathParts.length < 2) {
    throw new Error('Invalid repository URL format')
  }
  
  const owner = pathParts[0]
  const repo = pathParts[1].replace(/\.git$/, '')
  
  return {
    host: parsed.host,
    owner,
    repo,
    protocol: 'https',
    fullPath: `${owner}/${repo}`
  }
}

export function normalizeGitUrl(url: string): string {
  try {
    const parsed = parseRepositoryUrl(url)
    const baseUrl = `https://${parsed.host}/${parsed.fullPath}`
    return baseUrl.endsWith('.git') ? baseUrl : `${baseUrl}.git`
  } catch {
    // If parsing fails, just ensure .git suffix
    return url.endsWith('.git') ? url : `${url}.git`
  }
}

export function buildGitHubApiUrl(parsed: ParsedRepository, ...paths: string[]): string {
  // GitHub.com uses api.github.com
  if (parsed.host === 'github.com') {
    const fullPaths = paths.map(p => {
      if (p === 'repos') {
        return `repos/${parsed.fullPath}`
      }
      return p
    })
    return joinURL('https://api.github.com', ...fullPaths)
  }
  
  // Enterprise GitHub uses host/api/v3
  const baseUrl = `https://${parsed.host}/api/v3`
  const fullPaths = paths.map(p => {
    if (p === 'repos') {
      return `repos/${parsed.fullPath}`
    }
    return p
  })
  return joinURL(baseUrl, ...fullPaths)
}

export function extractRepoPath(url: string): string | null {
  try {
    const parsed = parseRepositoryUrl(url)
    return parsed.fullPath
  } catch {
    return null
  }
}