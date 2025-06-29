# Multi-Repo Sync Script

A robust, production-ready script for syncing changes from a canonical repository to multiple target repositories while preserving infrastructure configurations and automatically creating draft pull requests.

## 🎉 Key Features

✅ **Multi-repo sync** - Handles multiple target repositories (Repo B, C, etc.)  
✅ **Interactive tag selection** - Uses GitHub CLI to fetch and display available tags  
✅ **Draft PR creation** - Automatically creates draft pull requests with detailed descriptions  
✅ **Config file preservation** - Safely preserves infrastructure configuration files  
✅ **Config file version updates** - Optionally updates `remote_artifact` versions to match selected tags  
✅ **Dry-run mode** - Preview operations with `--dry-run` before execution  
✅ **Configuration management** - JSON config file support with validation  
✅ **Comprehensive validation** - Validates prerequisites, repository access, and permissions  
✅ **Robust error handling** - Graceful failure handling with detailed error messages  
✅ **Security enhancements** - Secure temporary directory creation and input validation  

## 📋 Usage Examples

```bash
# Basic usage with config file
./repo-sync.sh

# Preview what would happen (recommended first run)
./repo-sync.sh --dry-run

# Force interactive setup
./repo-sync.sh --interactive

# One-time run without saving config
./repo-sync.sh --no-save

# Get help
./repo-sync.sh --help
```

## 🔧 Setup Required

1. **Install prerequisites**: `git`, `rsync`, `gh` (GitHub CLI), `jq`
2. **Authenticate GitHub CLI**: `gh auth login`
3. **Configure repositories**: Copy `sync-config.json.example` to `sync-config.json` and update URLs
4. **Test first**: Run with `--dry-run` to preview operations

## 🔄 Workflow Overview

1. **Repository Validation** - Validates access to source and target repositories
2. **Tag Selection** - Interactive selection from available GitHub tags
3. **Config File Update Prompt** - Optional version update in `remote_artifact` paths
4. **Sync Execution** - Syncs files while preserving config files
5. **Draft PR Creation** - Creates draft pull requests with comprehensive descriptions

## 📝 Config File Version Updates

The script can automatically update version numbers in config file YAML configurations:

- **Detection**: Finds `remote_artifact` keys with versioned paths
- **Pattern Matching**: Updates versions in paths like `com/org/my-api-0.1.44.zip`
- **Tag Processing**: Extracts version from git tags (removes 'v' prefix)
- **Example**: Tag `v0.1.78` updates `my-api-0.1.44.zip` → `my-api-0.1.78.zip`

### Config File Update Flow

1. User selects a git tag (e.g., `v0.1.78`)
2. Script extracts version number (`0.1.78`)
3. User is prompted: "Update config file versions? (y/N)"
4. If confirmed, updates `remote_artifact` paths in all target repositories
5. Changes are documented in commit messages and PR descriptions

## 🛡️ Security & Robustness Features

- **Secure temporary directories** - Uses `mktemp` with random suffixes
- **Comprehensive error handling** - Graceful handling of git operations and file operations
- **Repository access validation** - Verifies repository accessibility before starting
- **Input sanitization** - Prevents shell injection in user inputs
- **Lock file mechanism** - Prevents concurrent script executions
- **Rollback capability** - Preserves original config files with backup/restore

## 📋 Pull Request Features

- **Draft PRs by default** - All PRs are created as drafts for review
- **Canonical repo attribution** - PR descriptions include source repository name
- **Comprehensive summaries** - Detailed change documentation and testing checklists
- **Version update tracking** - Documents config file version changes when applicable

The script provides a complete, production-ready solution for multi-repository synchronization with robust error handling, security features, and comprehensive documentation.