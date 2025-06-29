# *NSYNC

> 🎤 Multi-repository synchronization tool

A modern TypeScript CLI for synchronizing changes from a source repository to multiple target repositories while preserving repository-specific configurations and automatically creating pull requests.

[![Built with UnJS](https://img.shields.io/badge/Built%20with-UnJS-00DC82)](https://unjs.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

## ✨ Features

- **🎯 Multi-Repository Sync** - Sync changes from one source to multiple target repositories
- **🏢 Enterprise GitHub Support** - Works with GitHub Enterprise Server and custom API endpoints
- **📁 File Preservation** - Automatically preserves `InfrastructureAsCodeFile` and other specified configuration files
- **🔄 Version Management** - Automatically updates version references in preserved files
- **🚀 Automated PRs** - Creates draft pull requests with comprehensive descriptions
- **🎭 Dry Run Mode** - Preview all operations before execution
- **⚙️ Configuration Management** - Save and reuse repository configurations
- **🎨 Professional UI** - Beautiful CLI with progress indicators and themed output
- **🕺 Animated Exit** - Because everyone deserves a little fun!

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g nsync

# Or run directly
npx nsync --help
```

### Prerequisites

Ensure you have the following tools installed:

- **Node.js** 18 or higher
- **git** - For repository operations
- **gh** (GitHub CLI) - For authentication and API access

```bash
# Authenticate with GitHub CLI
gh auth login
```

### Basic Usage

1. **Check system status**:
   ```bash
   nsync status
   ```

2. **Create configuration**:
   ```bash
   nsync config set
   ```

3. **Run a dry-run sync**:
   ```bash
   nsync sync --dry-run
   ```

4. **Execute actual sync**:
   ```bash
   nsync sync
   ```

## 📋 Commands

### `nsync sync`

Synchronize changes from source repository to target repositories.

```bash
nsync sync [options]

Options:
  -d, --dry-run           Preview operations without making changes
  -i, --interactive       Force interactive mode (ignore config file)
  -t, --tag <tag>         Specific tag to sync (skips interactive selection)
  -c, --config <path>     Path to configuration file
      --no-save           Don't save configuration for future use
```

**Examples:**
```bash
# Basic sync with latest tag
nsync sync

# Preview what would happen
nsync sync --dry-run

# Sync specific tag
nsync sync --tag v2.1.0

# Use custom config file
nsync sync --config ./configs/production.json
```

### `nsync config`

Manage configuration settings.

#### `nsync config set`

Create or update configuration interactively.

```bash
nsync config set [options]

Options:
  -c, --config <path>     Path to configuration file
  -f, --force            Overwrite existing configuration without confirmation
```

#### `nsync config get`

Display current configuration.

```bash
nsync config get [options]

Options:
  -c, --config <path>     Path to configuration file
      --json             Output in JSON format
```

#### `nsync config validate`

Validate configuration and repository access.

```bash
nsync config validate [options]

Options:
  -c, --config <path>     Path to configuration file
  -v, --verbose          Show detailed validation information
```

### `nsync status`

Show current system status and configuration.

```bash
nsync status [options]

Options:
  -c, --config <path>     Path to configuration file
```

## ⚙️ Configuration

### Configuration File Format

*NSYNC uses a JSON configuration file (default: `sync-config.json`):

```json
{
  "source_repo": "https://github.com/company/source-repo.git",
  "target_repos": [
    {
      "name": "Production App",
      "url": "https://github.com/company/prod-app.git"
    },
    {
      "name": "Staging Environment",
      "url": "https://github.com/company/staging-app.git"
    }
  ]
}
```

### Enterprise GitHub Configuration

For GitHub Enterprise Server or custom GitHub instances:

```json
{
  "source_repo": "https://github.enterprise.com/company/source-repo.git",
  "target_repos": [
    {
      "name": "Enterprise App",
      "url": "https://github.enterprise.com/company/app.git"
    }
  ],
  "github": {
    "api_url": "https://github.enterprise.com/api/v3",
    "token": "ghp_your_enterprise_token_here"
  }
}
```

### Environment Variables

- `GITHUB_TOKEN` or `GH_TOKEN` - GitHub personal access token
- `GITHUB_API_URL` - Custom GitHub API URL (for enterprise)

## 🔄 How It Works

*NSYNC follows this workflow:

1. **Configuration Loading** - Loads repository configuration from file or prompts interactively
2. **Tag Selection** - Fetches available tags from source repository for selection
3. **Validation** - Validates prerequisites, configuration, and repository access
4. **Source Clone** - Clones source repository at the specified tag to temporary directory
5. **Target Processing** - For each target repository:
   - Clones target repository to temporary directory
   - Creates timestamped release branch (`release/YYYYMMDD-HHMMSS`)
   - Backs up preserved files (like `InfrastructureAsCodeFile`)
   - Syncs all files from source (excluding `.git`, `node_modules`, etc.)
   - Restores preserved files
   - Updates version references in preserved files (optional)
   - Commits changes with detailed message
   - Pushes release branch to remote
   - Creates draft pull request with comprehensive description
6. **Cleanup** - Removes temporary directories
7. **Summary** - Displays results and PR links

## 📁 File Management

### Preserved Files

By default, *NSYNC preserves these files during sync:
- `InfrastructureAsCodeFile`
- `InfrastructureAsCodeFile.yml`
- `InfrastructureAsCodeFile.yaml`

### Excluded Patterns

These patterns are automatically excluded from sync:
- `.git/` - Git repository data
- `.github/` - GitHub workflows and settings
- `node_modules/` - Node.js dependencies
- `.DS_Store` - macOS system files
- `*.log` - Log files
- `.env*` - Environment files

### Version Updates

*NSYNC can automatically update version references in InfrastructureAsCodeFile configurations:

**Before:**
```yaml
remote_artifact: my-service-1.2.3.zip
another_tool: helper-0.5.1.jar
```

**After (syncing tag v2.1.0):**
```yaml
remote_artifact: my-service-2.1.0.zip
another_tool: helper-2.1.0.jar
```

## 🔧 Advanced Usage

### Multiple Configuration Files

Manage different environments with separate config files:

```bash
# Production sync
nsync sync --config ./configs/production.json

# Staging sync
nsync sync --config ./configs/staging.json

# Development sync
nsync sync --config ./configs/development.json
```

### Automation Scripts

Create scripts for automated synchronization:

```bash
#!/bin/bash
# automated-sync.sh

set -e

echo "🎤 Starting automated *NSYNC..."

# Validate configuration
nsync config validate --config ./production.json

# Run sync with specific tag
nsync sync --config ./production.json --tag "v${VERSION}" --no-save

echo "✅ Sync completed successfully!"
```

### CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Sync Repositories

on:
  release:
    types: [published]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          
      - name: Install *NSYNC
        run: npm install -g nsync
        
      - name: Authenticate GitHub CLI
        run: gh auth login --with-token <<< "${{ secrets.GITHUB_TOKEN }}"
        
      - name: Sync repositories
        run: nsync sync --tag ${{ github.event.release.tag_name }} --config ./sync-config.json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Custom GitHub Hosts

For self-hosted GitHub instances:

```bash
# Set environment variables
export GITHUB_API_URL="https://github.company.com/api/v3"
export GITHUB_TOKEN="your_enterprise_token"

# Or use configuration file
nsync sync --config ./enterprise-config.json
```

## 🚨 Error Handling

*NSYNC provides detailed error messages and codes:

- **`CONFIG_NOT_FOUND`** - Configuration file not found
- **`CONFIG_INVALID`** - Configuration format is invalid
- **`GITHUB_API_FAILED`** - GitHub API error
- **`CLONE_FAILED`** - Repository clone failed
- **`SYNC_FAILED`** - File synchronization failed
- **`BRANCH_FAILED`** - Branch creation failed
- **`COMMIT_FAILED`** - Commit operation failed
- **`PUSH_FAILED`** - Push operation failed
- **`PR_CREATE_FAILED`** - Pull request creation failed

## 📊 Pull Request Templates

*NSYNC generates comprehensive pull request descriptions:

```markdown
## 🎤 *NSYNC Repository Synchronization

### Summary
This pull request synchronizes changes from the source repository with the latest updates.

**Source Repository:** https://github.com/company/source-repo.git
**Source Tag/Branch:** v2.1.0
**Release Branch:** release/20231201-143022
**Sync Timestamp:** 2023-12-01T14:30:22.123Z

### Changes
- ✅ Synchronized all files from source repository
- ✅ Preserved repository-specific configurations
- ✅ Updated InfrastructureAsCodeFile version references

### Testing Checklist
- [ ] Verify all expected files are present
- [ ] Check that InfrastructureAsCodeFile configurations are preserved
- [ ] Validate any version updates in configuration files
- [ ] Run local tests to ensure functionality
- [ ] Review changes for any unexpected modifications

### Next Steps
1. Review the changes in this pull request
2. Run any necessary tests or validations
3. Merge when ready to deploy synchronized changes

---
*This PR was created automatically by the *NSYNC CLI tool*
🎤 *Generated with precision, synchronized with style* 🕺
```

## 🔒 Security Considerations

- **Token Storage** - Never commit GitHub tokens to repositories
- **Enterprise Access** - Ensure proper permissions for enterprise GitHub instances
- **Branch Protection** - *NSYNC creates draft PRs by default for review
- **File Validation** - Always review synchronized files before merging
- **Access Control** - Limit who can run sync operations in production

## 🐛 Troubleshooting

### Common Issues

**Authentication Errors:**
```bash
# Re-authenticate with GitHub CLI
gh auth logout
gh auth login
```

**Repository Access Issues:**
```bash
# Validate repository access
nsync config validate --verbose
```

**Configuration Problems:**
```bash
# Check configuration format
nsync config get --json | jq .
```

**Network Issues:**
```bash
# Test repository connectivity
git ls-remote https://github.com/your/repo.git
```

### Debug Mode

Enable verbose logging:
```bash
DEBUG=nsync* nsync sync --dry-run
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/reposync/nsync.git
cd nsync

# Install dependencies
npm install

# Run in development mode
npm run dev -- sync --help

# Run tests
npm test

# Build for production
npm run build
```

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with the amazing [UnJS](https://unjs.io/) ecosystem
- ASCII art powered by [Figlet](https://www.npmjs.com/package/figlet)
- Terminal styling by [Chalk](https://www.npmjs.com/package/chalk) and [Gradient String](https://www.npmjs.com/package/gradient-string)
- CLI framework by [Citty](https://citty.unjs.io/)
- Configuration management by [c12](https://c12.unjs.io/)

---

**Made with 🎤 and synchronized with style** 🕺