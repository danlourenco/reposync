import { defineCommand } from 'citty'
import { ConfigManager } from '../core/config.js'
import { SyncService } from '../core/sync.js'
import { SyncSummary } from '../core/types.js'
import consola, { setVerbose, setSilent, operation, syncLogger } from '../utils/logger.js'
import boxen from 'boxen'
import chalk from 'chalk'

/**
 * Display clean dry-run preview results
 */
function displayDryRunSummary(summary: SyncSummary) {
  // Use console.log for title and separators to avoid ℹ prefix
  console.log('\nNSYNC Sync Preview')
  console.log('='.repeat(60))
  
  console.log(`\nSource: ${chalk.cyan(summary.tag)}`)
  console.log(`Branch: ${chalk.yellow(summary.branchName)}`)
  
  // Display results for each target repository
  summary.results.forEach(result => {
    if (result.success && result.fileDetails) {
      console.log(`\nTarget: ${chalk.bold(result.repository.name)}`)
      
      // File statistics
      const stats = [
        `Files to add: ${chalk.green(result.fileDetails.filesAdded.length)}`,
        `Files to modify: ${chalk.yellow(result.fileDetails.filesModified.length)}`,
        `Preserved files: ${chalk.blue(result.fileDetails.filesPreserved.length)}`,
        `Excluded files: ${chalk.gray(result.fileDetails.filesExcluded.length)}`
      ].join('\n')
      
      const statsBox = boxen(stats, {
        title: 'File Changes Summary',
        padding: 1,
        margin: { top: 1, bottom: 0, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'cyan'
      })
      
      console.log(statsBox)
      
      // Show preserved file changes with diffs
      if (result.preservedFileChanges && result.preservedFileChanges.length > 0) {
        console.log(`\n${chalk.bold('Preserved File Updates:')}`)
        
        result.preservedFileChanges.forEach(file => {
          console.log(`\n  ${chalk.blue(file.filePath)}:`)
          file.changes.forEach(change => {
            console.log(`    ${chalk.gray(change.rule)}:`)
            console.log(`      ${chalk.red('- ' + change.oldValue)}`)
            console.log(`      ${chalk.green('+ ' + change.newValue)}`)
          })
        })
      } else if (result.fileDetails.filesPreserved.length > 0) {
        console.log(`\n${chalk.gray('Note: Preserved files will be kept unchanged during sync')}`)
      }
      
      // Planned actions
      const totalFiles = result.fileDetails.filesAdded.length + result.fileDetails.filesModified.length
      const actions = [`• Create branch: ${summary.branchName}`]
      
      // Show file list if less than 10 files
      if (totalFiles > 0 && totalFiles <= 10) {
        actions.push(`• Sync ${totalFiles} file${totalFiles === 1 ? '' : 's'}:`)
        
        // List files to add
        result.fileDetails.filesAdded.forEach(file => {
          actions.push(`  ${chalk.green('+')} ${file}`)
        })
        
        // List files to modify
        result.fileDetails.filesModified.forEach(file => {
          actions.push(`  ${chalk.yellow('~')} ${file}`)
        })
      } else if (totalFiles > 10) {
        actions.push(`• Sync ${totalFiles} files`)
      }
      
      if (result.preservedFileChanges?.length) {
        actions.push(`• Update ${result.preservedFileChanges.length} preserved file${result.preservedFileChanges.length === 1 ? '' : 's'} with configured rules`)
      }
      
      actions.push(`• Create draft pull request`)
      
      const actionsContent = actions.join('\n')
      
      const actionsBox = boxen(actionsContent, {
        title: 'Planned Actions',
        padding: 1,
        margin: { top: 1, bottom: 0, left: 0, right: 0 },
        borderStyle: 'round',
        borderColor: 'green'
      })
      
      console.log('\n' + actionsBox)
    }
  })
  
  console.log('\n✅ Dry run complete - no changes made')
  console.log('💡 Run without --dry-run to execute these changes')
}

/**
 * Execute sync with clean UI using consola's elegant approach
 */
async function executeCleanSync(syncService: any, options: any): Promise<SyncSummary> {
  // Set consola to quiet mode (only show warnings and errors)
  const originalLevel = consola.level
  consola.level = 1 // Only warnings and errors
  
  try {
    operation.start('Synchronizing repositories')
    
    const summary = await syncService.execute({
      ...options,
      verbose: false // Ensure verbose is off
    })
    
    // Restore original level
    consola.level = originalLevel
    
    if (summary.successCount === summary.totalRepositories) {
      operation.success(`Successfully synced ${summary.successCount} repository`)
    } else {
      operation.fail(`Sync completed with ${summary.failureCount} error(s)`)
    }
    
    return summary
    
  } catch (error) {
    // Restore original level on error
    consola.level = originalLevel
    
    operation.fail('Sync failed')
    throw error
  }
}

/**
 * Display clean, minimal results using consola semantics
 */
function displayCleanResults(summary: SyncSummary) {
  // Only show details if there are errors or PRs to display
  if (summary.successCount === summary.totalRepositories) {
    summary.results.forEach((result) => {
      if (result.success && result.prUrl) {
        consola.info(`📝 ${result.repository.name}: ${result.prUrl}`)
      }
    })
  } else {
    // Show errors with semantic meaning
    summary.results.forEach((result) => {
      if (!result.success) {
        consola.error(`${result.repository.name}: ${result.error}`)
      }
    })
    consola.info(`\n💡 Run with --verbose to see detailed output`)
  }
}

/**
 * Display detailed sync results (verbose mode) using consola semantics
 */
function displaySyncResults(summary: SyncSummary) {
  console.log(`\nSync completed: ${summary.successCount}/${summary.totalRepositories} repositories processed`)
  
  if (summary.results.length > 0) {
    const resultLines = summary.results.map((result) => {
      if (result.success) {
        if (result.prUrl) {
          return `✅ ${result.repository.name}\n    PR: ${result.prUrl}`
        } else {
          return `✅ ${result.repository.name} - ${result.message || 'No changes'}`
        }
      } else {
        return `❌ ${result.repository.name} - ${result.error}`
      }
    }).join('\n\n')
    
    const resultsBox = boxen(resultLines, {
      title: 'Results',
      padding: 1,
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'green'
    })
    
    console.log(resultsBox)
  }
}

export const syncCommand = defineCommand({
  meta: {
    name: 'sync',
    description: 'Sync changes from source repository to target repositories',
  },
  args: {
    interactive: {
      type: 'boolean',
      description: 'Force interactive mode (ignore config file)',
      alias: 'i',
    },
    'dry-run': {
      type: 'boolean',
      description: 'Preview operations without making changes',
      alias: 'd',
    },
    'no-save': {
      type: 'boolean',
      description: "Don't save configuration for future use",
    },
    tag: {
      type: 'string',
      description: 'Specific tag to sync (skips interactive selection)',
      alias: 't',
    },
    config: {
      type: 'string',
      description: 'Path to configuration file',
      alias: 'c',
    },
    verbose: {
      type: 'boolean',
      description: 'Enable verbose output',
      alias: 'v',
    },
  },
  async run({ args }) {
    try {
      // Set consola level based on verbose flag
      setVerbose(args.verbose || false)

      const configManager = new ConfigManager({
        configPath: args.config,
        interactive: args.interactive,
        saveConfig: !args['no-save'],
      })

      const syncService = new SyncService(configManager)

      const options = {
        tag: args.tag,
        interactive: args.interactive,
        dryRun: args['dry-run'],
        configPath: args.config,
        saveConfig: !args['no-save'],
        verbose: args.verbose,
      }

      let summary: SyncSummary
      
      // Execute with appropriate UI pattern
      if (args['dry-run']) {
        summary = await syncService.execute(options)
        displayDryRunSummary(summary)
      } else if (args.verbose) {
        summary = await syncService.execute(options)
        displaySyncResults(summary)
      } else {
        summary = await executeCleanSync(syncService, options)
        displayCleanResults(summary)
      }

      if (summary.failureCount > 0) {
        process.exit(1)
      }
    } catch (error) {
      consola.error('Sync failed:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  },
})