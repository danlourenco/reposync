import { loadConfig } from 'c12'
import { join } from 'pathe'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { AugmentationConfig, AugmentationRule } from '../../types/augmentation.js'

export class RuleLoader {
  private rules: AugmentationRule[] = []
  private loaded = false

  async loadRules(): Promise<AugmentationRule[]> {
    if (this.loaded) {
      return this.rules
    }

    try {
      // Load from multiple sources in priority order
      const configs = await this.loadFromMultipleSources()
      
      // Merge all rules from different sources
      this.rules = configs
        .flatMap(config => config.file_augmentation?.rules || [])
        .filter(rule => rule.enabled !== false) // Filter out disabled rules
      
      this.loaded = true
      return this.rules
    } catch (error) {
      console.warn('Error loading augmentation rules:', error)
      return []
    }
  }

  private async loadFromMultipleSources(): Promise<AugmentationConfig[]> {
    const configs: AugmentationConfig[] = []

    // 1. Global user config (~/.reposync/rules.yaml)
    const globalConfig = await this.loadGlobalConfig()
    if (globalConfig) {
      configs.push(globalConfig)
    }

    // 2. Project-specific config (./.reposync/rules.yaml)
    const projectConfig = await this.loadProjectConfig()
    if (projectConfig) {
      configs.push(projectConfig)
    }

    // 3. Main config file with augmentation rules
    const mainConfig = await this.loadMainConfig()
    if (mainConfig) {
      configs.push(mainConfig)
    }

    // 4. Environment variable path
    const envConfig = await this.loadFromEnvPath()
    if (envConfig) {
      configs.push(envConfig)
    }

    return configs
  }

  private async loadGlobalConfig(): Promise<AugmentationConfig | null> {
    try {
      const globalPath = join(homedir(), '.reposync')
      const globalRulesPath = join(globalPath, 'rules.yaml')
      
      if (!existsSync(globalRulesPath)) {
        return null
      }

      const { config } = await loadConfig({
        configFile: globalRulesPath,
        defaults: {
          file_augmentation: { rules: [] }
        }
      })

      return config as AugmentationConfig
    } catch (error) {
      console.warn('Error loading global config:', error)
      return null
    }
  }

  private async loadProjectConfig(): Promise<AugmentationConfig | null> {
    try {
      const projectPath = './.reposync/rules.yaml'
      
      if (!existsSync(projectPath)) {
        return null
      }

      const { config } = await loadConfig({
        configFile: projectPath,
        defaults: {
          file_augmentation: { rules: [] }
        }
      })

      return config as AugmentationConfig
    } catch (error) {
      console.warn('Error loading project config:', error)
      return null
    }
  }

  private async loadMainConfig(): Promise<AugmentationConfig | null> {
    try {
      // Load from main reposync config
      const { config } = await loadConfig({
        name: 'reposync',
        rcFile: '.reposyncrc',
        globalRc: false, // We handle global separately
        defaults: {
          file_augmentation: { rules: [] }
        }
      })

      return config as AugmentationConfig
    } catch (error) {
      console.warn('Error loading main config:', error)
      return null
    }
  }

  private async loadFromEnvPath(): Promise<AugmentationConfig | null> {
    try {
      const envPath = process.env.REPOSYNC_RULES_PATH
      if (!envPath || !existsSync(envPath)) {
        return null
      }

      const { config } = await loadConfig({
        configFile: envPath,
        defaults: {
          file_augmentation: { rules: [] }
        }
      })

      return config as AugmentationConfig
    } catch (error) {
      console.warn('Error loading config from environment path:', error)
      return null
    }
  }

  getRules(): AugmentationRule[] {
    return this.rules
  }

  getRulesByFile(fileName: string): AugmentationRule[] {
    const { minimatch } = require('minimatch')
    
    return this.rules.filter(rule =>
      rule.target_files.some(pattern => minimatch(fileName, pattern))
    )
  }

  reset(): void {
    this.rules = []
    this.loaded = false
  }
}