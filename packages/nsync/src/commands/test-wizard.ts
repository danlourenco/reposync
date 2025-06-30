import { defineCommand } from 'citty'
import { ConfigManager } from '../core/config.js'
import { ConfigurationWizard } from '../core/wizard.js'
import log from '../utils/logger.js'

export const testWizardCommand = defineCommand({
  meta: {
    name: 'test-wizard',
    description: 'Test the interactive configuration wizard (development only)',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to configuration file',
      alias: 'c',
    },
    force: {
      type: 'boolean',
      description: 'Overwrite existing configuration without confirmation',
      alias: 'f',
    },
  },
  async run({ args }) {
    try {
      log.info('🧪 Testing Configuration Wizard...')
      
      const configManager = new ConfigManager({ configPath: args.config })
      const wizard = new ConfigurationWizard(configManager)
      
      const config = await wizard.run({ force: args.force })
      
      log.success('✅ Wizard test completed successfully!')
      log.info('Configuration created:')
      console.log(JSON.stringify(config, null, 2))
      
    } catch (error) {
      log.error('❌ Wizard test failed:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  },
})