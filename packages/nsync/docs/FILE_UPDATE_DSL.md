# File Update DSL Documentation

## Overview

The *NSYNC File Update DSL (Domain Specific Language) provides a powerful, flexible system for defining how preserved files should be updated during repository synchronization. Instead of hardcoded logic for specific file types like `InfrastructureAsCodeFile`, this system allows you to define generic rules that can update any file type based on patterns, JSON/YAML fields, or custom regex transformations.

## Table of Contents

- [Basic Concepts](#basic-concepts)
- [Configuration Schema](#configuration-schema)
- [Update Rule Types](#update-rule-types)
- [Version Strategies](#version-strategies)
- [Template Variables](#template-variables)
- [Examples](#examples)
- [Extension Guide](#extension-guide)
- [Migration Guide](#migration-guide)

## Basic Concepts

### File Preservation Rules

A **File Preservation Rule** defines:
- Which files to match (using glob patterns)
- How to update those files (using update rules)
- What context information to use (template variables)

### Update Rules

An **Update Rule** defines:
- What type of update to perform (pattern, JSON field, YAML field, or regex)
- When to apply the update (version strategies)
- How to transform the values (templates and functions)

## Configuration Schema

### File Preservation Rule

```json
{
  "files": ["glob", "patterns", "to", "match"],
  "description": "Human readable description",
  "update_rules": [
    {
      "name": "unique_rule_name",
      "type": "pattern|json_field|yaml_field|regex",
      // ... type-specific options
    }
  ]
}
```

### Complete Configuration Example

```json
{
  "source_repo": "https://github.com/company/source.git",
  "target_repos": [...],
  "file_preservation": [
    {
      "files": ["InfrastructureAsCodeFile*", "*.infrastructure.yml"],
      "description": "Update build artifact versions",
      "update_rules": [
        {
          "name": "artifact_versions",
          "type": "pattern",
          "pattern": "{prefix}-{version}.{ext}",
          "fields": ["remote_artifact", "backup_tool"],
          "version_strategy": "replace_if_newer"
        }
      ]
    }
  ],
  "template_variables": {
    "sync_version": "{tag_without_v}",
    "major_version": "semver_major({tag})"
  }
}
```

## Update Rule Types

### 1. Pattern Updates (`type: "pattern"`)

Updates values that follow a specific pattern like `{name}-{version}.{extension}`.

**Configuration:**
```json
{
  "name": "artifact_versions",
  "type": "pattern",
  "pattern": "{prefix}-{version}.{ext}",
  "fields": ["remote_artifact", "tool_binary"],
  "version_strategy": "replace_if_newer"
}
```

**Supported Placeholders:**
- `{prefix}` - Everything before the version
- `{version}` - The version number (e.g., `1.2.3`)
- `{ext}` - File extension
- `{name}` - Generic name component

**Example Transformation:**
```yaml
# Before (with sync version v0.1.78)
remote_artifact: com/org/my-api-0.1.44.zip

# After
remote_artifact: com/org/my-api-0.1.78.zip
```

### 2. JSON Field Updates (`type: "json_field"`)

Updates specific fields in JSON files using JSONPath-style paths.

**Configuration:**
```json
{
  "name": "package_version",
  "type": "json_field",
  "path": "version",
  "value": "{tag_without_v}",
  "version_strategy": "always_replace"
}
```

**Advanced JSONPath Example:**
```json
{
  "name": "dependency_versions",
  "type": "json_field", 
  "path": "dependencies.@company/shared-lib",
  "value": "^{sync_version}",
  "version_strategy": "replace_if_newer"
}
```

**Example Transformation:**
```json
// Before
{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "@company/shared-lib": "^1.5.0"
  }
}

// After (with sync version 2.1.0)
{
  "name": "my-app", 
  "version": "2.1.0",
  "dependencies": {
    "@company/shared-lib": "^2.1.0"
  }
}
```

### 3. YAML Field Updates (`type: "yaml_field"`)

Updates specific fields in YAML files.

**Configuration:**
```json
{
  "name": "helm_chart_version",
  "type": "yaml_field",
  "path": "appVersion",
  "value": "{tag_without_v}",
  "version_strategy": "always_replace"
}
```

**Example Transformation:**
```yaml
# Before
apiVersion: v2
name: my-chart
version: 0.1.0
appVersion: "1.0.0"

# After (with sync version 2.5.0)
apiVersion: v2
name: my-chart
version: 0.1.0  
appVersion: 2.5.0
```

### 4. Regex Updates (`type: "regex"`)

Custom regex-based find and replace operations.

**Configuration:**
```json
{
  "name": "docker_images",
  "type": "regex",
  "regex": "image: (?<registry>[\\w./]+)/(?<image>[\\w-]+):(?<version>[\\w.-]+)",
  "replacement": "image: {registry}/{image}:{sync_version}",
  "condition": {
    "type": "version_compare",
    "operator": ">",
    "current": "{version}",
    "new": "{sync_version}"
  }
}
```

**Example Transformation:**
```yaml
# Before
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        image: registry.company.com/my-app:1.5.0

# After (with sync version 2.1.0)  
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: app
        image: registry.company.com/my-app:2.1.0
```

## Version Strategies

Version strategies control when updates should be applied based on version comparison.

### `replace_if_newer` (default)

Only update if the new version is semantically higher than the current version.

```json
{
  "version_strategy": "replace_if_newer"
}
```

**Behavior:**
- `1.0.0` → `2.0.0` ✅ (updates)
- `2.0.0` → `1.5.0` ❌ (skips)
- `1.5.0` → `1.5.0` ❌ (skips)

### `replace_if_newer_or_equal`

Update if the new version is higher than or equal to the current version.

```json
{
  "version_strategy": "replace_if_newer_or_equal"
}
```

**Behavior:**
- `1.0.0` → `2.0.0` ✅ (updates)
- `2.0.0` → `1.5.0` ❌ (skips)  
- `1.5.0` → `1.5.0` ✅ (updates)

### `always_replace`

Always update regardless of version comparison.

```json
{
  "version_strategy": "always_replace"
}
```

**Behavior:**
- Always updates the value

### `never_replace`

Never update the value (preserve only).

```json
{
  "version_strategy": "never_replace"
}
```

**Behavior:**
- Never updates, useful for preserving files without modification

## Template Variables

Template variables allow dynamic value substitution in update rules.

### Built-in Variables

The following variables are automatically available:

- `{tag}` - Full git tag (e.g., `v2.1.0`)
- `{tag_without_v}` - Tag without 'v' prefix (e.g., `2.1.0`)  
- `{sync_version}` - Normalized sync version (same as `tag_without_v`)

### Custom Template Variables

Define custom variables in your configuration:

```json
{
  "template_variables": {
    "major_version": "semver_major({tag})",
    "minor_version": "semver_minor({tag})", 
    "docker_tag": "to_docker_tag({tag})",
    "api_version": "v{major_version}"
  }
}
```

### Built-in Template Functions

- `strip_prefix(value, prefix)` - Remove prefix from value
- `semver_major(version)` - Extract major version number
- `semver_minor(version)` - Extract minor version number  
- `semver_patch(version)` - Extract patch version number
- `to_docker_tag(version)` - Convert to Docker-compatible tag
- `normalize_version(version)` - Remove 'v' prefix and trim

**Examples:**
```json
{
  "value": "strip_prefix({tag}, 'v')",        // v2.1.0 → 2.1.0
  "value": "semver_major({tag})",             // v2.1.0 → 2
  "value": "to_docker_tag({tag})",            // v2.1.0-beta → 2-1-0-beta
}
```

## Examples

### Example 1: Basic InfrastructureAsCodeFile Updates

**Configuration:**
```json
{
  "file_preservation": [
    {
      "files": ["InfrastructureAsCodeFile*"],
      "description": "Update artifact versions in build configuration",
      "update_rules": [
        {
          "name": "artifact_versions",
          "type": "pattern", 
          "pattern": "{prefix}-{version}.{ext}",
          "fields": ["remote_artifact", "tool_binary"],
          "version_strategy": "replace_if_newer"
        }
      ]
    }
  ]
}
```

**Input File (`InfrastructureAsCodeFile`):**
```yaml
remote_artifact: com/org/my-api-0.1.44.zip
tool_binary: helper-tool-1.2.0.jar
other_setting: unchanged
```

**Result (with sync tag `v0.1.78`):**
```yaml
remote_artifact: com/org/my-api-0.1.78.zip
tool_binary: helper-tool-0.1.78.jar
other_setting: unchanged
```

### Example 2: Multi-file Updates

**Configuration:**
```json
{
  "file_preservation": [
    {
      "files": ["package.json"],
      "description": "Update NPM package version",
      "update_rules": [
        {
          "name": "npm_version",
          "type": "json_field",
          "path": "version", 
          "value": "{tag_without_v}",
          "version_strategy": "always_replace"
        }
      ]
    },
    {
      "files": ["charts/*/Chart.yaml"],
      "description": "Update Helm chart versions",
      "update_rules": [
        {
          "name": "helm_app_version",
          "type": "yaml_field",
          "path": "appVersion",
          "value": "{tag_without_v}",
          "version_strategy": "always_replace"
        }
      ]
    },
    {
      "files": ["k8s/*.yaml", "deployment.yml"],
      "description": "Update container image tags",
      "update_rules": [
        {
          "name": "container_images",
          "type": "regex",
          "regex": "image: (?<registry>[\\w./]+)/(?<image>[\\w-]+):(?<version>[\\w.-]+)",
          "replacement": "image: {registry}/{image}:{sync_version}",
          "condition": {
            "type": "version_compare",
            "operator": ">",
            "current": "{version}",
            "new": "{sync_version}"
          }
        }
      ]
    }
  ]
}
```

### Example 3: Complex Pattern with Multiple Artifacts

**Configuration:**
```json
{
  "file_preservation": [
    {
      "files": ["InfrastructureAsCodeFile.yml"],
      "description": "Update multiple artifact types",
      "update_rules": [
        {
          "name": "service_artifacts",
          "type": "pattern",
          "pattern": "{prefix}-{version}.{ext}",
          "fields": ["api_service", "worker_service", "migration_tool"],
          "version_strategy": "replace_if_newer"
        },
        {
          "name": "api_version",
          "type": "yaml_field", 
          "path": "api_version",
          "value": "v{semver_major({tag})}",
          "version_strategy": "always_replace"
        }
      ]
    }
  ],
  "template_variables": {
    "major_version": "semver_major({tag})"
  }
}
```

**Input File (`InfrastructureAsCodeFile.yml`):**
```yaml
api_service: company/api-service-1.5.0.zip
worker_service: company/worker-1.3.0.zip  
migration_tool: tools/migrator-1.0.0.jar
api_version: v1
database_host: production-db
```

**Result (with sync tag `v2.1.0`):**
```yaml
api_service: company/api-service-2.1.0.zip
worker_service: company/worker-2.1.0.zip
migration_tool: tools/migrator-2.1.0.jar
api_version: v2
database_host: production-db
```

## Extension Guide

### Adding New Update Rule Types

To add support for new file formats or update mechanisms:

1. **Define the Rule Type:**
```typescript
export type UpdateRuleType = 
  | 'pattern'
  | 'json_field'
  | 'yaml_field'
  | 'regex'
  | 'toml_field'    // New type
  | 'xml_xpath'     // New type
```

2. **Add Handler Method:**
```typescript
private async applyUpdateRule(content: string, rule: UpdateRule, ...): Promise<UpdateRuleResult> {
  switch (rule.type) {
    // ... existing cases
    case 'toml_field':
      return this.applyTomlFieldRule(content, rule, syncVersion, templateVars)
    case 'xml_xpath':
      return this.applyXmlXPathRule(content, rule, syncVersion, templateVars)
  }
}
```

3. **Implement Handler:**
```typescript
private applyTomlFieldRule(content: string, rule: UpdateRule, ...): UpdateRuleResult {
  // Parse TOML, update field, return result
}
```

4. **Update Schema:**
```typescript
export const FilePreservationRuleSchema = z.object({
  // ... existing fields
  update_rules: z.array(z.object({
    type: z.enum(['pattern', 'json_field', 'yaml_field', 'regex', 'toml_field', 'xml_xpath']),
    // ... additional fields for new types
    xpath?: z.string().optional(),  // For XML XPath
    toml_path?: z.string().optional()  // For TOML paths
  }))
})
```

### Adding New Template Functions

1. **Define Function:**
```typescript
const templateFunctions = {
  // ... existing functions
  custom_transform: (value: string, param: string): string => {
    // Your custom logic here
    return transformedValue
  }
}
```

2. **Use in Configuration:**
```json
{
  "value": "custom_transform({tag}, 'parameter')"
}
```

### Adding New Version Strategies

1. **Add Strategy Type:**
```typescript
export type VersionStrategy = 
  | 'replace_if_newer'
  | 'replace_if_newer_or_equal'
  | 'always_replace'
  | 'never_replace'
  | 'replace_if_different'  // New strategy
```

2. **Implement Logic:**
```typescript
private shouldUpdateVersion(current: string, new: string, strategy: VersionStrategy): boolean {
  switch (strategy) {
    // ... existing cases
    case 'replace_if_different':
      return current !== new
  }
}
```

## Migration Guide

### From Hardcoded InfrastructureAsCodeFile Logic

**Old approach:**
```typescript
// Hardcoded in FileSyncService
const updated = await fileSyncService.updateInfrastructureAsCodeFileVersions(targetDir, newVersion)
```

**New approach:**
```json
{
  "file_preservation": [
    {
      "files": ["InfrastructureAsCodeFile*"],
      "update_rules": [
        {
          "name": "artifact_versions",
          "type": "pattern",
          "pattern": "{prefix}-{version}.{ext}",
          "fields": ["remote_artifact"],
          "version_strategy": "replace_if_newer"
        }
      ]
    }
  ]
}
```

```typescript
// In sync workflow
const results = await fileSyncService.updatePreservedFiles(
  targetDir, 
  newVersion,
  templateVars
)
```

### Benefits of Migration

1. **Flexibility:** Define rules for any file type, not just InfrastructureAsCodeFile
2. **Maintainability:** Rules are configuration, not code
3. **Extensibility:** Easy to add new file types and update patterns  
4. **Consistency:** Same system handles all file updates
5. **Testability:** Rules can be tested independently

## Best Practices

### 1. Use Descriptive Rule Names

```json
{
  "name": "kubernetes_image_tags",  // ✅ Clear and specific
  "name": "update_stuff"            // ❌ Vague
}
```

### 2. Group Related Rules

```json
{
  "files": ["k8s/*.yaml"],
  "description": "Kubernetes deployment updates",
  "update_rules": [
    {
      "name": "app_image_tag",
      "type": "regex",
      "regex": "image: myapp:(?<version>[\\w.-]+)",
      "replacement": "image: myapp:{sync_version}"
    },
    {
      "name": "sidecar_image_tag", 
      "type": "regex",
      "regex": "image: sidecar:(?<version>[\\w.-]+)",
      "replacement": "image: sidecar:{sync_version}"
    }
  ]
}
```

### 3. Use Version Strategies Appropriately

- Use `replace_if_newer` for production artifacts
- Use `always_replace` for configuration values
- Use `never_replace` for files that should only be preserved

### 4. Test Rules Thoroughly

Always test your rules with:
- Dry run mode first
- Various version scenarios (newer, older, same)
- Edge cases (malformed files, missing fields)

### 5. Document Your Rules

Add clear descriptions to help team members understand the purpose:

```json
{
  "files": ["deployment/*.yaml"],
  "description": "Updates container image tags in Kubernetes deployments to match the release version",
  "update_rules": [...]
}
```

## Troubleshooting

### Common Issues

1. **Files Not Matching:**
   - Check glob patterns are correct
   - Verify file paths relative to target directory
   - Use broader patterns for testing

2. **Versions Not Updating:**
   - Check version strategy setting
   - Verify version comparison logic
   - Test with `always_replace` strategy

3. **Template Variables Not Expanding:**
   - Ensure variables are defined
   - Check template syntax `{variable_name}`
   - Verify variable scope

4. **Regex Not Matching:**
   - Test regex patterns separately
   - Use named capture groups for complex patterns
   - Escape special characters properly

### Debug Mode

Enable verbose logging to see what the system is doing:

```bash
DEBUG=nsync* nsync sync --dry-run
```

This will show:
- Which files are being matched
- What rules are being applied
- What changes would be made
- Any errors or warnings