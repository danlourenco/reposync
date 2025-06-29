import { simpleGit, SimpleGit, CleanOptions } from 'simple-git'
import { resolve, join } from 'pathe'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import consola, { gitLogger, log } from '../utils/logger.js'
import { RepoSyncError } from './types.js'

/**
 * Options for cloning a Git repository
 */
export interface CloneOptions {
  /** The repository URL to clone from */
  url: string
  /** Optional branch to clone */
  branch?: string
  /** Optional tag to checkout after cloning */
  tag?: string
  /** Target directory for the clone */
  targetDir: string
}

/**
 * Options for committing changes to a Git repository
 */
export interface CommitOptions {
  /** The commit message */
  message: string
  /** Optional author information for the commit */
  author?: {
    /** Author's name */
    name: string
    /** Author's email */
    email: string
  }
}

/**
 * Git service for performing repository operations
 * 
 * Provides methods for cloning repositories, creating branches, committing changes,
 * and pushing to remote repositories. Handles temporary directory management and
 * includes comprehensive error handling with RepoSyncError types.
 * 
 * @example
 * ```typescript
 * const gitService = new GitService()
 * 
 * // Clone a repository
 * const tempDir = await gitService.createTempDirectory()
 * await gitService.cloneRepository({
 *   url: 'https://github.com/user/repo.git',
 *   tag: 'v1.0.0',
 *   targetDir: tempDir
 * })
 * 
 * // Create a new branch and commit changes
 * await gitService.createBranch(tempDir, 'feature/new-sync')
 * await gitService.commitChanges(tempDir, {
 *   message: 'Sync from source repository'
 * })
 * 
 * // Push to remote
 * await gitService.pushBranch(tempDir, 'feature/new-sync')
 * 
 * // Cleanup
 * await gitService.cleanupDirectory(tempDir)
 * ```
 */
export class GitService {
  private git: SimpleGit
  private workingDir: string

  /**
   * Create a new GitService instance
   * 
   * @param workingDir - Optional working directory for git operations (defaults to current working directory)
   */
  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd()
    this.git = simpleGit(this.workingDir)
  }

  /**
   * Clone a repository to a specified directory
   * 
   * Clones a Git repository from the specified URL to the target directory.
   * Supports cloning specific branches or tags, and automatically checks out
   * to the specified tag if provided.
   * 
   * @param options - Clone configuration options
   * @returns Promise resolving to the target directory path
   * @throws {RepoSyncError} When clone operation fails
   * 
   * @example
   * ```typescript
   * // Clone latest from main branch
   * await gitService.cloneRepository({
   *   url: 'https://github.com/user/repo.git',
   *   targetDir: '/tmp/repo-clone'
   * })
   * 
   * // Clone specific tag
   * await gitService.cloneRepository({
   *   url: 'https://github.com/user/repo.git',
   *   tag: 'v2.1.0',
   *   targetDir: '/tmp/repo-v2.1.0'
   * })
   * ```
   */
  async cloneRepository(options: CloneOptions): Promise<string> {
    try {
      gitLogger.info(`🔄 Cloning repository: ${options.url}`)
      
      // Create target directory if it doesn't exist
      await this.ensureDirectory(options.targetDir)
      
      const git = simpleGit()
      
      // Clone with specific options
      const cloneOptions = []
      if (options.branch) {
        cloneOptions.push('--branch', options.branch)
      }
      if (options.tag) {
        cloneOptions.push('--branch', options.tag)
      }
      
      await git.clone(options.url, options.targetDir, cloneOptions)
      
      // If we specified a tag, checkout to that tag
      if (options.tag && !options.branch) {
        const repoGit = simpleGit(options.targetDir)
        await repoGit.checkout(options.tag)
      }
      
      gitLogger.success(`Repository cloned to: ${options.targetDir}`)
      return options.targetDir
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      gitLogger.error(`Failed to clone repository: ${message}`)
      throw new RepoSyncError(`Clone failed: ${message}`, 'CLONE_FAILED', options.url)
    }
  }

  /**
   * Create a temporary directory for git operations
   * 
   * Creates a unique temporary directory with the specified prefix.
   * The directory will be created in the system's temporary directory.
   * 
   * @param prefix - Prefix for the temporary directory name (default: 'nsync-')
   * @returns Promise resolving to the full path of the created directory
   * @throws {RepoSyncError} When directory creation fails
   * 
   * @example
   * ```typescript
   * const tempDir = await gitService.createTempDirectory('repo-sync-')
   * console.log(tempDir) // e.g., '/tmp/repo-sync-abc123'
   * ```
   */
  async createTempDirectory(prefix = 'nsync-'): Promise<string> {
    try {
      const tempDir = await mkdtemp(join(tmpdir(), prefix))
      gitLogger.debug(`Created temporary directory: ${tempDir}`)
      return tempDir
    } catch (error) {
      throw new RepoSyncError('Failed to create temporary directory', 'TEMP_DIR_FAILED')
    }
  }

  /**
   * Clean up a directory and all its contents
   * 
   * Recursively removes the specified directory and all files within it.
   * This method is safe to call even if the directory doesn't exist.
   * 
   * @param dirPath - Path to the directory to remove
   * @returns Promise that resolves when cleanup is complete
   * 
   * @example
   * ```typescript
   * await gitService.cleanupDirectory('/tmp/repo-clone')
   * ```
   */
  async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      await rm(dirPath, { recursive: true, force: true })
      gitLogger.debug(`Cleaned up directory: ${dirPath}`)
    } catch (error) {
      gitLogger.warn(`Failed to cleanup directory ${dirPath}: ${error}`)
    }
  }

  /**
   * Validate that a repository URL is accessible
   * 
   * Tests repository access by attempting to list remote heads.
   * This validates both repository existence and authentication.
   * 
   * @param repoUrl - The repository URL to validate
   * @returns Promise resolving to true if accessible, false otherwise
   * 
   * @example
   * ```typescript
   * const isAccessible = await gitService.validateRepositoryAccess(
   *   'https://github.com/user/repo.git'
   * )
   * if (!isAccessible) {
   *   throw new Error('Repository not accessible')
   * }
   * ```
   */
  async validateRepositoryAccess(repoUrl: string): Promise<boolean> {
    try {
      gitLogger.debug(`Validating access to: ${repoUrl}`)
      const git = simpleGit()
      await git.listRemote(['--heads', repoUrl])
      return true
    } catch (error) {
      gitLogger.debug(`Repository access validation failed: ${error}`)
      return false
    }
  }

  /**
   * Create and checkout a new branch in the specified repository
   * 
   * Creates a new local branch from the current HEAD and checks it out.
   * Throws an error if the branch already exists.
   * 
   * @param repoPath - Path to the local repository
   * @param branchName - Name of the new branch to create
   * @returns Promise that resolves when branch is created and checked out
   * @throws {RepoSyncError} When branch creation fails or branch already exists
   * 
   * @example
   * ```typescript
   * await gitService.createBranch('/tmp/repo', 'feature/new-feature')
   * // Repository is now on the new branch
   * ```
   */
  async createBranch(repoPath: string, branchName: string): Promise<void> {
    try {
      const git = simpleGit(repoPath)
      
      // Check if branch already exists
      const branches = await git.branchLocal()
      if (branches.all.includes(branchName)) {
        throw new RepoSyncError(`Branch ${branchName} already exists`, 'BRANCH_EXISTS')
      }
      
      // Create and checkout new branch
      await git.checkoutLocalBranch(branchName)
      gitLogger.success(`Created and checked out branch: ${branchName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      gitLogger.error(`Failed to create branch: ${message}`)
      throw new RepoSyncError(`Branch creation failed: ${message}`, 'BRANCH_FAILED')
    }
  }

  /**
   * Stage all changes and create a commit
   * 
   * Adds all modified, new, and deleted files to the staging area and creates
   * a commit with the specified message. Optionally sets the commit author.
   * 
   * @param repoPath - Path to the local repository
   * @param options - Commit configuration options
   * @returns Promise resolving to the commit hash, or 'No changes' if no changes to commit
   * @throws {RepoSyncError} When commit operation fails
   * 
   * @example
   * ```typescript
   * const commitHash = await gitService.commitChanges('/tmp/repo', {
   *   message: 'Sync from source repository v2.1.0',
   *   author: {
   *     name: 'Bot User',
   *     email: 'bot@company.com'
   *   }
   * })
   * console.log(`Created commit: ${commitHash}`)
   * ```
   */
  async commitChanges(repoPath: string, options: CommitOptions): Promise<string> {
    try {
      const git = simpleGit(repoPath)
      
      // Check if there are any changes
      const status = await git.status()
      if (status.files.length === 0) {
        gitLogger.info('No changes to commit')
        return 'No changes'
      }
      
      // Add all changes
      await git.add('.')
      
      // Set author if provided
      if (options.author) {
        await git.addConfig('user.name', options.author.name)
        await git.addConfig('user.email', options.author.email)
      }
      
      // Commit changes
      const result = await git.commit(options.message)
      gitLogger.success(`Committed changes: ${result.commit}`)
      
      return result.commit
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      gitLogger.error(`Failed to commit changes: ${message}`)
      throw new RepoSyncError(`Commit failed: ${message}`, 'COMMIT_FAILED')
    }
  }

  /**
   * Push a local branch to the remote repository
   * 
   * Pushes the specified branch to the remote repository with upstream tracking.
   * Sets up the local branch to track the remote branch for future operations.
   * 
   * @param repoPath - Path to the local repository
   * @param branchName - Name of the branch to push
   * @param remoteName - Name of the remote (default: 'origin')
   * @returns Promise that resolves when push is complete
   * @throws {RepoSyncError} When push operation fails
   * 
   * @example
   * ```typescript
   * await gitService.pushBranch('/tmp/repo', 'feature/sync-changes')
   * // Branch is now available on the remote repository
   * ```
   */
  async pushBranch(repoPath: string, branchName: string, remoteName = 'origin'): Promise<void> {
    try {
      const git = simpleGit(repoPath)
      
      // Push branch with upstream tracking
      await git.push(['-u', remoteName, branchName])
      gitLogger.success(`Pushed branch ${branchName} to ${remoteName}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      gitLogger.error(`Failed to push branch: ${message}`)
      throw new RepoSyncError(`Push failed: ${message}`, 'PUSH_FAILED')
    }
  }

  /**
   * Get comprehensive information about a local repository
   * 
   * Retrieves current branch, remote URL, and latest commit information
   * from the specified repository.
   * 
   * @param repoPath - Path to the local repository
   * @returns Promise resolving to repository information object
   * @throws {RepoSyncError} When repository information cannot be retrieved
   * 
   * @example
   * ```typescript
   * const info = await gitService.getRepositoryInfo('/tmp/repo')
   * console.log(`Current branch: ${info.currentBranch}`)
   * console.log(`Remote URL: ${info.remoteUrl}`)
   * console.log(`Last commit: ${info.lastCommit}`)
   * ```
   */
  async getRepositoryInfo(repoPath: string): Promise<{
    currentBranch: string
    remoteUrl: string
    lastCommit: string
  }> {
    try {
      const git = simpleGit(repoPath)
      
      const status = await git.status()
      const remotes = await git.getRemotes(true)
      const log = await git.log({ maxCount: 1 })
      
      const originRemote = remotes.find(r => r.name === 'origin')
      
      return {
        currentBranch: status.current || 'unknown',
        remoteUrl: originRemote?.refs?.fetch || 'unknown',
        lastCommit: log.latest?.hash || 'unknown'
      }
    } catch (error) {
      throw new RepoSyncError('Failed to get repository info', 'REPO_INFO_FAILED')
    }
  }

  /**
   * Generate a timestamped branch name
   * 
   * Creates a unique branch name using the current timestamp with milliseconds.
   * Format: `{prefix}/{YYYY-MM-DD-HHMMSS-mmm}`
   * 
   * @param prefix - Prefix for the branch name (default: 'release')
   * @returns A unique timestamped branch name
   * 
   * @example
   * ```typescript
   * const branchName = gitService.generateBranchName('sync')
   * console.log(branchName) // e.g., 'sync/2023-12-01-143022-123'
   * 
   * const releaseBranch = gitService.generateBranchName()
   * console.log(releaseBranch) // e.g., 'release/2023-12-01-143022-456'
   * ```
   */
  generateBranchName(prefix = 'release'): string {
    const now = new Date()
    const datePart = now.toISOString().split('T')[0]
    const timePart = now.toTimeString().split(' ')[0].replace(/:/g, '')
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0')
    
    return `${prefix}/${datePart}-${timePart}-${milliseconds}`
  }

  /**
   * Ensure a directory exists, creating it if necessary
   * 
   * Creates the directory and any necessary parent directories.
   * Safe to call even if the directory already exists.
   * 
   * @param dirPath - Path to the directory to create
   * @returns Promise that resolves when directory exists
   * @private
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      const { mkdir } = await import('fs/promises')
      await mkdir(dirPath, { recursive: true })
    } catch (error) {
      // Directory might already exist, that's okay
    }
  }
}