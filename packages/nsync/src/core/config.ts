import { loadConfig } from 'c12'
import { resolve } from 'pathe'
import { writeFileSync, existsSync } from 'fs'
import { SyncConfig, SyncConfigSchema } from './types.js'
import { configLogger } from '../utils/logger.js'

export interface ConfigOptions {
  configPath?: string
  interactive?: boolean
  saveConfig?: boolean
}

const DEFAULT_CONFIG_NAME = 'sync-config'

export class ConfigManager {
  private configPath: string

  constructor(options: ConfigOptions = {}) {
    this.configPath = options.configPath || resolve(process.cwd(), `${DEFAULT_CONFIG_NAME}.json`)
  }

  async load(): Promise<SyncConfig | null> {
    // Check if config file exists first
    if (!existsSync(this.configPath)) {
      configLogger.debug('Configuration file not found')
      return null
    }

    try {
      const { config } = await loadConfig<SyncConfig>({
        name: DEFAULT_CONFIG_NAME,
        configFile: this.configPath,
      })

      if (!config || Object.keys(config).length === 0) {
        configLogger.debug('No configuration file found')
        return null
      }

      // Validate configuration using Zod schema
      const result = SyncConfigSchema.safeParse(config)
      if (!result.success) {
        configLogger.error('Invalid configuration format:', result.error.format())
        throw new Error('Configuration validation failed')
      }

      configLogger.success(`Configuration loaded from ${this.configPath}`)
      return result.data
    } catch (error) {
      if (error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('Cannot resolve config'))) {
        configLogger.debug('Configuration file not found')
        return null
      }
      configLogger.error('Failed to load configuration:', error)
      throw error
    }
  }

  async save(config: SyncConfig): Promise<void> {
    try {
      // Validate before saving
      const result = SyncConfigSchema.safeParse(config)
      if (!result.success) {
        throw new Error('Configuration validation failed before saving')
      }

      writeFileSync(this.configPath, JSON.stringify(config, null, 2))

      configLogger.success(`Configuration saved to ${this.configPath}`)
    } catch (error) {
      configLogger.error('Failed to save configuration:', error)
      throw error
    }
  }

  async merge(updates: Partial<SyncConfig>): Promise<SyncConfig> {
    const existing = await this.load()
    
    // Use defu but handle arrays differently - replace rather than merge
    const merged = {
      ...existing,
      ...updates,
      // If target_repos is being updated, replace the entire array
      target_repos: updates.target_repos || existing?.target_repos || [],
      // For github config, merge objects
      github: existing?.github ? { ...existing.github, ...updates.github } : updates.github
    } as SyncConfig
    
    // Validate merged configuration
    const result = SyncConfigSchema.safeParse(merged)
    if (!result.success) {
      throw new Error('Merged configuration is invalid')
    }

    return result.data
  }

  getConfigPath(): string {
    return this.configPath
  }

  setConfigPath(path: string): void {
    this.configPath = resolve(path)
  }
}