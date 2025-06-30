import { parse as parseYAML, stringify as stringifyYAML } from 'yaml'
import { safeParseJSON } from '../../utils/json-utils.js'
import semver from 'semver'
import type { Action, AugmentationContext, ChangeDescription } from '../../types/augmentation.js'

export class ActionHandler {
  async apply(
    action: Action,
    content: string,
    filePath: string,
    context: AugmentationContext
  ): Promise<{ content: string; change?: ChangeDescription }> {
    try {
      switch (action.type) {
        case 'update_version_in_value':
          return await this.updateVersionInValue(action, content, context)
          
        case 'replace_value':
          return await this.replaceValue(action, content, context)
          
        case 'set_value':
          return await this.setValue(action, content, context)
          
        case 'append_to_array':
          return await this.appendToArray(action, content, context)
          
        case 'custom':
          return await this.customAction(action, content, filePath, context)
          
        default:
          console.warn(`Unknown action type: ${action.type}`)
          return { content }
      }
    } catch (error) {
      console.warn(`Error applying action ${action.type}:`, error)
      return { content }
    }
  }

  private async updateVersionInValue(
    action: Action,
    content: string,
    context: AugmentationContext
  ): Promise<{ content: string; change?: ChangeDescription }> {
    if (!action.key || !action.version_pattern) {
      return { content }
    }

    const { data, isYaml } = this.parseContent(content)
    if (!data || typeof data !== 'object') {
      return { content }
    }

    const currentValue = this.getNestedValue(data, action.key)
    if (typeof currentValue !== 'string') {
      return { content }
    }

    const versionMatch = currentValue.match(action.version_pattern)
    if (!versionMatch) {
      return { content }
    }

    // Extract version from the matched groups
    // Assume the version is in the second capture group
    const currentVersion = versionMatch[2] || versionMatch[1]
    const newVersion = this.getVersionFromSource(action.version_source, context)
    
    if (!newVersion) {
      return { content }
    }

    // Compare versions if specified
    if (action.comparison === 'greater_than') {
      if (!semver.valid(currentVersion) || !semver.valid(newVersion)) {
        console.warn(`Invalid semver versions: current=${currentVersion}, new=${newVersion}`)
        return { content }
      }
      
      if (!semver.gt(newVersion, currentVersion)) {
        return { content } // Don't update if not greater
      }
    }

    // Update the value by replacing the old version with new version
    const newValue = currentValue.replace(currentVersion, newVersion)

    this.setNestedValue(data, action.key, newValue)
    
    const newContent = isYaml ? stringifyYAML(data) : JSON.stringify(data, null, 2)
    
    const change: ChangeDescription = {
      rule: 'update_version_in_value',
      action: action.type,
      key: action.key,
      oldValue: currentValue,
      newValue: newValue,
      description: `Updated ${action.key} from version ${currentVersion} to ${newVersion}`
    }

    return { content: newContent, change }
  }

  private async replaceValue(
    action: Action,
    content: string,
    context: AugmentationContext
  ): Promise<{ content: string; change?: ChangeDescription }> {
    if (!action.key || action.value === undefined) {
      return { content }
    }

    const { data, isYaml } = this.parseContent(content)
    if (!data || typeof data !== 'object') {
      return { content }
    }

    const oldValue = this.getNestedValue(data, action.key)
    this.setNestedValue(data, action.key, action.value)
    
    const newContent = isYaml ? stringifyYAML(data) : JSON.stringify(data, null, 2)
    
    const change: ChangeDescription = {
      rule: 'replace_value',
      action: action.type,
      key: action.key,
      oldValue,
      newValue: action.value,
      description: `Replaced ${action.key} value`
    }

    return { content: newContent, change }
  }

  private async setValue(
    action: Action,
    content: string,
    context: AugmentationContext
  ): Promise<{ content: string; change?: ChangeDescription }> {
    // setValue is similar to replaceValue but only sets if key doesn't exist
    if (!action.key || action.value === undefined) {
      return { content }
    }

    const { data, isYaml } = this.parseContent(content)
    if (!data || typeof data !== 'object') {
      return { content }
    }

    const existingValue = this.getNestedValue(data, action.key)
    if (existingValue !== undefined) {
      return { content } // Don't override existing value
    }

    this.setNestedValue(data, action.key, action.value)
    
    const newContent = isYaml ? stringifyYAML(data) : JSON.stringify(data, null, 2)
    
    const change: ChangeDescription = {
      rule: 'set_value',
      action: action.type,
      key: action.key,
      oldValue: undefined,
      newValue: action.value,
      description: `Set ${action.key} to new value`
    }

    return { content: newContent, change }
  }

  private async appendToArray(
    action: Action,
    content: string,
    context: AugmentationContext
  ): Promise<{ content: string; change?: ChangeDescription }> {
    if (!action.key || action.value === undefined) {
      return { content }
    }

    const { data, isYaml } = this.parseContent(content)
    if (!data || typeof data !== 'object') {
      return { content }
    }

    let currentArray = this.getNestedValue(data, action.key)
    if (!Array.isArray(currentArray)) {
      currentArray = []
    }

    const newArray = [...currentArray, action.value]
    this.setNestedValue(data, action.key, newArray)
    
    const newContent = isYaml ? stringifyYAML(data) : JSON.stringify(data, null, 2)
    
    const change: ChangeDescription = {
      rule: 'append_to_array',
      action: action.type,
      key: action.key,
      oldValue: currentArray,
      newValue: newArray,
      description: `Appended value to ${action.key} array`
    }

    return { content: newContent, change }
  }

  private async customAction(
    action: Action,
    content: string,
    filePath: string,
    context: AugmentationContext
  ): Promise<{ content: string; change?: ChangeDescription }> {
    // Custom action would require plugin system
    console.warn('Custom actions not yet implemented')
    return { content }
  }

  private parseContent(content: string): { data: any; isYaml: boolean } {
    // Detect format by content - try JSON first if it looks like JSON
    const trimmed = content.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const data = safeParseJSON(content)
        return { data, isYaml: false }
      } catch {
        // Fallback to YAML
      }
    }
    
    // Try YAML
    try {
      const data = parseYAML(content)
      return { data, isYaml: true }
    } catch {
      try {
        const data = safeParseJSON(content)
        return { data, isYaml: false }
      } catch {
        return { data: null, isYaml: false }
      }
    }
  }

  private getNestedValue(obj: any, key: string): any {
    if (!obj || typeof obj !== 'object') return undefined
    
    const keys = key.split('.')
    let current = obj
    
    for (const k of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined
      }
      current = current[k]
    }
    
    return current
  }

  private setNestedValue(obj: any, key: string, value: any): void {
    if (!obj || typeof obj !== 'object') return
    
    const keys = key.split('.')
    let current = obj
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {}
      }
      current = current[k]
    }
    
    current[keys[keys.length - 1]] = value
  }

  private getVersionFromSource(
    source: string | undefined,
    context: AugmentationContext
  ): string | null {
    switch (source) {
      case 'git_tag':
        return context.gitTag?.replace(/^v/, '') || null
        
      case 'package_json':
        // Would need to read package.json from source repo
        return context.sourceVersion || null
        
      case 'literal':
        // Would use action.value as the literal version
        return null
        
      default:
        return context.gitTag?.replace(/^v/, '') || null
    }
  }
}