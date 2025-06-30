# File Preservation System

The *NSYNC File Preservation System provides a powerful DSL for updating preserved files during repository synchronization. It allows you to define rules that automatically update version references, configuration values, and other file contents while preserving repository-specific files.

## Overview

The file preservation system is the **primary method** for handling file updates during sync operations. It uses a JSON-based configuration in your main sync config file and supports pattern matching, field updates, and version management.

## Configuration

File preservation rules are defined in the `file_preservation` array of your main sync configuration:

```json
{
  "source_repo": "https://github.com/company/source.git",
  "target_repos": [...],
  "file_preservation": [
    {
      "files": ["InfrastructureAsCodeFile*", "*.config.yml"],
      "description": "Update artifact versions in infrastructure files",
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
  ]
}
```

## Rule Types

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

**Example Transformation:**
```yaml
# Before (with sync version v0.1.78)
remote_artifact: com/org/my-api-0.1.44.zip
tool_binary: helper-tool-1.2.0.jar

# After
remote_artifact: com/org/my-api-0.1.78.zip
tool_binary: helper-tool-0.1.78.jar
```

### 2. JSON Field Updates (`type: "json_field"`)

Updates specific fields in JSON files.

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

**Example Transformation:**
```json
// Before
{
  "name": "my-app",
  "version": "1.0.0"
}

// After (with sync version 2.1.0)
{
  "name": "my-app", 
  "version": "2.1.0"
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

### 4. Regex Updates (`type: "regex"`)

Custom regex-based find and replace operations.

**Configuration:**
```json
{
  "name": "docker_images",
  "type": "regex",
  "regex": "image: (?<registry>[\\w./]+)/(?<image>[\\w-]+):(?<version>[\\w.-]+)",
  "replacement": "image: {registry}/{image}:{tag_without_v}",
  "condition": {
    "type": "version_compare",
    "operator": ">",
    "current": "{version}",
    "new": "{tag_without_v}"
  }
}
```

## Version Strategies

### `replace_if_newer` (default)
Only update if the new version is semantically higher than the current version.

### `always_replace`
Always update regardless of version comparison.

### `never_replace`
Never update the value (preserve only).

### `replace_if_newer_or_equal`
Update if the new version is higher than or equal to the current version.

## Template Variables

### Built-in Variables
- `{tag}` - Full git tag (e.g., `v2.1.0`)
- `{tag_without_v}` - Tag without 'v' prefix (e.g., `2.1.0`)
- `{version}` - Same as `{tag_without_v}`
- `{sync_version}` - Same as `{version}` (used in some examples)

### Template Processing

Template variables are processed during rule execution and replaced with actual values from the sync context. The system handles common version formatting patterns automatically.

**Example:**
```json
{
  "value": "{tag_without_v}",  // Becomes: "2.1.0"
  "replacement": "image: {registry}/{image}:{tag_without_v}"  // Dynamic replacement
}
```

## Complete Examples

### Example 1: Infrastructure Files

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

### Example 2: Multi-File Updates

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
    }
  ]
}
```

### Example 3: Docker Image Updates

```json
{
  "file_preservation": [
    {
      "files": ["k8s/*.yaml", "deployment.yml"],
      "description": "Update container image tags",
      "update_rules": [
        {
          "name": "container_images",
          "type": "regex",
          "regex": "image: (?<registry>[\\w./]+)/(?<image>[\\w-]+):(?<version>[\\w.-]+)",
          "replacement": "image: {registry}/{image}:{tag_without_v}",
          "condition": {
            "type": "version_compare",
            "operator": ">",
            "current": "{version}",
            "new": "{tag_without_v}"
          }
        }
      ]
    }
  ]
}
```

## Best Practices

1. **Use specific file patterns** to avoid unintended matches
2. **Test with dry-run mode** (`--dry-run`) before applying changes
3. **Use appropriate version strategies** for your use case
4. **Keep rule names descriptive** for easier debugging
5. **Group related updates** in the same preservation rule when possible

## Additional Augmentation System

*NSYNC also includes a separate augmentation engine that loads rules from YAML files (`~/.reposync/rules.yaml`, `./.reposync/rules.yaml`, etc.). This is an additional feature that runs **alongside** the file preservation system and uses a different syntax with conditions and actions. See `rules.example.yaml` for examples of this format.

The file preservation system described above is the **primary method** for file updates and should be used for most use cases. The augmentation engine is supplementary and designed for more complex scenarios requiring conditional logic.