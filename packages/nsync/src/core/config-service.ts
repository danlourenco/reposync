import { ConfigManager } from './config.js'
import { ConfigurationWizard } from './wizard.js'
import log from '../utils/logger.js'

export class ConfigService {
  constructor(private configManager: ConfigManager) {}

  async createInteractiveConfig(options: { force?: boolean } = {}): Promise<void> {
    try {
      const wizard = new ConfigurationWizard(this.configManager)
      await wizard.run(options)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Interactive configuration failed:', message)
      throw error
    }
  }

  async validateConfig(options: { verbose?: boolean } = {}): Promise<boolean> {
    try {
      const config = await this.configManager.load()
      
      if (!config) {
        log.error('No configuration found')
        return false
      }

      if (options.verbose) {
        log.info('Configuration validation details:')
        console.log(`  Source: ${config.source_repo}`)
        console.log(`  Targets: ${config.target_repos.length}`)
        for (const target of config.target_repos) {
          console.log(`    - ${target.name}: ${target.url}`)
        }
      }

      // TODO: Add repository accessibility checks
      log.success('Configuration is valid (basic validation only)')
      return true
    } catch (error) {
      log.error('Configuration validation failed:', error)
      return false
    }
  }
}