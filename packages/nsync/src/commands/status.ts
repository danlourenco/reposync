import { defineCommand } from 'citty'
import { ConfigManager } from '../core/config.js'
import { SystemValidator } from '../utils/validator.js'
import consola, { configLogger, log } from '../utils/logger.js'

export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Show current system status and configuration',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to configuration file',
      alias: 'c',
    },
  },
  async run({ args }) {
    try {
      configLogger.info('🔄 Checking system status')

      // Check system prerequisites
      const validator = new SystemValidator()
      const systemStatus = await validator.validatePrerequisites()

      console.log('\n📋 System Prerequisites:')
      for (const [tool, status] of Object.entries(systemStatus)) {
        const icon = status ? '✅' : '❌'
        console.log(`  ${icon} ${tool}`)
      }

      // Check GitHub authentication
      try {
        const authStatus = await validator.validateGitHubAuth()
        console.log(`  ${authStatus ? '✅' : '❌'} GitHub CLI Authentication`)
      } catch {
        console.log('  ❌ GitHub CLI Authentication')
      }

      // Check configuration
      const configManager = new ConfigManager({ configPath: args.config })
      const config = await configManager.load()

      console.log('\n⚙️ Configuration:')
      if (config) {
        console.log(`  ✅ Configuration file: ${configManager.getConfigPath()}`)
        console.log(`  📁 Source repository: ${config.source_repo}`)
        console.log(`  🎯 Target repositories: ${config.target_repos.length}`)
        
        // Validate repository access
        configLogger.info('🔄 Validating repository access')
        try {
          await validator.validateRepositoryAccess(config.source_repo)
          console.log('  ✅ Source repository accessible')
        } catch {
          console.log('  ❌ Source repository not accessible')
        }

        let accessibleTargets = 0
        for (const target of config.target_repos) {
          try {
            await validator.validateRepositoryAccess(target.url)
            accessibleTargets++
          } catch {
            // Silent fail for status check
          }
        }
        console.log(`  ✅ Target repositories accessible: ${accessibleTargets}/${config.target_repos.length}`)
      } else {
        console.log(`  ❌ No configuration found at ${configManager.getConfigPath()}`)
        console.log('  💡 Run `reposync config set` to create a configuration')
      }

      console.log('\n🚀 Ready to sync!') 
    } catch (error) {
      configLogger.error('Status check failed:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  },
})