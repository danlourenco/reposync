# File Augmentation System

The RepoSync augmentation system provides a flexible, rule-based approach to updating files during repository synchronization. This allows you to define custom logic for modifying preserved files without hardcoding company-specific logic into the tool.

## Overview

The augmentation system works by:
1. Loading rules from multiple configuration sources
2. Matching files against rule patterns
3. Evaluating conditions to determine if rules should apply
4. Executing actions to modify file contents
5. Preserving file format (YAML/JSON) and structure

## Configuration Sources

Rules are loaded from the following locations in priority order:
1. **Global User Config**: `~/.reposync/rules.yaml`
2. **Project Config**: `./.reposync/rules.yaml`
3. **Main Config**: Via c12 config resolution (`.reposyncrc`, etc.)
4. **Environment Variable**: Path specified in `REPOSYNC_RULES_PATH`

All rules from all sources are merged together.

## Rule Structure

Each rule consists of:
- **name**: Unique identifier for the rule
- **description**: Human-readable description (optional)
- **enabled**: Whether the rule is active (default: true)
- **target_files**: Array of glob patterns to match files
- **conditions**: Array of conditions that must all be met
- **actions**: Array of actions to perform when conditions are satisfied

## Supported Conditions

### yaml_has_key
Checks if a YAML file contains a specific key at any level.

```yaml
conditions:
  - type: "yaml_has_key"
    key: "version"
```

### json_has_key
Checks if a JSON file contains a specific key at any level.

```yaml
conditions:
  - type: "json_has_key"
    key: "dependencies"
```

### value_matches
Checks if a value at a specific path matches a regular expression pattern.

```yaml
conditions:
  - type: "value_matches"
    path: "remote_artifact"
    pattern: ".*-\\d+\\.\\d+\\.\\d+\\.zip$"
```

## Supported Actions

### replace_value
Replaces the entire value at a specific path.

```yaml
actions:
  - type: "replace_value"
    path: "version"
    value: "{{version}}"
```

### update_version_in_value
Updates only the version portion within a value, preserving the rest.

```yaml
actions:
  - type: "update_version_in_value"
    path: "remote_artifact"
    pattern: "(.*-)\\d+\\.\\d+\\.\\d+(\\..*)$"
    version: "{{version}}"
```

### append_to_array
Adds an item to an array if it doesn't already exist.

```yaml
actions:
  - type: "append_to_array"
    path: "tags"
    value: "{{tag}}"
```

## Template Variables

The following variables are available in action values:
- `{{version}}` - Version number without 'v' prefix (e.g., "2.1.0")
- `{{tag}}` - Full git tag (e.g., "v2.1.0")
- `{{tag_without_v}}` - Same as version
- `{{sync_version}}` - Same as version
- Additional variables from sync configuration

## Complete Example

Here's a comprehensive example that demonstrates various features:

```yaml
file_augmentation:
  rules:
    # Update version in YAML configs
    - name: "Update config version"
      description: "Updates version field in configuration files"
      target_files:
        - "config.yml"
        - "config.yaml"
        - "**/config.yml"
      conditions:
        - type: "yaml_has_key"
          key: "version"
      actions:
        - type: "replace_value"
          path: "version"
          value: "{{version}}"
    
    # Update artifact references
    - name: "Update deployment artifacts"
      target_files:
        - "deploy/*.yml"
      conditions:
        - type: "yaml_has_key"
          key: "artifact"
        - type: "value_matches"
          path: "artifact.url"
          pattern: ".*-\\d+\\.\\d+\\.\\d+\\.(zip|tar\\.gz)$"
      actions:
        - type: "update_version_in_value"
          path: "artifact.url"
          pattern: "(.*-)\\d+\\.\\d+\\.\\d+(\\..*)$"
          version: "{{version}}"
    
    # Update package.json
    - name: "Update npm package version"
      target_files:
        - "package.json"
      conditions:
        - type: "json_has_key"
          key: "version"
      actions:
        - type: "replace_value"
          path: "version"
          value: "{{version}}"
    
    # Add sync metadata
    - name: "Track sync history"
      enabled: false  # Optional rule
      target_files:
        - ".sync-metadata.yml"
      conditions: []  # No conditions - always apply
      actions:
        - type: "replace_value"
          path: "last_sync.version"
          value: "{{version}}"
        - type: "replace_value"
          path: "last_sync.tag"
          value: "{{tag}}"
        - type: "append_to_array"
          path: "sync_history"
          value: "{{tag}}"
```

## Best Practices

1. **Test Rules**: Always test rules in dry-run mode first
2. **Use Specific Patterns**: Make file patterns as specific as possible
3. **Validate Conditions**: Ensure conditions are specific enough to avoid false matches
4. **Version Patterns**: Use capture groups in regex patterns for update_version_in_value
5. **Enable Gradually**: Start with rules disabled and enable after testing

## Debugging

To debug augmentation rules:
1. Run sync with `--dry-run` to preview changes
2. Check logs for rule matching and evaluation
3. Verify file patterns match intended files
4. Test regex patterns separately
5. Use the augmentation engine tests as examples

## Security Considerations

- Rules are loaded from local filesystem only
- No remote rule loading is supported
- Sensitive data should not be hardcoded in rules
- Use template variables instead of hardcoded values
- Keep company-specific rules in private configuration files