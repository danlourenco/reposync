/**
 * Interactive Configuration Wizard
 * 
 * Provides a comprehensive wizard interface for setting up *NSYNC configuration
 * including GitHub authentication, repository selection, and file preservation rules.
 */

// Using consola's built-in prompt functionality, keeping search from @inquirer/search
import search from '@inquirer/search'
import { GitHubService } from './github.js'
import { ConfigManager } from './config.js'
import { SyncConfig, TargetRepository } from './types.js'
import consola, { wizardLogger, operation } from '../utils/logger.js'
import { execSync } from 'child_process'
import boxen from 'boxen'

// Type alias for file preservation rules matching SyncConfig expectations
type WizardFilePreservationRule = NonNullable<SyncConfig['file_preservation']>[number]

/**
 * Repository option for selection prompts
 */
interface RepositoryOption {
  name: string
  value: string
  description?: string
  private?: boolean
  archived?: boolean
}

/**
 * GitHub authentication result
 */
interface AuthResult {
  authenticated: boolean
  username?: string
  token?: string
  apiUrl?: string
}

/**
 * Wizard configuration options
 */
interface WizardOptions {
  force?: boolean
  configPath?: string
}

/**
 * Interactive Configuration Wizard Service
 * 
 * Guides users through the complete setup process with intelligent defaults,
 * repository discovery, and comprehensive configuration options.
 */
export class ConfigurationWizard {
  private githubService: GitHubService
  private configManager: ConfigManager

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    this.githubService = new GitHubService()
  }

  /**
   * Run the complete configuration wizard
   * 
   * @param options - Wizard configuration options
   * @returns Promise resolving to the created configuration
   */
  async run(options: WizardOptions = {}): Promise<SyncConfig> {
    try {
      // Welcome screen - use consola for semantic meaning
      process.stdout.write('\x1Bc') // Clear screen
      operation.start('Welcome to the NSYNC Configuration Wizard!')
      consola.info('Let\'s set up your repository synchronization...\n')

      // Check for existing configuration
      if (!options.force) {
        const existingConfig = await this.configManager.load()
        if (existingConfig) {
          const overwrite = await consola.prompt('Configuration already exists. Do you want to overwrite it?', {
            type: 'confirm',
            initial: false,
            cancel: 'default'
          })
          
          if (!overwrite) {
            wizardLogger.info('Configuration wizard cancelled.')
            return existingConfig
          }
        }
      }

      // Step 1: GitHub Authentication
      process.stdout.write('\x1Bc') // Clear screen
      wizardLogger.start('🔐 Step 1: GitHub Authentication')
      consola.info('─'.repeat(50))
      const authResult = await this.setupGitHubAuthentication()
      if (!authResult.authenticated) {
        throw new Error('GitHub authentication is required to continue')
      }

      // Initialize GitHub service with auth details
      if (authResult.token || authResult.apiUrl) {
        this.githubService = new GitHubService({
          token: authResult.token,
          baseUrl: authResult.apiUrl
        })
      }

      // Step 2: Source Repository Selection
      process.stdout.write('\x1Bc') // Clear screen  
      wizardLogger.start('📂 Step 2: Source Repository')
      consola.info('─'.repeat(50))
      const sourceRepo = await this.selectSourceRepository()

      // Step 3: Target Repository Selection
      process.stdout.write('\x1Bc') // Clear screen
      wizardLogger.start('🎯 Step 3: Target Repositories')
      consola.info('─'.repeat(50))
      const targetRepos = await this.selectTargetRepositories(sourceRepo)

      // Step 4: GitHub Configuration (if enterprise)
      const githubConfig = await this.configureGitHubSettings(authResult)

      // Step 5: File Preservation Rules (optional)
      process.stdout.write('\x1Bc') // Clear screen
      wizardLogger.start('📁 Step 4: File Preservation')
      consola.info('─'.repeat(50))
      const filePreservation = await this.configureFilePreservation()

      // Step 6: Template Variables (optional)
      process.stdout.write('\x1Bc') // Clear screen
      wizardLogger.start('⚙️  Step 5: Template Variables')
      consola.info('─'.repeat(50))
      const templateVariables = await this.configureTemplateVariables()

      // Create final configuration
      const config: SyncConfig = {
        source_repo: sourceRepo,
        target_repos: targetRepos,
        ...(githubConfig && { github: githubConfig }),
        ...(filePreservation.length > 0 && { file_preservation: filePreservation }),
        ...(Object.keys(templateVariables).length > 0 && { template_variables: templateVariables })
      }

      // Step 7: Show configuration preview and confirm
      await this.showConfigurationPreview(config)
      const confirmSave = await consola.prompt('Save this configuration?', {
        type: 'confirm',
        initial: true,
        cancel: 'default'
      })

      if (!confirmSave) {
        wizardLogger.info('Configuration cancelled.')
        throw new Error('Configuration cancelled by user')
      }

      // Step 8: Save configuration
      await this.saveConfiguration(config)

      // Step 8: Test configuration (optional)
      await this.testConfiguration(config)

      operation.success('Configuration wizard completed successfully!')
      consola.info('💡 You can now run `nsync sync` to start synchronizing repositories.')

      return config

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      wizardLogger.error('Configuration wizard failed:', message)
      throw error
    }
  }

  /**
   * Set up GitHub authentication
   */
  private async setupGitHubAuthentication(): Promise<AuthResult> {

    // Check if GitHub CLI is authenticated
    let ghAuthenticated = false
    let ghUsername: string | undefined
    
    try {
      const output = execSync('gh auth status', { encoding: 'utf-8', stdio: 'pipe' })
      ghAuthenticated = output.includes('Logged in to')
      
      if (ghAuthenticated) {
        try {
          ghUsername = execSync('gh api user --jq .login', { encoding: 'utf-8', stdio: 'pipe' }).trim()
        } catch {
          // Ignore username fetch errors
        }
      }
    } catch {
      // GitHub CLI not authenticated or not installed
    }

    if (ghAuthenticated && ghUsername) {
      consola.success(`GitHub CLI authenticated as ${ghUsername}`)
      
      const useGhAuth = await consola.prompt('Use GitHub CLI authentication?', {
        type: 'confirm',
        initial: true,
        cancel: 'default'
      })

      if (useGhAuth) {
        // Extract token from GitHub CLI
        try {
          const token = execSync('gh auth token', { encoding: 'utf-8', stdio: 'pipe' }).trim()
          return { authenticated: true, username: ghUsername, token }
        } catch {
          consola.warn('Failed to get GitHub CLI token, trying without token')
          return { authenticated: true, username: ghUsername }
        }
      }
    }

    // Manual authentication setup
    const authMethod = await consola.prompt('How would you like to authenticate with GitHub?', {
      type: 'select',
      options: [
        { label: 'Personal Access Token - Use a GitHub personal access token', value: 'token' },
        { label: 'GitHub CLI Login - Authenticate using GitHub CLI', value: 'gh-login' },
        { label: 'Enterprise GitHub - Configure enterprise GitHub instance', value: 'enterprise' }
      ],
      cancel: 'reject'
    })

    switch (authMethod) {
      case 'token':
        return await this.setupTokenAuthentication()
      
      case 'gh-login':
        return await this.setupGitHubCLIAuthentication()
      
      case 'enterprise':
        return await this.setupEnterpriseAuthentication()
      
      default:
        throw new Error('Invalid authentication method selected')
    }
  }

  /**
   * Set up personal access token authentication
   */
  private async setupTokenAuthentication(): Promise<AuthResult> {
    const token = await consola.prompt('Enter your GitHub personal access token:', {
      type: 'text',
      cancel: 'reject'
    })
    
    if (!token?.trim()) {
      throw new Error('Token is required')
    }
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      throw new Error('Token should start with "ghp_" or "github_pat_"')
    }

    // Test the token
    const tempService = new GitHubService({ token })
    try {
      const user = await tempService.getAuthenticatedUser()
      wizardLogger.success(`✓ Successfully authenticated as ${user.name || user.login}`)
      return { authenticated: true, username: user.login, token }
    } catch {
      throw new Error('Invalid token or network error. Please check your token and try again.')
    }
  }

  /**
   * Set up GitHub CLI authentication
   */
  private async setupGitHubCLIAuthentication(): Promise<AuthResult> {
    wizardLogger.info('Opening GitHub CLI authentication...')
    
    try {
      execSync('gh auth login', { stdio: 'inherit' })
      
      // Verify authentication and get token
      const username = execSync('gh api user --jq .login', { encoding: 'utf-8' }).trim()
      const token = execSync('gh auth token', { encoding: 'utf-8' }).trim()
      wizardLogger.success(`✓ Successfully authenticated as ${username}`)
      
      return { authenticated: true, username, token }
    } catch {
      throw new Error('GitHub CLI authentication failed')
    }
  }

  /**
   * Set up enterprise GitHub authentication
   */
  private async setupEnterpriseAuthentication(): Promise<AuthResult> {
    const hostname = await consola.prompt('Enter your GitHub Enterprise hostname (e.g., github.company.com):', {
      type: 'text',
      cancel: 'reject'
    })
    
    if (!hostname?.trim()) {
      throw new Error('Hostname is required')
    }
    if (hostname.includes('://')) {
      throw new Error('Enter hostname only, without protocol')
    }

    const token = await consola.prompt('Enter your GitHub Enterprise personal access token:', {
      type: 'text',
      cancel: 'reject'
    })
    
    if (!token?.trim()) {
      throw new Error('Token is required')
    }

    const apiUrl = `https://${hostname}/api/v3`

    // Test the configuration
    const tempService = new GitHubService({ token, baseUrl: apiUrl })
    try {
      const user = await tempService.getAuthenticatedUser()
      wizardLogger.success(`✓ Successfully authenticated to ${hostname} as ${user.name || user.login}`)
      return { authenticated: true, username: user.login, token, apiUrl }
    } catch {
      throw new Error(`Failed to authenticate with ${hostname}. Please check your hostname and token.`)
    }
  }

  /**
   * Select source repository
   */
  private async selectSourceRepository(): Promise<string> {

    const selectionMethod = await consola.prompt('How would you like to specify the source repository?', {
      type: 'select',
      options: [
        { label: 'Browse my repositories - Select from your accessible repositories', value: 'browse' },
        { label: 'Enter repository URL - Manually enter repository URL', value: 'manual' }
      ],
      cancel: 'reject'
    })

    if (selectionMethod === 'manual') {
      const repoUrl = await consola.prompt('Enter source repository URL:', {
        type: 'text',
        cancel: 'reject'
      })
      
      if (!repoUrl?.trim()) {
        throw new Error('Repository URL is required')
      }
      if (!repoUrl.includes('github.com') && !repoUrl.includes('git')) {
        throw new Error('Please enter a valid Git repository URL')
      }
      
      return repoUrl
    }

    // Browse repositories  
    consola.info('🔍 Fetching your repositories...')
    const repositories = await this.fetchUserRepositories()

    if (repositories.length === 0) {
      consola.warn('No repositories found. Please enter the URL manually.')
      const repoUrl = await consola.prompt('Enter source repository URL:', {
        type: 'text',
        cancel: 'reject'
      })
      
      if (!repoUrl?.trim()) {
        throw new Error('Repository URL is required')
      }
      
      return repoUrl
    }

    const selectedRepo = await search({
      message: 'Search and select source repository:',
      source: async (input) => {
        if (!input) return repositories.slice(0, 10)
        
        return repositories.filter(repo => 
          repo.name.toLowerCase().includes(input.toLowerCase()) ||
          repo.description?.toLowerCase().includes(input.toLowerCase())
        ).slice(0, 10)
      }
    })

    return selectedRepo
  }

  /**
   * Select target repositories
   */
  private async selectTargetRepositories(sourceRepo: string): Promise<TargetRepository[]> {

    const repositories = await this.fetchUserRepositories()
    
    // Filter out the source repository
    const availableTargets = repositories.filter(repo => repo.value !== sourceRepo)

    if (availableTargets.length === 0) {
      wizardLogger.warn('No other repositories found for targets.')
      return await this.addTargetRepositoriesManually()
    }

    const useExistingRepos = await consola.prompt('Select target repositories from your accessible repositories?', {
      type: 'confirm',
      initial: true,
      cancel: 'default'
    })

    if (!useExistingRepos) {
      return await this.addTargetRepositoriesManually()
    }

    const selectedRepos = await consola.prompt('Select target repositories:', {
      type: 'multiselect',
      options: availableTargets.map(repo => ({
        label: `${repo.name}${repo.description ? ` - ${repo.description}` : ''}`,
        value: repo.value
      })),
      cancel: 'reject'
    })
    
    if (!selectedRepos || selectedRepos.length === 0) {
      throw new Error('Select at least one target repository')
    }

    // Convert to TargetRepository format with custom names
    const targetRepos: TargetRepository[] = []
    
    for (const repoItem of selectedRepos) {
      const repoUrl = typeof repoItem === 'string' ? repoItem : repoItem.value
      const repoOption = repositories.find(r => r.value === repoUrl)
      const defaultName = repoOption?.name || (repoUrl.split('/').pop()?.replace('.git', '') || 'Repository')
      
      const customName = await consola.prompt(`Enter display name for ${defaultName}:`, {
        type: 'text',
        initial: defaultName,
        cancel: 'default'
      }) || defaultName
      
      if (!customName.trim()) {
        throw new Error('Name is required')
      }

      targetRepos.push({
        name: customName,
        url: repoUrl
      })
    }

    // Ask if they want to add more repositories manually
    const addMore = await consola.prompt('Add additional target repositories manually?', {
      type: 'confirm',
      initial: false,
      cancel: 'default'
    })

    if (addMore) {
      const additionalRepos = await this.addTargetRepositoriesManually()
      targetRepos.push(...additionalRepos)
    }

    return targetRepos
  }

  /**
   * Add target repositories manually
   */
  private async addTargetRepositoriesManually(): Promise<TargetRepository[]> {
    const targetRepos: TargetRepository[] = []
    
    do {
      const url = await consola.prompt('Enter target repository URL:', {
        type: 'text',
        cancel: 'reject'
      })
      
      if (!url?.trim()) {
        throw new Error('Repository URL is required')
      }
      if (!url.includes('github.com') && !url.includes('git')) {
        throw new Error('Please enter a valid Git repository URL')
      }

      const defaultName = url.split('/').pop()?.replace('.git', '') || 'Repository'
      const name = await consola.prompt('Enter display name for this repository:', {
        type: 'text',
        initial: defaultName,
        cancel: 'default'
      }) || defaultName
      
      if (!name.trim()) {
        throw new Error('Name is required')
      }

      targetRepos.push({ name, url })

      const addAnother = await consola.prompt('Add another target repository?', {
        type: 'confirm',
        initial: false,
        cancel: 'default'
      })

      if (!addAnother) break
    } while (targetRepos.length < 100) // Reasonable limit to avoid infinite loops

    return targetRepos
  }

  /**
   * Fetch user's accessible repositories
   */
  private async fetchUserRepositories(): Promise<RepositoryOption[]> {
    try {
      const repositories = await this.githubService.fetchUserRepositories({
        type: 'all',
        sort: 'updated',
        per_page: 100
      })

      return repositories
        .filter(repo => !repo.archived && !repo.disabled) // Filter out archived/disabled repos
        .map(repo => ({
          name: repo.full_name,
          value: repo.clone_url,
          description: repo.description || 'No description',
          private: repo.private,
          archived: repo.archived
        }))
    } catch {
      wizardLogger.warn('Failed to fetch repositories. You\'ll need to enter URLs manually.')
      return []
    }
  }

  /**
   * Configure GitHub settings for enterprise instances
   */
  private async configureGitHubSettings(authResult: AuthResult) {
    if (!authResult.apiUrl && !authResult.token) {
      return undefined
    }

    return {
      ...(authResult.apiUrl && { api_url: authResult.apiUrl }),
      ...(authResult.token && { token: authResult.token })
    }
  }

  /**
   * Configure file preservation rules
   */
  private async configureFilePreservation(): Promise<WizardFilePreservationRule[]> {
    wizardLogger.info('🔄 Configuring file preservation...')

    const useFilePreservation = await consola.prompt('Configure file preservation rules? (Recommended)', {
      type: 'confirm',
      initial: true,
      cancel: 'default'
    })

    if (!useFilePreservation) {
      return []
    }

    const useDefaults = await consola.prompt('Use default file preservation rules for InfrastructureAsCodeFile?', {
      type: 'confirm',
      initial: true,
      cancel: 'default'
    })

    if (useDefaults) {
      return [{
        files: ['InfrastructureAsCodeFile*'],
        description: 'Preserve and update infrastructure configuration files',
        update_rules: [{
          name: 'artifact_versions',
          type: 'pattern' as const,
          pattern: '{prefix}-{version}.{ext}',
          fields: ['remote_artifact', 'backup_tool'],
          version_strategy: 'replace_if_newer' as const
        }]
      }]
    }

    // Custom file preservation rules
    const rules: WizardFilePreservationRule[] = []
    
    wizardLogger.info('Custom file preservation configuration is available but complex.')
    wizardLogger.info('For now, you can manually edit the configuration file after setup.')
    wizardLogger.info('See docs/file-augmentation.md for detailed documentation.')

    return rules
  }

  /**
   * Configure template variables
   */
  private async configureTemplateVariables(): Promise<Record<string, string>> {
    const useTemplateVars = await consola.prompt('Configure custom template variables? (Advanced)', {
      type: 'confirm',
      initial: false,
      cancel: 'default'
    })

    if (!useTemplateVars) {
      return {}
    }

    wizardLogger.info('Template variables allow custom value substitution in file updates.')
    wizardLogger.info('You can manually configure these in the configuration file.')
    wizardLogger.info('Common variables: major_version, docker_tag, api_version')

    return {}
  }

  /**
   * Show a clean configuration preview
   */
  private async showConfigurationPreview(config: SyncConfig): Promise<void> {
    // Clear screen and show clean preview
    process.stdout.write('\x1Bc')
    wizardLogger.start('NSYNC Configuration Preview')
    consola.info('')

    // Source repository
    const sourceRepoName = config.source_repo.split('/').slice(-2).join('/').replace('.git', '')
    const sourceBox = boxen(sourceRepoName, {
      title: 'Source Repository',
      padding: 1,
      margin: 0,
      borderStyle: 'round',
      borderColor: 'blue'
    })
    console.log(sourceBox)

    // Target repositories
    const targetContent = config.target_repos.map(repo => {
      const repoPath = repo.url.split('/').slice(-2).join('/').replace('.git', '')
      // Only show repo path if it's different from the display name
      if (repo.name === repoPath) {
        return `• ${repo.name}`
      } else {
        return `• ${repo.name}\n  → ${repoPath}`
      }
    }).join('\n\n')
    
    const targetBox = boxen(targetContent, {
      title: `Target ${config.target_repos.length === 1 ? 'Repository' : 'Repositories'}`,
      padding: 1,
      margin: 0,
      borderStyle: 'round',
      borderColor: 'green'
    })
    console.log(targetBox)

    // File preservation
    if (config.file_preservation && config.file_preservation.length > 0) {
      const preservationContent = config.file_preservation.map(rule => {
        const filesStr = rule.files.join(', ')
        const description = rule.description || 'Custom preservation rule'
        return `• ${filesStr}\n  ${description}`
      }).join('\n\n')
      
      const preservationBox = boxen(preservationContent, {
        title: 'File Preservation',
        padding: 1,
        margin: 0,
        borderStyle: 'round',
        borderColor: 'yellow'
      })
      console.log(preservationBox)
    }

    // Enterprise GitHub
    if (config.github?.api_url) {
      const hostname = config.github.api_url.replace('https://', '').replace('/api/v3', '')
      const githubBox = boxen(`Enterprise: ${hostname}`, {
        title: 'GitHub Configuration',
        padding: 1,
        margin: 0,
        borderStyle: 'round',
        borderColor: 'magenta'
      })
      console.log(githubBox)
    }

    consola.info('')
  }

  /**
   * Save the configuration
   */
  private async saveConfiguration(config: SyncConfig): Promise<void> {
    await this.configManager.save(config)
    consola.success(`Configuration saved to ${this.configManager.getConfigPath()}`)
  }

  /**
   * Test the configuration
   */
  private async testConfiguration(_config: SyncConfig): Promise<void> {
    const runTest = await consola.prompt('Test the configuration with a dry-run sync?', {
      type: 'confirm',
      initial: true,
      cancel: 'default'
    })

    if (!runTest) {
      return
    }

    wizardLogger.info('🔄 Testing configuration...')
    wizardLogger.info('This would run a dry-run sync to validate the setup.')
    wizardLogger.info('Use `nsync sync --dry-run` to test your configuration.')
  }
}