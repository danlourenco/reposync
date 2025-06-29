/**
 * Type definitions and validation schemas for *NSYNC CLI
 * 
 * This module contains all TypeScript interfaces, Zod validation schemas,
 * and custom error classes used throughout the *NSYNC application.
 * 
 * @fileoverview Core type definitions for repository synchronization
 */

import { z } from 'zod'

/**
 * Zod schema for validating target repository configuration
 */
export const TargetRepositorySchema = z.object({
  name: z.string().min(1, 'Repository name cannot be empty'),
  url: z.string().url('Invalid repository URL'),
})

/**
 * Zod schema for file preservation rules
 */
export const FilePreservationRuleSchema = z.object({
  files: z.array(z.string()).min(1, 'At least one file pattern is required'),
  description: z.string().optional(),
  update_rules: z.array(z.object({
    name: z.string().min(1, 'Rule name is required'),
    type: z.enum(['pattern', 'json_field', 'yaml_field', 'regex']).default('pattern'),
    pattern: z.string().optional(),
    fields: z.array(z.string()).optional(),
    version_strategy: z.enum(['replace_if_newer', 'replace_if_newer_or_equal', 'always_replace', 'never_replace']).default('replace_if_newer'),
    path: z.string().optional(),
    value: z.string().optional(),
    regex: z.string().optional(),
    replacement: z.string().optional(),
    condition: z.object({
      type: z.literal('version_compare'),
      operator: z.enum(['>=', '>', '=', '<', '<=']),
      current: z.string(),
      new: z.string()
    }).optional()
  })).min(1, 'At least one update rule is required')
})

/**
 * Zod schema for validating complete synchronization configuration
 */
export const SyncConfigSchema = z.object({
  source_repo: z.string().url('Invalid source repository URL'),
  target_repos: z.array(TargetRepositorySchema).min(1, 'At least one target repository is required'),
  github: z.object({
    api_url: z.string().url('Invalid GitHub API URL').optional(),
    token: z.string().optional()
  }).optional(),
  file_preservation: z.array(FilePreservationRuleSchema).optional(),
  template_variables: z.record(z.string()).optional()
})

/**
 * Target repository configuration
 */
export type TargetRepository = z.infer<typeof TargetRepositorySchema>

/**
 * Complete synchronization configuration
 */
export type SyncConfig = z.infer<typeof SyncConfigSchema>

/**
 * Options for sync operation execution
 */
export interface SyncOptions {
  /** Specific tag or branch to sync */
  tag?: string
  /** Enable interactive mode for configuration */
  interactive?: boolean
  /** Run in preview mode without making changes */
  dryRun?: boolean
  /** Path to configuration file */
  configPath?: string
  /** Whether to save configuration after sync */
  saveConfig?: boolean
  /** Enable verbose output */
  verbose?: boolean
}

/**
 * Result of synchronizing a single target repository
 */
export interface SyncResult {
  /** The target repository that was processed */
  repository: TargetRepository
  /** Whether the sync operation succeeded */
  success: boolean
  /** Name of the created release branch */
  branchName?: string
  /** URL of the created pull request */
  prUrl?: string
  /** Error message if sync failed */
  error?: string
  /** Message for successful operations without PRs */
  message?: string
  /** File sync details for dry-run display */
  fileDetails?: {
    filesAdded: string[]
    filesModified: string[]
    filesPreserved: string[]
    filesExcluded: string[]
  }
  /** File update details for preserved files */
  preservedFileChanges?: Array<{
    filePath: string
    changes: Array<{
      rule: string
      oldValue: string
      newValue: string
    }>
  }>
}

/**
 * Summary of complete sync operation across all repositories
 */
export interface SyncSummary {
  /** Tag or branch that was synced */
  tag: string
  /** ISO timestamp of sync operation */
  timestamp: string
  /** Name of the release branch created */
  branchName: string
  /** Results for each target repository */
  results: SyncResult[]
  /** Total number of repositories processed */
  totalRepositories: number
  /** Number of successful syncs */
  successCount: number
  /** Number of failed syncs */
  failureCount: number
}

/**
 * Git tag information from repository
 */
export interface GitTag {
  /** Tag name (e.g., 'v2.1.0') */
  name: string
  /** Commit SHA that the tag points to */
  commit: string
  /** Commit date (ISO string or 'unknown') */
  date: string
}

/**
 * Parsed repository information from URL
 */
export interface RepoInfo {
  /** Repository owner or organization */
  owner: string
  /** Repository name */
  name: string
  /** Full repository name in 'owner/name' format */
  fullName: string
}

/**
 * Custom error class for repository synchronization operations
 * 
 * Provides structured error handling with error codes and optional
 * repository context for better debugging and user feedback.
 * 
 * @example
 * ```typescript
 * throw new RepoSyncError(
 *   'Failed to clone repository',
 *   'CLONE_FAILED',
 *   'https://github.com/user/repo.git'
 * )
 * ```
 */
export class RepoSyncError extends Error {
  /**
   * Create a new RepoSyncError
   * 
   * @param message - Human-readable error message
   * @param code - Machine-readable error code for categorization
   * @param repository - Optional repository URL or identifier for context
   */
  constructor(
    message: string,
    public code: string,
    public repository?: string,
  ) {
    super(message)
    this.name = 'RepoSyncError'
  }
}

/**
 * User repository information from GitHub API
 */
export interface UserRepository {
  /** Repository ID */
  id: number
  /** Repository name */
  name: string
  /** Full name (owner/repo) */
  full_name: string
  /** Repository description */
  description: string | null
  /** Whether repository is private */
  private: boolean
  /** HTTPS clone URL */
  clone_url: string
  /** SSH clone URL */
  ssh_url: string
  /** HTML URL for repository */
  html_url: string
  /** Whether repository is archived */
  archived: boolean
  /** Whether repository is disabled */
  disabled: boolean
  /** Whether repository is a fork */
  fork: boolean
  /** Default branch name */
  default_branch: string
  /** Last updated timestamp */
  updated_at: string
  /** Last pushed timestamp */
  pushed_at: string | null
  /** Repository permissions for authenticated user */
  permissions?: {
    admin: boolean
    maintain?: boolean
    push: boolean
    triage?: boolean
    pull: boolean
  }
}

/**
 * Repository search result from GitHub API
 */
export interface RepositorySearchResult {
  /** Total number of results */
  total_count: number
  /** Whether results are incomplete */
  incomplete_results: boolean
  /** Array of matching repositories */
  items: UserRepository[]
}