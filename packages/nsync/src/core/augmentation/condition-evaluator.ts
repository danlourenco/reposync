import { parse as parseYAML } from 'yaml'
import { safeParseJSON } from '../../utils/json-utils.js'
import type { Condition, AugmentationContext } from '../../types/augmentation.js'

export class ConditionEvaluator {
  async evaluate(
    condition: Condition,
    content: string,
    filePath: string,
    context: AugmentationContext
  ): Promise<boolean> {
    try {
      switch (condition.type) {
        case 'yaml_has_key':
          return this.evaluateYamlHasKey(condition, content)
          
        case 'json_has_key':
          return this.evaluateJsonHasKey(condition, content)
          
        case 'value_matches':
          return this.evaluateValueMatches(condition, content)
          
        case 'file_exists':
          return this.evaluateFileExists(condition, filePath)
          
        case 'custom':
          return this.evaluateCustom(condition, content, filePath, context)
          
        default:
          console.warn(`Unknown condition type: ${condition.type}`)
          return false
      }
    } catch (error) {
      console.warn(`Error evaluating condition ${condition.type}:`, error)
      return false
    }
  }

  private evaluateYamlHasKey(condition: Condition, content: string): boolean {
    if (!condition.key) return false
    
    try {
      const data = parseYAML(content)
      return this.hasNestedKey(data, condition.key)
    } catch {
      return false
    }
  }

  private evaluateJsonHasKey(condition: Condition, content: string): boolean {
    if (!condition.key) return false
    
    try {
      const data = safeParseJSON(content)
      if (!data || typeof data !== 'object') return false
      return this.hasNestedKey(data, condition.key)
    } catch {
      return false
    }
  }

  private evaluateValueMatches(condition: Condition, content: string): boolean {
    if (!condition.key || !condition.pattern) return false
    
    try {
      // Detect format by content - try JSON first if it looks like JSON
      let data: any
      const trimmed = content.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          data = safeParseJSON(content)
        } catch {
          data = parseYAML(content)
        }
      } else {
        try {
          data = parseYAML(content)
        } catch {
          data = safeParseJSON(content)
        }
      }
      
      if (!data || typeof data !== 'object') return false
      
      const value = this.getNestedValue(data, condition.key)
      if (typeof value !== 'string') return false
      
      const regex = new RegExp(condition.pattern)
      return regex.test(value)
    } catch {
      return false
    }
  }

  private evaluateFileExists(condition: Condition, filePath: string): boolean {
    // This would be handled by the file system check before processing
    // For now, we assume the file exists if we're processing it
    return true
  }

  private evaluateCustom(
    condition: Condition,
    content: string,
    filePath: string,
    context: AugmentationContext
  ): boolean {
    // Custom condition evaluation would require plugin system
    // For now, return false as a safe default
    console.warn('Custom conditions not yet implemented')
    return false
  }

  private hasNestedKey(obj: any, key: string): boolean {
    if (!obj || typeof obj !== 'object') return false
    
    const keys = key.split('.')
    let current = obj
    
    for (const k of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return false
      }
      if (!(k in current)) {
        return false
      }
      current = current[k]
    }
    
    return true
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
}