import { cp, readdir, stat, readFile, writeFile, mkdir } from 'fs/promises'
import { join, resolve, relative, dirname } from 'pathe'
import { existsSync } from 'fs'
import consola, { fileLogger, log } from '../utils/logger.js'
import { RepoSyncError } from './types.js'
import { FileUpdateService, type FilePreservationRule } from './file-update.js'

/**
 * Options for directory synchronization
 */
export interface SyncOptions {
  /** Source directory to sync from */
  sourceDir: string
  /** Target directory to sync to */
  targetDir: string
  /** Files to preserve during sync (default: InfrastructureAsCodeFile variants) */
  preserveFiles?: string[]
  /** Patterns to exclude from sync (default: .git, node_modules, etc.) */
  excludePatterns?: string[]
  /** Whether to run in dry-run mode without making changes */
  dryRun?: boolean
}

/**
 * Result of directory synchronization operation
 */
export interface SyncResult {
  /** List of files that were added */
  filesAdded: string[]
  /** List of files that were modified */
  filesModified: string[]
  /** List of files that were preserved */
  filesPreserved: string[]
  /** List of files that were excluded */
  filesExcluded: string[]
}

/**
 * File synchronization service for repository sync operations
 * 
 * Handles intelligent file synchronization between directories with support for:
 * - File preservation (InfrastructureAsCodeFile, configuration files)
 * - Pattern-based exclusion (.git, node_modules, etc.)
 * - Version updates in preserved files
 * - Backup and restore operations
 * - Dry-run mode for previewing changes
 * 
 * The service ensures that repository-specific configurations are preserved
 * while synchronizing all other files from the source repository.
 * 
 * @example
 * ```typescript
 * const fileSyncService = new FileSyncService()
 * 
 * // Sync directories with default settings
 * const result = await fileSyncService.syncDirectories({
 *   sourceDir: '/tmp/source-repo',
 *   targetDir: '/tmp/target-repo',
 *   dryRun: false
 * })
 * 
 * console.log(`Added: ${result.filesAdded.length}, Modified: ${result.filesModified.length}`)
 * console.log(`Preserved: ${result.filesPreserved.join(', ')}`)
 * 
 * // Update version references in infrastructure files
 * const updated = await fileSyncService.updateInfrastructureFileVersions(
 *   '/tmp/target-repo',
 *   '2.1.0'
 * )
 * ```
 */
export class FileSyncService {
  private readonly DEFAULT_EXCLUDES = [
    '.git',
    '.github',
    'node_modules',
    '.DS_Store',
    'Thumbs.db',
    '*.log',
    '.env',
    '.env.local'
  ]

  private readonly DEFAULT_PRESERVES = [
    'InfrastructureAsCodeFile',
    'InfrastructureAsCodeFile.yml',
    'InfrastructureAsCodeFile.yaml'
  ]

  private fileUpdateService: FileUpdateService

  constructor(filePreservationRules: FilePreservationRule[] = []) {
    this.fileUpdateService = new FileUpdateService(filePreservationRules)
  }

  /**
   * Synchronize files from source to target directory
   * 
   * Performs intelligent directory synchronization with file preservation,
   * pattern-based exclusion, and backup/restore operations. Preserves
   * repository-specific configuration files while updating all other content.
   * 
   * @param options - Synchronization configuration options
   * @returns Promise resolving to sync result with file operation details
   * @throws {RepoSyncError} When synchronization fails
   * 
   * @example
   * ```typescript
   * // Basic sync with defaults
   * const result = await fileSyncService.syncDirectories({
   *   sourceDir: '/tmp/source',
   *   targetDir: '/tmp/target'
   * })
   * 
   * // Custom sync with additional preserved files
   * const customResult = await fileSyncService.syncDirectories({
   *   sourceDir: '/tmp/source',
   *   targetDir: '/tmp/target',
   *   preserveFiles: ['InfrastructureAsCodeFile', 'local-config.yml'],
   *   excludePatterns: ['.git', 'node_modules', '*.log'],
   *   dryRun: true
   * })
   * ```
   */
  async syncDirectories(options: SyncOptions): Promise<SyncResult> {
    const {
      sourceDir,
      targetDir,
      preserveFiles = this.DEFAULT_PRESERVES,
      excludePatterns = this.DEFAULT_EXCLUDES,
      dryRun = false
    } = options

    fileLogger.info(`🔄 ${dryRun ? 'Previewing' : 'Synchronizing'} files from ${sourceDir} to ${targetDir}`)

    const result: SyncResult = {
      filesAdded: [],
      filesModified: [],
      filesPreserved: [],
      filesExcluded: []
    }

    try {
      // Backup preserved files first
      const preservedFiles = await this.backupPreservedFiles(targetDir, preserveFiles, dryRun)
      result.filesPreserved = preservedFiles

      // Get all files from source
      const sourceFiles = await this.getAllFiles(sourceDir)
      
      // Process each file
      for (const sourceFile of sourceFiles) {
        const relativePath = relative(sourceDir, sourceFile)
        const targetFile = join(targetDir, relativePath)
        
        if (this.shouldExclude(relativePath, excludePatterns, preserveFiles)) {
          result.filesExcluded.push(relativePath)
          continue
        }

        try {
          if (!dryRun) {
            // Ensure target directory exists
            await mkdir(dirname(targetFile), { recursive: true })
            
            // Copy file
            await cp(sourceFile, targetFile, { force: true })
          }

          // Determine if file was added or modified
          if (existsSync(targetFile)) {
            result.filesModified.push(relativePath)
          } else {
            result.filesAdded.push(relativePath)
          }
        } catch (error) {
          fileLogger.warn(`Failed to sync file ${relativePath}: ${error}`)
        }
      }

      // Restore preserved files
      if (!dryRun) {
        await this.restorePreservedFiles(targetDir, preservedFiles)
      }

      this.logSyncResults(result, dryRun)
      return result

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new RepoSyncError(`File sync failed: ${message}`, 'SYNC_FAILED')
    }
  }

  /**
   * Backup files that should be preserved during sync
   * 
   * Creates backup copies of files that need to be preserved before
   * synchronization. Backup files are stored with .nsync-backup extension.
   * 
   * @param targetDir - Target directory containing files to preserve
   * @param preserveFiles - List of filenames to preserve
   * @param dryRun - Whether running in dry-run mode
   * @returns Promise resolving to list of files that were backed up
   * @private
   */
  private async backupPreservedFiles(targetDir: string, preserveFiles: string[], dryRun: boolean): Promise<string[]> {
    const backedUpFiles: string[] = []

    for (const fileName of preserveFiles) {
      const filePath = join(targetDir, fileName)
      
      if (existsSync(filePath)) {
        if (!dryRun) {
          const backupPath = `${filePath}.nsync-backup`
          await cp(filePath, backupPath, { force: true })
          fileLogger.debug(`Backed up preserved file: ${fileName}`)
        }
        backedUpFiles.push(fileName)
      }
    }

    return backedUpFiles
  }

  /**
   * Restore preserved files after sync
   * 
   * Restores previously backed up files and cleans up backup files.
   * This ensures preserved files are not overwritten during sync.
   * 
   * @param targetDir - Target directory to restore files to
   * @param preservedFiles - List of files to restore from backup
   * @returns Promise that resolves when all files are restored
   * @private
   */
  private async restorePreservedFiles(targetDir: string, preservedFiles: string[]): Promise<void> {
    for (const fileName of preservedFiles) {
      const originalPath = join(targetDir, fileName)
      const backupPath = `${originalPath}.nsync-backup`
      
      if (existsSync(backupPath)) {
        await cp(backupPath, originalPath, { force: true })
        
        // Remove backup file
        try {
          const { rm } = await import('fs/promises')
          await rm(backupPath)
        } catch {
          // Ignore cleanup errors
        }
        
        fileLogger.debug(`Restored preserved file: ${fileName}`)
      }
    }
  }

  /**
   * Get all files recursively from a directory
   * 
   * Recursively traverses the directory tree and returns all file paths.
   * Directories are not included in the result.
   * 
   * @param dirPath - Directory to scan recursively
   * @returns Promise resolving to array of all file paths
   * @private
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    
    const entries = await readdir(dirPath)
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry)
      const stats = await stat(fullPath)
      
      if (stats.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath)
        files.push(...subFiles)
      } else {
        files.push(fullPath)
      }
    }
    
    return files
  }

  /**
   * Check if a file should be excluded from sync
   * 
   * Determines whether a file should be excluded based on preserve rules
   * and exclude patterns. Preserved files at root level are excluded.
   * 
   * @param relativePath - Relative path of the file
   * @param excludePatterns - Patterns to exclude (glob-like)
   * @param preserveFiles - Files to preserve (exclude from sync)
   * @returns True if the file should be excluded
   * @private
   */
  private shouldExclude(relativePath: string, excludePatterns: string[], preserveFiles: string[]): boolean {
    // Check if it's a preserved file (but at root level only)
    const fileName = relativePath.split('/').pop() || ''
    if (preserveFiles.includes(fileName) && !relativePath.includes('/')) {
      return true
    }

    // Check exclude patterns
    for (const pattern of excludePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true
      }
    }

    return false
  }

  /**
   * Simple pattern matching for file exclusion
   * 
   * Converts glob-like patterns to regular expressions and tests file paths.
   * Supports * (wildcard) and ? (single character) patterns.
   * 
   * @param filePath - File path to test
   * @param pattern - Glob-like pattern to match against
   * @returns True if the file path matches the pattern
   * @private
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob-like patterns to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    
    const regex = new RegExp(`^${regexPattern}$`)
    
    // Check if the file path or any part of it matches
    const parts = filePath.split('/')
    
    return parts.some(part => regex.test(part)) || regex.test(filePath)
  }

  /**
   * Update preserved files using the generic file update DSL
   * 
   * Applies all configured file preservation rules to update files
   * based on the new sync version and template variables.
   * 
   * @param targetDir - Directory containing files to update
   * @param newVersion - New version from the sync tag
   * @param templateVars - Additional template variables
   * @param dryRun - Whether to preview changes without applying them
   * @returns Promise resolving to array of file update results
   * 
   * @example
   * ```typescript
   * const results = await fileSyncService.updatePreservedFiles(
   *   '/tmp/target-repo',
   *   '2.1.0',
   *   { tag: 'v2.1.0', tag_without_v: '2.1.0' },
   *   false
   * )
   * 
   * console.log(`Updated ${results.filter(r => r.modified).length} files`)
   * ```
   */
  async updatePreservedFiles(
    targetDir: string, 
    newVersion: string,
    templateVars: Record<string, string> = {},
    dryRun = false
  ) {
    return this.fileUpdateService.updatePreservedFiles(
      targetDir,
      newVersion,
      {
        sync_version: newVersion,
        ...templateVars
      },
      dryRun
    )
  }

  /**
   * Update version references in infrastructure file configurations
   * 
   * @deprecated Use updatePreservedFiles with file preservation rules instead
   * 
   * Scans infrastructure file variants and updates version references in artifact names.
   * Supports patterns like 'my-service-1.2.3.zip' -> 'my-service-2.1.0.zip'.
   * 
   * @param targetDir - Directory containing infrastructure file configurations
   * @param newVersion - New version to update to (without 'v' prefix)
   * @param dryRun - Whether to preview changes without applying them
   * @returns Promise resolving to true if any files were updated
   * 
   * @example
   * ```typescript
   * // Update all version references to 2.1.0
   * const updated = await fileSyncService.updateInfrastructureFileVersions(
   *   '/tmp/target-repo',
   *   '2.1.0'
   * )
   * 
   * if (updated) {
   *   console.log('Infrastructure file versions updated successfully')
   * }
   * ```
   */
  async updateInfrastructureFileVersions(targetDir: string, newVersion: string, dryRun = false): Promise<boolean> {
    const infrastructureFiles = ['InfrastructureAsCodeFile', 'InfrastructureAsCodeFile.yml', 'InfrastructureAsCodeFile.yaml']
    let updated = false

    for (const filename of infrastructureFiles) {
      const filePath = join(targetDir, filename)
      
      if (existsSync(filePath)) {
        try {
          const content = await readFile(filePath, 'utf-8')
          
          // Pattern to match remote_artifact version references
          // Example: my-api-0.1.44.zip -> my-api-0.1.78.zip
          const versionPattern = /(\w+-)(\d+\.\d+\.\d+)(\.zip|\.jar|\.tar\.gz)/g
          const newContent = content.replace(versionPattern, `$1${newVersion}$3`)
          
          if (newContent !== content) {
            if (!dryRun) {
              await writeFile(filePath, newContent, 'utf-8')
              fileLogger.success(`Updated versions in ${filename}`)
            } else {
              fileLogger.info(`Would update versions in ${filename}`)
            }
            updated = true
          }
        } catch (error) {
          fileLogger.warn(`Failed to update versions in ${filename}: ${error}`)
        }
      }
    }

    return updated
  }


  /**
   * Extract version from tag name
   * 
   * Removes common prefixes like 'v' from tag names to get clean version strings.
   * 
   * @param tagName - Git tag name (e.g., 'v2.1.0', '2.1.0')
   * @returns Clean version string (e.g., '2.1.0')
   * 
   * @example
   * ```typescript
   * const version1 = fileSyncService.extractVersionFromTag('v2.1.0')
   * console.log(version1) // '2.1.0'
   * 
   * const version2 = fileSyncService.extractVersionFromTag('2.1.0')
   * console.log(version2) // '2.1.0'
   * ```
   */
  extractVersionFromTag(tagName: string): string {
    // Remove 'v' prefix if present
    return tagName.replace(/^v/, '')
  }

  /**
   * Log sync results summary
   * 
   * Outputs a summary of the sync operation including file counts
   * and details about preserved and excluded files.
   * 
   * @param result - Sync result to log
   * @param dryRun - Whether this was a dry-run operation
   * @private
   */
  private logSyncResults(result: SyncResult, dryRun: boolean): void {
    const action = dryRun ? 'Would sync' : 'Synchronized'
    
    fileLogger.info(`${action} ${result.filesAdded.length + result.filesModified.length} files`)
    
    if (result.filesAdded.length > 0) {
      fileLogger.debug(`Files added: ${result.filesAdded.length}`)
    }
    
    if (result.filesModified.length > 0) {
      fileLogger.debug(`Files modified: ${result.filesModified.length}`)
    }
    
    if (result.filesPreserved.length > 0) {
      fileLogger.info(`Preserved files: ${result.filesPreserved.join(', ')}`)
    }
    
    if (result.filesExcluded.length > 0) {
      fileLogger.debug(`Excluded files: ${result.filesExcluded.length}`)
    }
  }
}