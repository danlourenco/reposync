import { minimatch } from 'minimatch'
import { ConditionEvaluator } from './condition-evaluator.js'
import { ActionHandler } from './action-handler.js'
import { RuleLoader } from './rule-loader.js'
import type { 
  AugmentationRule, 
  AugmentationContext, 
  AugmentationResult,
  ChangeDescription 
} from '../../types/augmentation.js'

export class AugmentationEngine {
  private conditionEvaluator = new ConditionEvaluator()
  private actionHandler = new ActionHandler()
  private ruleLoader = new RuleLoader()
  private rules: AugmentationRule[] = []

  async initialize(): Promise<void> {
    this.rules = await this.ruleLoader.loadRules()
  }

  async processFile(
    filePath: string,
    content: string,
    context: AugmentationContext = {}
  ): Promise<AugmentationResult> {
    const fileName = filePath.split('/').pop() || filePath
    const applicableRules = this.getApplicableRules(fileName)
    
    if (applicableRules.length === 0) {
      return {
        changed: false,
        originalContent: content,
        newContent: content,
        appliedRules: [],
        changes: []
      }
    }

    let processedContent = content
    const appliedRules: string[] = []
    const changes: ChangeDescription[] = []

    for (const rule of applicableRules) {
      try {
        const { content: newContent, appliedRule, ruleChanges } = await this.processRule(
          rule,
          processedContent,
          filePath,
          context
        )

        if (appliedRule) {
          processedContent = newContent
          appliedRules.push(rule.name)
          changes.push(...ruleChanges)
        }
      } catch (error) {
        console.warn(`Error processing rule "${rule.name}":`, error)
      }
    }

    return {
      changed: processedContent !== content,
      originalContent: content,
      newContent: processedContent,
      appliedRules,
      changes
    }
  }

  private async processRule(
    rule: AugmentationRule,
    content: string,
    filePath: string,
    context: AugmentationContext
  ): Promise<{ content: string; appliedRule: boolean; ruleChanges: ChangeDescription[] }> {
    // Evaluate all conditions
    const conditionsPass = await this.evaluateConditions(rule, content, filePath, context)
    
    if (!conditionsPass) {
      return { content, appliedRule: false, ruleChanges: [] }
    }

    // Apply all actions
    let processedContent = content
    const ruleChanges: ChangeDescription[] = []

    for (const action of rule.actions) {
      const result = await this.actionHandler.apply(action, processedContent, filePath, context)
      processedContent = result.content
      
      if (result.change) {
        result.change.rule = rule.name
        ruleChanges.push(result.change)
      }
    }

    const appliedRule = ruleChanges.length > 0
    return { content: processedContent, appliedRule, ruleChanges }
  }

  private async evaluateConditions(
    rule: AugmentationRule,
    content: string,
    filePath: string,
    context: AugmentationContext
  ): Promise<boolean> {
    if (rule.conditions.length === 0) {
      return true // No conditions means always apply
    }

    // All conditions must pass (AND logic)
    for (const condition of rule.conditions) {
      const passes = await this.conditionEvaluator.evaluate(condition, content, filePath, context)
      if (!passes) {
        return false
      }
    }

    return true
  }

  private getApplicableRules(fileName: string): AugmentationRule[] {
    return this.rules.filter(rule =>
      rule.target_files.some(pattern => minimatch(fileName, pattern))
    )
  }

  async reload(): Promise<void> {
    this.ruleLoader.reset()
    await this.initialize()
  }

  getRules(): AugmentationRule[] {
    return this.rules
  }

  async previewChanges(
    filePath: string,
    content: string,
    context: AugmentationContext = {}
  ): Promise<AugmentationResult> {
    // Same as processFile but with dryRun context
    return this.processFile(filePath, content, { ...context, dryRun: true })
  }
}