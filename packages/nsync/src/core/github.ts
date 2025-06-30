import { Octokit } from '@octokit/rest'
import { githubLogger } from '../utils/logger.js'
import { GitTag, RepoInfo, RepoSyncError } from './types.js'

/**
 * Repository information for user repositories
 */
export interface UserRepository {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  clone_url: string
  ssh_url: string
  html_url: string
  archived: boolean
  disabled: boolean
  fork: boolean
  default_branch: string
  updated_at: string | null
  pushed_at: string | null
  permissions?: {
    admin?: boolean
    push?: boolean
    pull?: boolean
  }
}

/**
 * Repository search result
 */
export interface RepositorySearchResult {
  total_count: number
  incomplete_results: boolean
  items: UserRepository[]
}

/**
 * Options for creating a pull request
 */
export interface CreatePROptions {
  /** Repository owner/organization name */
  owner: string
  /** Repository name */
  repo: string
  /** Pull request title */
  title: string
  /** Pull request body/description */
  body: string
  /** Source branch (head) for the pull request */
  head: string
  /** Target branch (base) for the pull request (default: 'main') */
  base?: string
  /** Whether to create as draft PR (default: true) */
  draft?: boolean
}

/**
 * Result of creating a pull request
 */
export interface PRResult {
  /** URL to the created pull request */
  url: string
  /** Pull request number */
  number: number
}

/**
 * GitHub service for repository and pull request operations
 * 
 * Provides methods for interacting with GitHub API including fetching tags,
 * creating pull requests, and validating repository access. Supports both
 * GitHub.com and GitHub Enterprise Server instances.
 * 
 * @example
 * ```typescript
 * // Standard GitHub.com
 * const github = new GitHubService({
 *   token: 'ghp_your_token_here'
 * })
 * 
 * // GitHub Enterprise Server
 * const githubEnterprise = new GitHubService({
 *   token: 'your_enterprise_token',
 *   baseUrl: 'https://github.company.com/api/v3'
 * })
 * 
 * // Fetch repository tags
 * const tags = await github.fetchTags('https://github.com/user/repo.git')
 * 
 * // Create a pull request
 * const pr = await github.createPullRequest({
 *   owner: 'user',
 *   repo: 'repo',
 *   title: 'Sync from v2.1.0',
 *   body: 'Automated sync from source repository',
 *   head: 'release/20231201-143022'
 * })
 * ```
 */
export class GitHubService {
  private octokit: Octokit
  private baseUrl: string

  /**
   * Create a new GitHubService instance
   * 
   * @param options - Configuration options for GitHub API
   * @param options.token - GitHub personal access token (falls back to GITHUB_TOKEN or GH_TOKEN env vars)
   * @param options.baseUrl - GitHub API base URL for enterprise instances (falls back to GITHUB_API_URL env var)
   */
  constructor(options?: {
    token?: string
    baseUrl?: string // For enterprise GitHub
  }) {
    const token = options?.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    this.baseUrl = options?.baseUrl || process.env.GITHUB_API_URL || 'https://api.github.com'
    
    // For enterprise GitHub, ensure we have the correct API path
    let apiUrl = this.baseUrl
    if (this.baseUrl !== 'https://api.github.com' && !this.baseUrl.includes('/api/v3')) {
      // Add /api/v3 for enterprise GitHub if not already present
      apiUrl = this.baseUrl.replace(/\/$/, '') + '/api/v3'
    }

    this.octokit = new Octokit({
      auth: token,
      baseUrl: apiUrl,
      userAgent: '*NSYNC CLI v1.0'
    })

    githubLogger.debug(`GitHub API configured for: ${apiUrl}`)
  }

  /**
   * Parse repository URL to extract owner and repository name
   * 
   * Supports both HTTPS and SSH URLs for GitHub.com and enterprise instances.
   * Handles various URL formats including SSH, HTTPS, and URLs with/without .git suffix.
   * 
   * @param repoUrl - Repository URL to parse
   * @returns Parsed repository information
   * @throws {RepoSyncError} When URL format is invalid
   * 
   * @example
   * ```typescript
   * // HTTPS URLs
   * const info1 = github.parseRepositoryUrl('https://github.com/user/repo.git')
   * 
   * // SSH URLs
   * const info2 = github.parseRepositoryUrl('git@github.com:user/repo.git')
   * 
   * // Enterprise URLs
   * const info3 = github.parseRepositoryUrl('https://github.company.com/org/project')
   * 
   * console.log(info1) // { owner: 'user', name: 'repo', fullName: 'user/repo' }
   * ```
   */
  parseRepositoryUrl(repoUrl: string): RepoInfo {
    try {
      // Handle both HTTPS and SSH URLs
      let cleanUrl = repoUrl
      
      // Convert SSH to HTTPS format for parsing
      if (repoUrl.includes('@') && !repoUrl.startsWith('https://')) {
        // Handle enterprise SSH: git@enterprise.com:owner/repo.git
        const sshMatch = repoUrl.match(/git@([^:]+):(.+)/)
        if (sshMatch) {
          const [, host, path] = sshMatch
          cleanUrl = `https://${host}/${path}`
        }
      }
      
      // Remove .git suffix if present
      cleanUrl = cleanUrl.replace(/\.git$/, '')
      
      const url = new URL(cleanUrl)
      const pathParts = url.pathname.split('/').filter(part => part.length > 0)
      
      if (pathParts.length < 2) {
        throw new Error('Invalid repository URL format')
      }
      
      const owner = pathParts[0]
      const repo = pathParts[1]
      
      return {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`
      }
    } catch (error) {
      throw new RepoSyncError(
        `Failed to parse repository URL: ${repoUrl}`,
        'INVALID_REPO_URL',
        repoUrl
      )
    }
  }

  /**
   * Fetch tags from a repository (without commit dates)
   * 
   * Retrieves the most recent tags from the specified repository.
   * This is faster than fetchTagsWithDates but doesn't include commit dates.
   * 
   * @param repoUrl - Repository URL to fetch tags from
   * @param limit - Maximum number of tags to fetch (default: 20)
   * @returns Promise resolving to array of Git tags
   * @throws {RepoSyncError} When GitHub API request fails
   * 
   * @example
   * ```typescript
   * const tags = await github.fetchTags('https://github.com/user/repo.git', 10)
   * tags.forEach(tag => {
   *   console.log(`${tag.name}: ${tag.commit}`)
   * })
   * ```
   */
  async fetchTags(repoUrl: string, limit = 20): Promise<GitTag[]> {
    try {
      const repoInfo = this.parseRepositoryUrl(repoUrl)
      githubLogger.info(`🔄 Fetching tags from ${repoInfo.fullName}`)
      
      const { data } = await this.octokit.rest.repos.listTags({
        owner: repoInfo.owner,
        repo: repoInfo.name,
        per_page: limit
      })
      
      // Transform to our GitTag format
      const tags: GitTag[] = data.map(tag => ({
        name: tag.name,
        commit: tag.commit.sha,
        date: 'unknown' // We'll need a separate call to get commit date if needed
      }))
      
      githubLogger.success(`Found ${tags.length} tags`)
      return tags
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      githubLogger.error(`Failed to fetch tags: ${message}`)
      throw new RepoSyncError(`GitHub API error: ${message}`, 'GITHUB_API_FAILED', repoUrl)
    }
  }

  /**
   * Fetch tags with commit dates (slower but more complete)
   * 
   * Retrieves tags and makes additional API calls to get commit dates.
   * This provides more complete information but is slower due to multiple API calls.
   * 
   * @param repoUrl - Repository URL to fetch tags from
   * @param limit - Maximum number of tags to fetch (default: 20)
   * @returns Promise resolving to array of Git tags with commit dates
   * @throws {RepoSyncError} When GitHub API request fails
   * 
   * @example
   * ```typescript
   * const tags = await github.fetchTagsWithDates('https://github.com/user/repo.git')
   * tags.forEach(tag => {
   *   console.log(`${tag.name}: ${tag.date} (${tag.commit})`)
   * })
   * ```
   */
  async fetchTagsWithDates(repoUrl: string, limit = 20): Promise<GitTag[]> {
    try {
      const repoInfo = this.parseRepositoryUrl(repoUrl)
      githubLogger.info(`🔄 Fetching tags with dates from ${repoInfo.fullName}`)
      
      const { data: tags } = await this.octokit.rest.repos.listTags({
        owner: repoInfo.owner,
        repo: repoInfo.name,
        per_page: limit
      })
      
      // Fetch commit details for each tag to get dates
      const tagsWithDates = await Promise.all(
        tags.map(async (tag) => {
          try {
            const { data: commit } = await this.octokit.rest.repos.getCommit({
              owner: repoInfo.owner,
              repo: repoInfo.name,
              ref: tag.commit.sha
            })
            
            return {
              name: tag.name,
              commit: tag.commit.sha,
              date: commit.commit.author?.date || 'unknown'
            }
          } catch {
            // If we can't get commit details, return with unknown date
            return {
              name: tag.name,
              commit: tag.commit.sha,
              date: 'unknown'
            }
          }
        })
      )
      
      githubLogger.success(`Found ${tagsWithDates.length} tags with dates`)
      return tagsWithDates
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      githubLogger.error(`Failed to fetch tags with dates: ${message}`)
      throw new RepoSyncError(`GitHub API error: ${message}`, 'GITHUB_API_FAILED', repoUrl)
    }
  }

  /**
   * Create a pull request in the specified repository
   * 
   * Creates a new pull request with the provided options. By default,
   * creates draft pull requests for review before merging.
   * 
   * @param options - Pull request configuration options
   * @returns Promise resolving to pull request result with URL and number
   * @throws {RepoSyncError} When pull request creation fails
   * 
   * @example
   * ```typescript
   * const pr = await github.createPullRequest({
   *   owner: 'user',
   *   repo: 'repository',
   *   title: 'Sync from v2.1.0',
   *   body: 'Automated sync from source repository',
   *   head: 'release/20231201-143022',
   *   base: 'main',
   *   draft: true
   * })
   * 
   * console.log(`Created PR #${pr.number}: ${pr.url}`)
   * ```
   */
  async createPullRequest(options: CreatePROptions): Promise<PRResult> {
    try {
      githubLogger.info(`🔄 Creating pull request in ${options.owner}/${options.repo}`)
      
      const { data } = await this.octokit.rest.pulls.create({
        owner: options.owner,
        repo: options.repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base || 'main',
        draft: options.draft || true // Default to draft PRs
      })
      
      githubLogger.success(`Created pull request #${data.number}: ${data.html_url}`)
      
      return {
        url: data.html_url,
        number: data.number
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      githubLogger.error(`Failed to create pull request: ${message}`)
      throw new RepoSyncError(
        `PR creation failed: ${message}`,
        'PR_CREATE_FAILED',
        `${options.owner}/${options.repo}`
      )
    }
  }

  /**
   * Generate a standardized pull request description
   * 
   * Creates a comprehensive PR description with sync details, testing checklist,
   * and next steps. Includes conditional messaging for InfrastructureAsCodeFile updates.
   * 
   * @param options - PR description configuration
   * @param options.sourceRepo - Source repository URL
   * @param options.sourceTag - Source tag or branch
   * @param options.branchName - Release branch name
   * @param options.timestamp - Sync timestamp
   * @param options.infrastructureFileUpdated - Whether InfrastructureAsCodeFile was updated (optional)
   * @returns Formatted pull request description
   * 
   * @example
   * ```typescript
   * const description = github.generatePRDescription({
   *   sourceRepo: 'https://github.com/source/repo.git',
   *   sourceTag: 'v2.1.0',
   *   branchName: 'release/20231201-143022',
   *   timestamp: '2023-12-01T14:30:22.123Z',
   *   infrastructureFileUpdated: true
   * })
   * ```
   */
  generatePRDescription(options: {
    sourceRepo: string
    sourceTag: string
    branchName: string
    timestamp: string
    infrastructureFileUpdated?: boolean
    filesAdded?: number
    filesModified?: number
    filesPreserved?: number
  }): string {
    const { sourceRepo, sourceTag, branchName, timestamp, infrastructureFileUpdated, filesAdded = 0, filesModified = 0, filesPreserved = 0 } = options
    
    // Extract repo name from URL for cleaner display
    const repoName = sourceRepo.replace(/.*github\.com[:/]([^/]+\/[^/]+)(\.git)?$/, '$1').replace(/\.git$/, '')
    
    return `## 🔄 *NSYNC Repository Synchronization

**Source Tag:** \`${sourceTag}\`  
**Sync Timestamp:** \`${timestamp}\`  
**Branch:** \`${branchName}\`

This PR contains an automated sync from the canonical repository **${repoName}** while preserving repository-specific configurations.

### 📋 Summary
- ✅ Synced all files from source repository tag \`${sourceTag}\`
- ✅ Preserved repository-specific configurations${infrastructureFileUpdated ? '\n- ✅ Updated InfrastructureAsCodeFile version references' : ''}
- ✅ Branch created with timestamp: \`${timestamp}\`

### 📊 File Changes
- **Added:** ${filesAdded} files
- **Modified:** ${filesModified} files  
- **Preserved:** ${filesPreserved} files with custom rules

### 🧪 Testing Checklist
- [ ] Review file changes in this PR
- [ ] Run application tests
- [ ] Verify infrastructure configurations are intact${infrastructureFileUpdated ? '\n- [ ] Verify updated version references are correct' : ''}
- [ ] Test deployment pipeline
- [ ] Review changes for any unexpected modifications

### 🚀 Next Steps
1. Review the changes in this pull request
2. Run any necessary tests or validations${infrastructureFileUpdated ? '\n3. Verify infrastructure file version updates\n4. Merge when ready to deploy' : '\n3. Merge when ready to deploy'}

---
*This PR was created automatically by the *NSYNC CLI tool*`
  }

  /**
   * Validate GitHub authentication
   * 
   * Tests whether the configured token is valid and has access to the GitHub API.
   * 
   * @returns Promise resolving to true if authenticated, false otherwise
   * 
   * @example
   * ```typescript
   * const isAuthenticated = await github.validateAuthentication()
   * if (!isAuthenticated) {
   *   throw new Error('GitHub authentication failed')
   * }
   * ```
   */
  async validateAuthentication(): Promise<boolean> {
    try {
      await this.octokit.rest.users.getAuthenticated()
      return true
    } catch (error) {
      githubLogger.debug(`GitHub authentication failed: ${error}`)
      return false
    }
  }

  /**
   * Get information about the authenticated user
   * 
   * Retrieves the login and display name of the currently authenticated user.
   * 
   * @returns Promise resolving to user information
   * @throws {RepoSyncError} When user information cannot be retrieved
   * 
   * @example
   * ```typescript
   * const user = await github.getAuthenticatedUser()
   * console.log(`Authenticated as: ${user.name} (${user.login})`)
   * ```
   */
  async getAuthenticatedUser(): Promise<{ login: string; name: string }> {
    try {
      const { data } = await this.octokit.rest.users.getAuthenticated()
      return {
        login: data.login,
        name: data.name || data.login
      }
    } catch (error) {
      throw new RepoSyncError('Failed to get user info', 'GITHUB_AUTH_FAILED')
    }
  }

  /**
   * Validate access to a repository
   * 
   * Checks whether the specified repository exists and is accessible
   * with the current authentication credentials.
   * 
   * @param repoUrl - Repository URL to validate
   * @returns Promise resolving to true if accessible, false otherwise
   * 
   * @example
   * ```typescript
   * const canAccess = await github.validateRepositoryAccess(
   *   'https://github.com/user/private-repo.git'
   * )
   * if (!canAccess) {
   *   console.warn('Repository not accessible')
   * }
   * ```
   */
  async validateRepositoryAccess(repoUrl: string): Promise<boolean> {
    try {
      const repoInfo = this.parseRepositoryUrl(repoUrl)
      await this.octokit.rest.repos.get({
        owner: repoInfo.owner,
        repo: repoInfo.name
      })
      return true
    } catch (error) {
      githubLogger.debug(`Repository access validation failed for ${repoUrl}: ${error}`)
      return false
    }
  }

  /**
   * Fetch user's accessible repositories
   * 
   * Retrieves repositories the authenticated user has access to,
   * including owned repositories and repositories with appropriate permissions.
   * 
   * @param options - Repository fetch options
   * @returns Promise resolving to array of repository information
   * 
   * @example
   * ```typescript
   * const repos = await githubService.fetchUserRepositories({
   *   type: 'all',
   *   sort: 'updated',
   *   per_page: 50
   * })
   * 
   * repos.forEach(repo => {
   *   console.log(`${repo.full_name} - ${repo.description}`)
   * })
   * ```
   */
  async fetchUserRepositories(options: {
    type?: 'all' | 'owner' | 'member'
    sort?: 'created' | 'updated' | 'pushed' | 'full_name'
    direction?: 'asc' | 'desc'
    per_page?: number
    visibility?: 'all' | 'public' | 'private'
  } = {}): Promise<UserRepository[]> {
    const {
      type = 'all',
      sort = 'updated',
      direction = 'desc',
      per_page = 100,
      visibility = 'all'
    } = options

    try {
      githubLogger.debug(`Fetching ${type} repositories for authenticated user`)

      // GitHub API doesn't allow both type and visibility parameters
      // Use type parameter for filtering, visibility filtering done client-side
      const response = await this.octokit.rest.repos.listForAuthenticatedUser({
        type,
        sort,
        direction,
        per_page
      })

      const repositories: UserRepository[] = response.data.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        html_url: repo.html_url,
        archived: repo.archived,
        disabled: repo.disabled,
        fork: repo.fork,
        default_branch: repo.default_branch,
        updated_at: repo.updated_at || null,
        pushed_at: repo.pushed_at || null,
        permissions: repo.permissions
      }))

      // Apply client-side visibility filtering if needed
      let filteredRepositories = repositories
      if (visibility !== 'all') {
        filteredRepositories = repositories.filter(repo => {
          if (visibility === 'public') return !repo.private
          if (visibility === 'private') return repo.private
          return true
        })
      }

      githubLogger.debug(`Found ${filteredRepositories.length} repositories`)
      return filteredRepositories

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      githubLogger.error('Failed to fetch repositories:', message)
      throw new RepoSyncError(`Failed to fetch repositories: ${message}`, 'GITHUB_API_FAILED')
    }
  }

  /**
   * Search repositories accessible to the user
   * 
   * Searches for repositories using GitHub's search API with additional
   * filtering for repositories the user has access to.
   * 
   * @param query - Search query string
   * @param options - Search options
   * @returns Promise resolving to search results
   * 
   * @example
   * ```typescript
   * const results = await githubService.searchUserRepositories('api', {
   *   sort: 'updated',
   *   per_page: 20
   * })
   * 
   * console.log(`Found ${results.total_count} repositories`)
   * ```
   */
  async searchUserRepositories(
    query: string,
    options: {
      sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated'
      order?: 'desc' | 'asc'
      per_page?: number
    } = {}
  ): Promise<RepositorySearchResult> {
    const { sort = 'updated', order = 'desc', per_page = 30 } = options

    try {
      // Get authenticated user to build search query
      const user = await this.getAuthenticatedUser()
      const searchQuery = `${query} user:${user.login}`

      githubLogger.debug(`Searching repositories with query: ${searchQuery}`)

      const response = await this.octokit.rest.search.repos({
        q: searchQuery,
        sort,
        order,
        per_page
      })

      return {
        total_count: response.data.total_count,
        incomplete_results: response.data.incomplete_results,
        items: response.data.items.map(repo => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          clone_url: repo.clone_url,
          ssh_url: repo.ssh_url,
          html_url: repo.html_url,
          archived: repo.archived,
          disabled: repo.disabled,
          fork: repo.fork,
          default_branch: repo.default_branch,
          updated_at: repo.updated_at,
          pushed_at: repo.pushed_at
        }))
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      githubLogger.error('Repository search failed:', message)
      throw new RepoSyncError(`Repository search failed: ${message}`, 'GITHUB_API_FAILED')
    }
  }
}