/**
 * File Update DSL - Generic file preservation and update system
 * 
 * Provides a flexible DSL for defining how preserved files should be updated
 * during synchronization operations. Supports pattern matching, version comparison,
 * JSON/YAML field updates, and custom regex transformations.
 */

import { readFile, writeFile } from 'fs/promises'
import { join, relative } from 'pathe'
import { existsSync } from 'fs'
import { minimatch } from 'minimatch'
import { fileLogger } from '../utils/logger.js'
import { RepoSyncError } from './types.js'

/**
 * File preservation rule configuration
 */
export interface FilePreservationRule {
  /** Glob patterns for files to match */
  files: string[]
  /** Human-readable description of what this rule does */
  description?: string
  /** List of update rules to apply to matched files */
  update_rules: UpdateRule[]
}

/**
 * Individual update rule within a file preservation rule
 */
export interface UpdateRule {
  /** Unique name for this update rule */
  name: string
  /** Type of update to perform */
  type?: UpdateRuleType
  /** Pattern template for pattern-based updates */
  pattern?: string
  /** Fields/keys to apply the pattern to */
  fields?: string[]
  /** Strategy for version comparison */
  version_strategy?: VersionStrategy
  /** JSONPath or YAML path for field updates */
  path?: string
  /** Template value for field updates */
  value?: string
  /** Regular expression for custom regex updates */
  regex?: string
  /** Replacement template for regex updates */
  replacement?: string
  /** Condition for when to apply the update */
  condition?: VersionCondition
}

/**
 * Types of update rules supported
 */
export type UpdateRuleType = 
  | 'pattern'      // Simple pattern matching like {name}-{version}.{ext}
  | 'json_field'   // Update JSON field via JSONPath
  | 'yaml_field'   // Update YAML field via path
  | 'regex'        // Custom regex replacement

/**
 * Version comparison strategies
 */
export type VersionStrategy = 
  | 'replace_if_newer'           // Only update if new version is higher
  | 'replace_if_newer_or_equal'  // Update if new version is higher or equal
  | 'always_replace'             // Always update regardless of version
  | 'never_replace'              // Never update (preserve only)

/**
 * Version comparison condition
 */
export interface VersionCondition {
  type: 'version_compare'
  operator: '>=' | '>' | '=' | '<' | '<='
  current: string    // Template for extracting current version
  new: string        // Template for new version
}

/**
 * Result of applying an update rule
 */
export interface UpdateRuleResult {
  /** Updated content */
  content: string
  /** Whether any modifications were made */
  modified: boolean
  /** List of changes made */
  changes: Change[]
}

/**
 * Individual change made by an update rule
 */
export interface Change {
  /** Name of the rule that made this change */
  rule: string
  /** Human-readable description of the change */
  description: string
  /** Original value before change */
  oldValue: string
  /** New value after change */
  newValue: string
  /** Line number where change occurred (if applicable) */
  lineNumber?: number
}

/**
 * Result of updating a single file
 */
export interface FileUpdateResult {
  /** Relative path to the file */
  filePath: string
  /** Whether the file was modified */
  modified: boolean
  /** List of changes made to the file */
  changes: Change[]
  /** Any errors that occurred */
  error?: string
}

/**
 * Built-in template functions for processing values
 */
const templateFunctions = {
  strip_prefix: (value: string, prefix: string): string => 
    value.startsWith(prefix) ? value.slice(prefix.length) : value,
  
  semver_major: (version: string): string => 
    version.match(/^v?(\d+)/)?.[1] || '0',
  
  semver_minor: (version: string): string => 
    version.match(/^v?\d+\.(\d+)/)?.[1] || '0',
  
  semver_patch: (version: string): string => 
    version.match(/^v?\d+\.\d+\.(\d+)/)?.[1] || '0',
  
  to_docker_tag: (version: string): string => 
    version.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase(),
  
  normalize_version: (version: string): string =>
    version.replace(/^v/, '').trim()
}

/**
 * File Update Service - Handles generic file updates based on DSL rules
 */
export class FileUpdateService {
  private rules: FilePreservationRule[] = []

  constructor(rules: FilePreservationRule[] = []) {
    this.rules = rules
  }

  /**
   * Update preserved files in a directory based on configured rules
   * 
   * @param targetDir - Directory containing files to update
   * @param syncVersion - Version from the sync tag
   * @param templateVars - Template variables for substitution
   * @param dryRun - Whether to preview changes without applying them
   * @returns Promise resolving to array of file update results
   */
  async updatePreservedFiles(
    targetDir: string,
    syncVersion: string,
    templateVars: Record<string, string>,
    dryRun = false
  ): Promise<FileUpdateResult[]> {
    const results: FileUpdateResult[] = []

    fileLogger.info(`🔄 ${dryRun ? 'Previewing' : 'Applying'} file updates with ${this.rules.length} rules`)

    for (const rule of this.rules) {
      const matchedFiles = await this.findMatchingFiles(targetDir, rule.files)
      
      for (const filePath of matchedFiles) {
        try {
          const fileResult = await this.updateFile(
            filePath,
            rule,
            syncVersion,
            templateVars,
            dryRun
          )
          results.push(fileResult)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          results.push({
            filePath: relative(targetDir, filePath),
            modified: false,
            changes: [],
            error: `Failed to update file: ${message}`
          })
        }
      }
    }

    this.logUpdateResults(results, dryRun)
    return results
  }

  /**
   * Find files matching glob patterns in a directory
   */
  private async findMatchingFiles(targetDir: string, patterns: string[]): Promise<string[]> {
    const matchedFiles: string[] = []

    for (const pattern of patterns) {
      // Handle exact file matches
      const exactPath = join(targetDir, pattern)
      if (existsSync(exactPath) && !pattern.includes('*')) {
        matchedFiles.push(exactPath)
        continue
      }

      // Handle glob patterns (simplified implementation)
      const files = await this.getAllFiles(targetDir)
      for (const file of files) {
        const relativePath = relative(targetDir, file)
        if (minimatch(relativePath, pattern)) {
          matchedFiles.push(file)
        }
      }
    }

    return [...new Set(matchedFiles)] // Remove duplicates
  }

  /**
   * Get all files recursively from a directory
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const { readdir, stat } = await import('fs/promises')
    const files: string[] = []
    
    try {
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
    } catch {
      // Directory doesn't exist or can't be read
    }
    
    return files
  }

  /**
   * Update a single file based on preservation rules
   */
  private async updateFile(
    filePath: string,
    rule: FilePreservationRule,
    syncVersion: string,
    templateVars: Record<string, string>,
    dryRun: boolean
  ): Promise<FileUpdateResult> {
    const content = await readFile(filePath, 'utf-8')
    let updatedContent = content
    const changes: Change[] = []

    // Apply each update rule to the file content
    for (const updateRule of rule.update_rules) {
      const ruleResult = await this.applyUpdateRule(
        updatedContent,
        updateRule,
        syncVersion,
        templateVars
      )

      if (ruleResult.modified) {
        updatedContent = ruleResult.content
        changes.push(...ruleResult.changes)
      }
    }

    // Write the updated content if changes were made and not in dry-run mode
    if (changes.length > 0 && !dryRun) {
      await writeFile(filePath, updatedContent, 'utf-8')
    }

    return {
      filePath: relative(process.cwd(), filePath),
      modified: changes.length > 0,
      changes
    }
  }

  /**
   * Apply a single update rule to content
   */
  private async applyUpdateRule(
    content: string,
    rule: UpdateRule,
    syncVersion: string,
    templateVars: Record<string, string>
  ): Promise<UpdateRuleResult> {
    const ruleType = rule.type || 'pattern'

    switch (ruleType) {
      case 'pattern':
        return this.applyPatternRule(content, rule, syncVersion, templateVars)
      
      case 'json_field':
        return this.applyJsonFieldRule(content, rule, syncVersion, templateVars)
      
      case 'yaml_field':
        return this.applyYamlFieldRule(content, rule, syncVersion, templateVars)
      
      case 'regex':
        return this.applyRegexRule(content, rule, syncVersion, templateVars)
      
      default:
        throw new RepoSyncError(`Unknown update rule type: ${ruleType}`, 'INVALID_UPDATE_RULE')
    }
  }

  /**
   * Apply pattern-based update rule
   */
  private applyPatternRule(
    content: string,
    rule: UpdateRule,
    syncVersion: string,
    _templateVars: Record<string, string>
  ): UpdateRuleResult {
    if (!rule.pattern || !rule.fields) {
      return { content, modified: false, changes: [] }
    }

    const changes: Change[] = []
    let modified = false
    let lineNumber = 0

    // Create regex from pattern
    const patternRegex = this.createRegexFromPattern(rule.pattern)
    
    const updatedContent = content.split('\n').map(line => {
      lineNumber++
      
      // Check if this line contains any of the specified fields
      for (const field of rule.fields!) {
        const fieldMatch = line.match(new RegExp(`^\\s*${field}\\s*:\\s*(.+)$`))
        if (fieldMatch) {
          const currentValue = fieldMatch[1].trim()
          const patternMatch = currentValue.match(patternRegex)
          
          if (patternMatch && patternMatch.groups) {
            const { prefix, version, ext } = patternMatch.groups
            
            if (this.shouldUpdateVersion(version, syncVersion, rule.version_strategy)) {
              const newValue = `${prefix}-${syncVersion}.${ext}`
              modified = true
              changes.push({
                rule: rule.name,
                description: `Updated ${field} version from ${version} to ${syncVersion}`,
                oldValue: currentValue,
                newValue,
                lineNumber
              })
              
              return line.replace(currentValue, newValue)
            }
          }
        }
      }
      
      return line
    }).join('\n')

    return { content: updatedContent, modified, changes }
  }

  /**
   * Apply JSON field update rule
   */
  private applyJsonFieldRule(
    content: string,
    rule: UpdateRule,
    syncVersion: string,
    templateVars: Record<string, string>
  ): UpdateRuleResult {
    if (!rule.path || !rule.value) {
      return { content, modified: false, changes: [] }
    }

    try {
      const jsonData = JSON.parse(content)
      const processedValue = this.processTemplate(rule.value, { ...templateVars, sync_version: syncVersion })
      
      // Simple path handling (can be extended for complex JSONPath)
      const pathParts = rule.path.split('.')
      let current = jsonData
      
      // Navigate to parent object
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!(pathParts[i] in current)) {
          current[pathParts[i]] = {}
        }
        current = current[pathParts[i]]
      }
      
      const finalKey = pathParts[pathParts.length - 1]
      const oldValue = current[finalKey]
      
      if (this.shouldUpdateValue(String(oldValue), processedValue, rule.version_strategy)) {
        current[finalKey] = processedValue
        
        return {
          content: JSON.stringify(jsonData, null, 2),
          modified: true,
          changes: [{
            rule: rule.name,
            description: `Updated JSON field ${rule.path}`,
            oldValue: String(oldValue),
            newValue: processedValue
          }]
        }
      }
    } catch (error) {
      fileLogger.warn(`Failed to parse JSON in file: ${error}`)
    }

    return { content, modified: false, changes: [] }
  }

  /**
   * Apply YAML field update rule
   */
  private applyYamlFieldRule(
    content: string,
    rule: UpdateRule,
    syncVersion: string,
    templateVars: Record<string, string>
  ): UpdateRuleResult {
    if (!rule.path || !rule.value) {
      return { content, modified: false, changes: [] }
    }

    const processedValue = this.processTemplate(rule.value, { ...templateVars, sync_version: syncVersion })
    const changes: Change[] = []
    let modified = false
    let lineNumber = 0

    // Simple YAML field update (can be extended for complex YAML parsing)
    const updatedContent = content.split('\n').map(line => {
      lineNumber++
      
      const yamlFieldMatch = line.match(new RegExp(`^(\\s*${rule.path}\\s*):\\s*(.+)$`))
      if (yamlFieldMatch) {
        const [, fieldPart, currentValue] = yamlFieldMatch
        const trimmedValue = currentValue.trim()
        
        if (this.shouldUpdateValue(trimmedValue, processedValue, rule.version_strategy)) {
          modified = true
          changes.push({
            rule: rule.name,
            description: `Updated YAML field ${rule.path}`,
            oldValue: trimmedValue,
            newValue: processedValue,
            lineNumber
          })
          
          return `${fieldPart}: ${processedValue}`
        }
      }
      
      return line
    }).join('\n')

    return { content: updatedContent, modified, changes }
  }

  /**
   * Apply regex-based update rule
   */
  private applyRegexRule(
    content: string,
    rule: UpdateRule,
    syncVersion: string,
    templateVars: Record<string, string>
  ): UpdateRuleResult {
    if (!rule.regex || !rule.replacement) {
      return { content, modified: false, changes: [] }
    }

    const regex = new RegExp(rule.regex, 'g')
    const changes: Change[] = []
    let modified = false
    
    const updatedContent = content.replace(regex, (match, ...groups) => {
      // Extract named groups if any
      const namedGroups = groups[groups.length - 1] || {}
      
      if (rule.condition) {
        const shouldUpdate = this.evaluateCondition(rule.condition, namedGroups, syncVersion)
        if (!shouldUpdate) {
          return match
        }
      }
      
      // Process replacement template with named groups and other variables
      const processedReplacement = this.processTemplate(rule.replacement || '', { 
        ...templateVars, 
        sync_version: syncVersion,
        ...namedGroups  // Add captured groups to template variables
      })
      
      modified = true
      changes.push({
        rule: rule.name,
        description: `Applied regex replacement`,
        oldValue: match,
        newValue: processedReplacement
      })
      
      return processedReplacement
    })

    return { content: updatedContent, modified, changes }
  }

  /**
   * Create regex from simple pattern template
   */
  private createRegexFromPattern(pattern: string): RegExp {
    // For pattern {prefix}-{version}.{ext}, we want to create:
    // (?<prefix>.+?)-(?<version>[\d.]+)\.(?<ext>\w+)
    
    // Handle the specific pattern transformation needed
    if (pattern === '{prefix}-{version}.{ext}') {
      return new RegExp('(?<prefix>.+?)-(?<version>[\\d.]+)\\.(?<ext>\\w+)')
    }
    
    // Generic handling for other patterns
    const regexPattern = pattern
      // Escape regex special characters first, except our placeholders
      .replace(/[.+?^${}()|[\]\\]/g, (match) => {
        // Don't escape our template placeholders
        if (/\{(?:prefix|version|ext|name)\}/.test(match)) {
          return match
        }
        return '\\' + match
      })
      // Replace template placeholders with regex capture groups
      .replace(/\{prefix\}/g, '(?<prefix>.+?)')
      .replace(/\{version\}/g, '(?<version>[\\d.]+)')
      .replace(/\{ext\}/g, '(?<ext>\\w+)')
      .replace(/\{name\}/g, '(?<name>[\\w-]+)')
    
    return new RegExp(regexPattern)
  }

  /**
   * Check if version should be updated based on strategy
   */
  private shouldUpdateVersion(
    currentVersion: string,
    newVersion: string,
    strategy: VersionStrategy = 'replace_if_newer'
  ): boolean {
    switch (strategy) {
      case 'always_replace':
        return true
      case 'never_replace':
        return false
      case 'replace_if_newer':
        return this.compareVersions(newVersion, currentVersion) > 0
      case 'replace_if_newer_or_equal':
        return this.compareVersions(newVersion, currentVersion) >= 0
      default:
        return false
    }
  }

  /**
   * Check if value should be updated
   */
  private shouldUpdateValue(
    currentValue: string,
    newValue: string,
    strategy: VersionStrategy = 'always_replace'
  ): boolean {
    if (strategy === 'always_replace') return currentValue !== newValue
    if (strategy === 'never_replace') return false
    
    // For version strategies, treat as version comparison
    return this.shouldUpdateVersion(currentValue, newValue, strategy)
  }

  /**
   * Compare two semantic versions
   */
  private compareVersions(version1: string, version2: string): number {
    const normalize = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n) || 0)
    const [v1Major, v1Minor, v1Patch] = normalize(version1)
    const [v2Major, v2Minor, v2Patch] = normalize(version2)
    
    if (v1Major !== v2Major) return v1Major - v2Major
    if (v1Minor !== v2Minor) return v1Minor - v2Minor
    return (v1Patch || 0) - (v2Patch || 0)
  }

  /**
   * Process template strings with variable substitution
   */
  private processTemplate(template: string, variables: Record<string, string>): string {
    let result = template
    
    // Replace template variables
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    }
    
    // Process template functions
    result = result.replace(/(\w+)\(([^)]+)\)/g, (match, funcName, args) => {
      if (funcName in templateFunctions) {
        const argList = args.split(',').map((arg: string) => arg.trim().replace(/['"]/g, ''))
        return (templateFunctions as any)[funcName](...argList)
      }
      return match
    })
    
    return result
  }

  /**
   * Evaluate version condition
   */
  private evaluateCondition(
    condition: VersionCondition,
    context: Record<string, string>,
    syncVersion: string
  ): boolean {
    if (condition.type !== 'version_compare') {
      return true
    }

    const currentVersion = this.processTemplate(condition.current, { ...context, sync_version: syncVersion })
    const newVersion = this.processTemplate(condition.new, { ...context, sync_version: syncVersion })
    
    const comparison = this.compareVersions(newVersion, currentVersion)
    
    switch (condition.operator) {
      case '>': return comparison > 0
      case '>=': return comparison >= 0
      case '=': return comparison === 0
      case '<': return comparison < 0
      case '<=': return comparison <= 0
      default: return true
    }
  }

  /**
   * Log update results summary
   */
  private logUpdateResults(results: FileUpdateResult[], dryRun: boolean): void {
    const modifiedFiles = results.filter(r => r.modified)
    const totalChanges = results.reduce((sum, r) => sum + r.changes.length, 0)
    const errors = results.filter(r => r.error)

    if (dryRun) {
      fileLogger.info(`Would update ${modifiedFiles.length} files with ${totalChanges} changes`)
    } else {
      fileLogger.success(`Updated ${modifiedFiles.length} files with ${totalChanges} changes`)
    }

    modifiedFiles.forEach(result => {
      if (dryRun) {
        fileLogger.info(`Would update ${result.filePath}:`)
      } else {
        fileLogger.success(`Updated ${result.filePath}:`)
      }
      
      result.changes.forEach(change => {
        fileLogger.info(`  ${change.rule}: ${change.oldValue} → ${change.newValue}`)
      })
    })

    errors.forEach(result => {
      fileLogger.error(`Error updating ${result.filePath}: ${result.error}`)
    })
  }
}