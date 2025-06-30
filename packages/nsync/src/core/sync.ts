import { ConfigManager } from './config.js'
import { ConfigurationWizard } from './wizard.js'
import { GitService } from './git.js'
import { GitHubService } from './github.js'
import { FileSyncService } from './file-sync.js'
import { SyncOptions, SyncSummary, SyncResult, TargetRepository, SyncConfig, RepoSyncError } from './types.js'
import consola, { syncLogger, gitLogger, githubLogger, operation } from '../utils/logger.js'

/**
 * Main synchronization service that orchestrates the sync workflow
 * 
 * The SyncService coordinates all aspects of repository synchronization including:
 * - Configuration loading and validation
 * - Source repository cloning
 * - Tag selection (interactive or automatic)
 * - Target repository processing
 * - File synchronization with preservation
 * - Branch creation and push operations
 * - Pull request creation with comprehensive descriptions
 * 
 * Supports both dry-run mode for preview and full execution mode.
 * Handles enterprise GitHub configurations and temporary directory cleanup.
 * 
 * @example
 * ```typescript
 * const configManager = new ConfigManager({ configPath: './sync-config.json' })
 * const syncService = new SyncService(configManager)
 * 
 * // Execute sync with specific tag
 * const summary = await syncService.execute({
 *   tag: 'v2.1.0',
 *   dryRun: false
 * })
 * 
 * console.log(`Synced ${summary.successCount}/${summary.totalRepositories} repositories`)
 * summary.results.forEach(result => {
 *   if (result.success && result.prUrl) {
 *     console.log(`✓ ${result.repository.name}: ${result.prUrl}`)
 *   }
 * })
 * ```
 */
export class SyncService {
  private gitService: GitService
  private githubService: GitHubService
  private fileSyncService: FileSyncService

  /**
   * Create a new SyncService instance
   * 
   * @param configManager - Configuration manager for loading sync settings
   */
  constructor(private configManager: ConfigManager) {
    this.gitService = new GitService()
    // FileSyncService will be initialized with file preservation rules from config
    this.fileSyncService = new FileSyncService()
    // GitHub service will be initialized with config
    this.githubService = new GitHubService()
  }

  /**
   * Execute repository synchronization workflow
   * 
   * Main entry point for the synchronization process. Handles the complete workflow
   * from configuration loading to pull request creation. Supports dry-run mode for
   * preview without making actual changes.
   * 
   * @param options - Sync configuration options
   * @returns Promise resolving to sync summary with results for all repositories
   * @throws {RepoSyncError} When configuration is missing or sync fails
   * 
   * @example
   * ```typescript
   * // Dry run to preview changes
   * const preview = await syncService.execute({
   *   tag: 'v2.1.0',
   *   dryRun: true
   * })
   * 
   * // Execute actual sync
   * const result = await syncService.execute({
   *   tag: 'v2.1.0',
   *   dryRun: false
   * })
   * 
   * if (result.failureCount > 0) {
   *   console.error(`${result.failureCount} repositories failed to sync`)
   * }
   * ```
   */
  async execute(options: SyncOptions): Promise<SyncSummary> {
    if (options.verbose) {
      if (options.dryRun) {
        syncLogger.start('NSYNC Sync Preview Mode')
      } else {
        syncLogger.start('Starting repository synchronization')
      }
    } else {
      // Simple output for non-verbose mode using consola semantics
      if (options.dryRun) {
        consola.info('Preview mode - no changes will be made')
      } else {
        consola.info('Synchronizing repositories...')
      }
    }

    // Handle custom config path
    if (options.configPath) {
      this.configManager.setConfigPath(options.configPath)
    }

    // Load configuration
    let config = await this.configManager.load()
    
    if (!config && !options.interactive) {
      throw new RepoSyncError('No configuration found. Run with --interactive or use "nsync config set" first.', 'CONFIG_NOT_FOUND')
    }

    if (!config || options.interactive) {
      const wizard = new ConfigurationWizard(this.configManager)
      config = await wizard.run({ force: options.interactive })
    }

    // Initialize services with config
    if (config.github?.api_url || config.github?.token) {
      this.githubService = new GitHubService({
        baseUrl: config.github.api_url,
        token: config.github.token
      })
    }
    
    // Initialize FileSyncService with file preservation rules
    if (config.file_preservation) {
      this.fileSyncService = new FileSyncService(config.file_preservation)
    }

    // Generate branch name with timestamp
    const branchName = this.gitService.generateBranchName()
    const timestamp = new Date().toISOString()

    // Get selected tag with interactive selection
    let selectedTag = options.tag
    if (!selectedTag) {
      selectedTag = await this.selectTag(config.source_repo, options.dryRun, options.interactive)
    }
    
    // Show sync plan preview
    if (!options.dryRun) {
      await this.showSyncPlan(config, selectedTag, branchName)
    }

    const results: SyncResult[] = []
    let sourceDir: string | null = null
    
    try {
      // Clone source repository
      sourceDir = await this.cloneSourceRepository(config.source_repo, selectedTag, options.dryRun, options.verbose || false)
      
      // Process each target repository with progress tracking
      for (let i = 0; i < config.target_repos.length; i++) {
        const target = config.target_repos[i]
        operation.step(`Processing ${target.name}`, i + 1, config.target_repos.length)
        
        const result = await this.processTargetRepository({
          target,
          sourceDir,
          selectedTag,
          branchName,
          timestamp,
          dryRun: options.dryRun || false,
          config,
          verbose: options.verbose || false
        })
        results.push(result)
        
        if (result.success) {
          if (result.prUrl) {
            operation.success(`✅ ${target.name} - Created PR: ${result.prUrl}`)
          } else {
            operation.success(`✅ ${target.name} - ${result.message || 'Completed'}`)
          }
        } else {
          operation.fail(`❌ ${target.name} - ${result.error}`)
        }
      }

    } finally {
      // Cleanup source directory
      if (sourceDir) {
        await this.gitService.cleanupDirectory(sourceDir)
      }
    }

    const summary: SyncSummary = {
      tag: selectedTag,
      timestamp,
      branchName,
      results,
      totalRepositories: config.target_repos.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    }

    // Show success summary
    if (!options.dryRun) {
      this.showSuccessSummary(summary)
    }

    return summary
  }

  /**
   * Show sync plan preview before execution
   */
  private async showSyncPlan(config: SyncConfig, selectedTag: string, branchName: string): Promise<void> {
    console.log('\nSync Plan:')
    console.log('='.repeat(20))
    console.log(`  📥 Source: ${config.source_repo} (tag: ${selectedTag})`)
    console.log(`  📤 Targets: ${config.target_repos.length} repositories`)
    console.log(`  🌿 Branch: ${branchName}`)
    console.log(`  🔄 Action: Create PRs for each target repo`)
    console.log(`  🛡️  Preserve: ${config.file_preservation?.length || 0} file rules configured`)
    console.log('')

    // List target repositories
    if (config.target_repos.length <= 10) {
      console.log('Target repositories:')
      config.target_repos.forEach((repo, i) => {
        console.log(`  ${i + 1}. ${repo.name}`)
      })
      console.log('')
    }

    const confirmed = await consola.prompt('Continue with sync and PR creation? (y/N)', {
      type: 'confirm',
      initial: false
    })

    if (!confirmed) {
      syncLogger.info('Sync cancelled by user')
      process.exit(0)
    }
  }

  /**
   * Show success summary with PR links and celebration
   */
  private showSuccessSummary(summary: SyncSummary): void {
    console.log('\n📋 Pull Request Summary:')
    console.log('='.repeat(50))
    
    summary.results.forEach(result => {
      if (result.success && result.prUrl) {
        console.log(`  📋 ${result.repository.name}: ${result.prUrl}`)
      }
    })

    console.log('')
    
    if (summary.successCount === summary.totalRepositories) {
      console.log('🎉 All repositories synced successfully!')
      console.log('Review the pull requests above and merge when ready.')
    } else {
      operation.warn(`Sync completed: ${summary.successCount}/${summary.totalRepositories} repositories processed successfully`)
      if (summary.failureCount > 0) {
        console.log('❌ Some repositories failed. Check the logs above for details.')
      }
    }
  }

  /**
   * Select a tag from the source repository
   * 
   * Fetches available tags and selects the most recent one. In interactive mode,
   * presents a list of tags for user selection. In dry-run mode, defaults to 'main' branch.
   * 
   * @param sourceRepo - Source repository URL
   * @param dryRun - Whether running in dry-run mode
   * @param interactive - Whether to show interactive tag selection
   * @returns Promise resolving to selected tag or branch name
   * @private
   */
  private async selectTag(sourceRepo: string, dryRun: boolean, interactive?: boolean): Promise<string> {
    try {
      if (dryRun) {
        syncLogger.info('Using default branch for dry run')
        return 'main'
      }

      // Fetch available tags
      const tags = await this.githubService.fetchTags(sourceRepo, 20)
      
      if (tags.length === 0) {
        syncLogger.warn('No tags found, using main branch')
        return 'main'
      }

      // Interactive tag selection
      if (interactive) {
        console.log('\nAvailable tags from source repository (showing recent 20):')
        console.log('='.repeat(65))
        console.log(`${'#'.padEnd(4)} ${'Tag'.padEnd(25)} ${'Commit'.padEnd(10)} Date`)
        console.log('-'.repeat(65))
        
        const displayTags = tags.slice(0, 20)
        displayTags.forEach((tag, i) => {
          const commitShort = tag.commit?.substring(0, 7) || 'unknown'
          const date = tag.date ? new Date(tag.date).toLocaleDateString() : 'unknown'
          console.log(`${(i + 1).toString().padEnd(4)} ${tag.name.padEnd(25)} ${commitShort.padEnd(10)} ${date}`)
        })
        
        const options = [
          { label: 'main (latest) - Use the main branch', value: 'main' },
          ...displayTags.map((tag, i) => ({
            label: `${i + 1}. ${tag.name} (${tag.commit?.substring(0, 7) || 'unknown'}) - ${tag.date ? new Date(tag.date).toLocaleDateString() : 'unknown'}`,
            value: tag.name
          }))
        ]

        return await consola.prompt('\nSelect tag/branch to sync:', {
          type: 'select',
          options,
          initial: tags[0]?.name || 'main',
          cancel: 'default'
        })
      }

      // Auto-select latest tag
      const latestTag = tags[0]
      syncLogger.info(`Using latest tag: ${latestTag.name}`)
      return latestTag.name

    } catch (error) {
      syncLogger.warn(`Failed to fetch tags, using main branch: ${error}`)
      return 'main'
    }
  }

  /**
   * Clone the source repository at the specified tag
   * 
   * Creates a temporary directory and clones the source repository,
   * checking out the specified tag or branch.
   * 
   * @param repoUrl - Source repository URL
   * @param tag - Tag or branch to checkout
   * @param dryRun - Whether running in dry-run mode (returns mock path)
   * @returns Promise resolving to the cloned repository directory path
   * @private
   */
  private async cloneSourceRepository(repoUrl: string, tag: string, dryRun: boolean, verbose: boolean): Promise<string> {
    if (verbose || dryRun) {
      syncLogger.info(`🔄 Cloning source repository: ${repoUrl}${dryRun ? ' (for preview)' : ''}`)
    }
    
    const tempDir = await this.gitService.createTempDirectory('nsync-source-')
    
    await this.gitService.cloneRepository({
      url: repoUrl,
      tag: tag === 'main' ? undefined : tag,
      branch: tag === 'main' ? 'main' : undefined,
      targetDir: tempDir
    })

    return tempDir
  }

  /**
   * Process a single target repository for synchronization
   * 
   * Handles the complete sync workflow for one target repository:
   * 1. Clone target repository
   * 2. Create release branch
   * 3. Sync files from source
   * 4. Update infrastructure file versions
   * 5. Commit changes
   * 6. Push branch
   * 7. Create pull request
   * 
   * @param params - Target repository processing parameters
   * @returns Promise resolving to sync result for this repository
   * @private
   */
  private async processTargetRepository(params: {
    target: TargetRepository
    sourceDir: string
    selectedTag: string
    branchName: string
    timestamp: string
    dryRun: boolean
    config: SyncConfig
    verbose: boolean
  }): Promise<SyncResult> {
    const { target, sourceDir, selectedTag, branchName, timestamp, dryRun, config, verbose } = params

    try {
      if (verbose) {
        syncLogger.info(`🔄 Processing ${target.name}`)
      }

      // For dry-run, we still need to clone and analyze, just don't push
      // Clone target repository
      const targetTempDir = await this.gitService.createTempDirectory('nsync-target-')
      
      try {
        await this.gitService.cloneRepository({
          url: target.url,
          targetDir: targetTempDir
        })

        // Create release branch
        await this.gitService.createBranch(targetTempDir, branchName)

        // Sync files from source to target (dry-run for preview)
        const syncResult = await this.fileSyncService.syncDirectories({
          sourceDir,
          targetDir: targetTempDir,
          dryRun: dryRun
        })

        // Update preserved files using new DSL system
        const version = this.fileSyncService.extractVersionFromTag(selectedTag)
        const templateVars = {
          tag: selectedTag,
          tag_without_v: version,
          sync_version: version,
          ...(config.template_variables || {})
        }
        
        const updateResults = await this.fileSyncService.updatePreservedFiles(
          targetTempDir,
          version,
          templateVars,
          dryRun
        )
        
        // Apply augmentation rules
        const augmentationContext = {
          tag: selectedTag,
          version: version,
          ...templateVars
        }
        const augmentedCount = await this.fileSyncService.augmentFiles(
          targetTempDir,
          augmentationContext,
          dryRun
        )
        
        const infrastructureFileUpdated = updateResults.some(r => r.modified) || augmentedCount > 0
        
        // Collect preserved file changes for dry-run display
        const preservedFileChanges = updateResults
          .filter(r => r.modified)
          .map(r => ({
            filePath: r.filePath,
            changes: r.changes
          }))

        if (dryRun) {
          syncLogger.info(`🔍 Preview: Would sync to ${target.name} (${target.url})`)
          return {
            repository: target,
            success: true,
            branchName,
            message: 'Would create draft pull request',
            fileDetails: {
              filesAdded: syncResult.filesAdded,
              filesModified: syncResult.filesModified,
              filesPreserved: syncResult.filesPreserved,
              filesExcluded: syncResult.filesExcluded
            },
            preservedFileChanges
          }
        }

        // Commit changes
        const commitMessage = this.generateCommitMessage(selectedTag, timestamp, infrastructureFileUpdated)
        const commitHash = await this.gitService.commitChanges(targetTempDir, {
          message: commitMessage
        })

        if (commitHash === 'No changes') {
          syncLogger.warn(`No changes detected for ${target.name}`)
          return {
            repository: target,
            success: true,
            branchName,
            error: 'No changes detected'
          }
        }

        // Push branch
        await this.gitService.pushBranch(targetTempDir, branchName)

        // Create pull request
        const repoInfo = this.githubService.parseRepositoryUrl(target.url)
        const prResult = await this.githubService.createPullRequest({
          owner: repoInfo.owner,
          repo: repoInfo.name,
          title: `Sync from ${selectedTag}`,
          body: this.githubService.generatePRDescription({
            sourceRepo: config.source_repo,
            sourceTag: selectedTag,
            branchName,
            timestamp,
            infrastructureFileUpdated,
            filesAdded: syncResult.filesAdded.length,
            filesModified: syncResult.filesModified.length,
            filesPreserved: syncResult.filesPreserved.length
          }),
          head: branchName,
          base: 'main',
          draft: true
        })

        syncLogger.success(`✓ ${target.name} - Created PR #${prResult.number}`)

        return {
          repository: target,
          success: true,
          branchName,
          prUrl: prResult.url
        }

      } finally {
        // Cleanup target directory
        await this.gitService.cleanupDirectory(targetTempDir)
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      syncLogger.error(`✗ ${target.name} - ${message}`)
      
      return {
        repository: target,
        success: false,
        error: message
      }
    }
  }

  /**
   * Generate a standardized commit message for sync operations
   * 
   * Creates a comprehensive commit message with sync details,
   * timestamp, and optional infrastructure file update information.
   * 
   * @param tag - Source tag or branch that was synced
   * @param timestamp - Sync operation timestamp
   * @param infrastructureFileUpdated - Whether infrastructure file versions were updated
   * @returns Formatted commit message
   * @private
   */
  private generateCommitMessage(tag: string, timestamp: string, infrastructureFileUpdated: boolean): string {
    const baseMessage = `Sync from ${tag}

Synchronized repository with source at tag ${tag}
Timestamp: ${timestamp}
${infrastructureFileUpdated ? 'Updated infrastructure file version references' : ''}

Generated by *NSYNC CLI`

    return baseMessage
  }
}