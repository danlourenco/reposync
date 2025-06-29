import { defineCommand } from 'citty'
import { ConfigManager } from '../core/config.js'
import { ConfigService } from '../core/config-service.js'
import log from '../utils/logger.js'

export const configCommand = defineCommand({
  meta: {
    name: 'config',
    description: 'Manage configuration settings',
  },
  subCommands: {
    get: defineCommand({
      meta: {
        name: 'get',
        description: 'Display current configuration',
      },
      args: {
        config: {
          type: 'string',
          description: 'Path to configuration file',
          alias: 'c',
        },
        json: {
          type: 'boolean',
          description: 'Output in JSON format',
        },
      },
      async run({ args }) {
        try {
          const configManager = new ConfigManager({ configPath: args.config })
          const config = await configManager.load()

          if (!config) {
            log.warning('No configuration found')
            return
          }

          if (args.json) {
            console.log(JSON.stringify(config, null, 2))
          } else {
            log.info('Current configuration:')
            console.log(`Source Repository: ${config.source_repo}`)
            console.log(`Target Repositories (${config.target_repos.length}):`)
            for (const repo of config.target_repos) {
              console.log(`  - ${repo.name}: ${repo.url}`)
            }
            console.log(`Configuration file: ${configManager.getConfigPath()}`)
          }
        } catch (error) {
          log.error('Failed to get configuration:', error instanceof Error ? error.message : String(error))
          process.exit(1)
        }
      },
    }),

    set: defineCommand({
      meta: {
        name: 'set',
        description: 'Create or update configuration interactively',
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
          const configManager = new ConfigManager({ configPath: args.config })
          const configService = new ConfigService(configManager)

          await configService.createInteractiveConfig({ force: args.force })
          log.success('Configuration updated successfully')
        } catch (error) {
          log.error('Failed to set configuration:', error instanceof Error ? error.message : String(error))
          process.exit(1)
        }
      },
    }),

    validate: defineCommand({
      meta: {
        name: 'validate',
        description: 'Validate configuration and repository access',
      },
      args: {
        config: {
          type: 'string',
          description: 'Path to configuration file',
          alias: 'c',
        },
        verbose: {
          type: 'boolean',
          description: 'Show detailed validation information',
          alias: 'v',
        },
      },
      async run({ args }) {
        try {
          const configManager = new ConfigManager({ configPath: args.config })
          const configService = new ConfigService(configManager)

          const isValid = await configService.validateConfig({ verbose: args.verbose })
          
          if (isValid) {
            log.success('Configuration is valid')
          } else {
            log.error('Configuration validation failed')
            process.exit(1)
          }
        } catch (error) {
          log.error('Validation failed:', error instanceof Error ? error.message : String(error))
          process.exit(1)
        }
      },
    }),
  },
})