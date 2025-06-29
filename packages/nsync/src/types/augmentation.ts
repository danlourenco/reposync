export interface AugmentationRule {
  name: string
  description?: string
  enabled?: boolean
  target_files: string[]  // glob patterns
  conditions: Condition[]
  actions: Action[]
}

export interface Condition {
  type: 'yaml_has_key' | 'json_has_key' | 'value_matches' | 'file_exists' | 'custom'
  key?: string
  pattern?: string
  script?: string  // for custom conditions
}

export interface Action {
  type: 'update_version_in_value' | 'replace_value' | 'append_to_array' | 'set_value' | 'custom'
  key?: string
  value?: any
  version_pattern?: string
  version_source?: 'git_tag' | 'package_json' | 'literal'
  comparison?: 'greater_than' | 'always' | 'if_different'
  script?: string  // for custom actions
}

export interface AugmentationContext {
  gitTag?: string
  sourceVersion?: string
  targetRepository?: string
  dryRun?: boolean
}

export interface AugmentationConfig {
  file_augmentation?: {
    rules?: AugmentationRule[]
    plugins?: string[]
  }
}

export interface AugmentationResult {
  changed: boolean
  originalContent: string
  newContent: string
  appliedRules: string[]
  changes: ChangeDescription[]
}

export interface ChangeDescription {
  rule: string
  action: string
  key?: string
  oldValue?: any
  newValue?: any
  description: string
}