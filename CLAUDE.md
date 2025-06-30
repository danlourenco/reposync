# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains **RepoSync** - a multi-repository synchronization tool built as a modern monorepo:

1. **Root Workspace** (`reposync`) - Monorepo manager with automated versioning and release system
2. **TypeScript CLI** (`packages/nsync/`) - Modern CLI tool built with unjs.io ecosystem (citty, c12, consola)

The tool synchronizes changes from a source repository to multiple target repositories while preserving repository-specific files and automatically creating pull requests.

## Common Development Commands

### Monorepo Development
```bash
# Install dependencies (from root)
npm install

# Build all packages
npm run build

# Run tests across all packages
npm run test

# Lint all packages
npm run lint

# Clean all build artifacts
npm run clean
```

### TypeScript CLI Development (packages/nsync/)
```bash
# Navigate to CLI package
cd packages/nsync

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Development mode (no build required)
npm run dev sync --help

# Run with built binary
./dist/index.mjs sync --help
```

### Testing the CLI
```bash
# Check system status
npx @reposync/nsync status

# Validate configuration
npx @reposync/nsync config validate

# Run dry-run sync
npx @reposync/nsync sync --dry-run

# Interactive configuration setup
npx @reposync/nsync config set
```

### Automated Versioning
```bash
# Preview next release
npm run version:dry-run

# Force specific version bump
npm run version:patch
npm run version:minor
npm run version:major

# Auto-detect version from commits
npm run version:auto
```

## Project Architecture

### Monorepo Structure
```
reposync/                          # Root workspace
├── packages/nsync/                # Main CLI package (@reposync/nsync)
├── scripts/auto-version.js        # Automated versioning script
├── .husky/                        # Git hooks
│   ├── pre-commit                 # Linting (non-blocking)
│   ├── pre-push                   # Linting + tests (blocking)
│   └── post-merge                 # Auto-versioning on main
└── CHANGELOG.md                   # Unified changelog
```

### TypeScript CLI Structure (`packages/nsync/`)
- **Commands** (`src/commands/`) - Citty command implementations
  - `sync.ts` - Main synchronization command
  - `status.ts` - System status checking
  - `config/` - Configuration management commands
- **Core** (`src/core/`) - Core business logic
  - `sync.ts` - Main sync orchestration
  - `git.ts` - Git operations using simple-git
  - `github.ts` - GitHub API integration using Octokit
  - `file-sync.ts` - File operations and preservation
  - `file-update.ts` - File preservation DSL system
  - `augmentation/` - Rule-based file augmentation engine
- **Types** (`src/types/`) - TypeScript type definitions and Zod schemas
- **Utils** (`src/utils/`) - Utility functions and validation

### Configuration Format
```json
{
  "source_repo": "https://github.com/company/source-repo.git",
  "target_repos": [
    {
      "name": "Production App",
      "url": "https://github.com/company/prod-app.git"
    }
  ],
  "file_preservation": [
    {
      "files": ["InfrastructureAsCodeFile*"],
      "description": "Update artifact versions",
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

### Key Features Implemented
- Multi-repository synchronization with GitHub API integration
- Interactive tag selection from GitHub releases
- **File preservation system** with JSON-based DSL for version updates
- **Rule-based augmentation engine** with YAML configuration
- Automated pull request creation with detailed descriptions
- Dry-run mode for safe previewing
- Configuration validation and management
- **Automated versioning** with semantic version detection
- **Unified changelog generation** using changelogen
- Comprehensive error handling and logging

### Technology Stack
- **TypeScript CLI**: Modern unjs.io ecosystem (fully implemented)
  - **citty** - CLI framework with type-safe commands
  - **c12** - Configuration management with multiple sources
  - **consola** - Enhanced logging and progress indicators
  - **changelogen** - Automated changelog generation
  - **simple-git** - Git operations
  - **@octokit/rest** - GitHub API integration
  - **Zod** - Runtime validation and type safety
  - **Vitest** - Fast unit testing
- **Development Tools**:
  - **ESLint** - TypeScript linting
  - **Husky** - Git hooks for code quality
  - **unbuild** - Modern build system
- **Monorepo Management**:
  - **npm workspaces** - Package management
  - **Semantic versioning** - Automated releases
  - **Conventional commits** - Structured commit messages

## Development Notes

- **Modern stack**: Fully migrated from OCLIF to unjs.io ecosystem
- **Unified versioning**: All packages maintain synchronized versions
- **Automated releases**: Post-merge hooks trigger versioning on main branch
- **Two file update systems**:
  1. **File preservation** (primary): JSON-based DSL in main config
  2. **Augmentation engine** (supplementary): YAML-based rules with conditions/actions
- **Git hooks enforce quality**: Pre-commit linting, pre-push testing
- **Prerequisites**: `git`, `gh` (GitHub CLI), Node.js 18+

## Testing Configuration

Test configuration files are provided:
- `packages/nsync/sync-config.json.example` - Template configuration
- `packages/nsync/sync-config.json` - Active configuration (gitignored)
- `packages/nsync/sync-config.enterprise.json.example` - Enterprise GitHub example

## Automated Release System

The repository uses automated semantic versioning:

1. **Conventional commits** trigger releases (feat:, fix:, BREAKING CHANGE)
2. **Post-merge hook** analyzes commits and determines version bump
3. **All packages updated** to unified version
4. **Changelog generated** with changelogen
5. **Git tag created** and pushed automatically

### Manual Release Commands
```bash
npm run version:patch     # 1.0.0 → 1.0.1
npm run version:minor     # 1.0.0 → 1.1.0  
npm run version:major     # 1.0.0 → 2.0.0
npm run version:dry-run   # Preview changes
```

# Bash commands
- npm run build: Build all workspace packages
- npm run test: Run tests across all packages
- npm run lint: Lint all packages
- npm run typecheck: Run TypeScript compiler checks

# Code style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')

# Workflow
- Be sure to typecheck when you're done making a series of code changes
- Follow this recommended workflow: Write tests, commit; code, iterate, commit
- Write tests based on expected input/output pairs. We're adopting test-driven development; avoids creating mock implementations for functionality that doesn't exist yet in the codebase.
- Then, run the tests and confirm they fail. Do not write any implementation code yet.
- Commit the tests when the user is satisfied with them.
- Next, write code that passes the tests; do NOT modify the tests. Keep going until all tests pass. 
- Please verify with independent subagents that the implementation isn't overfitting to the tests
- Commit the code when the user is satisfied with the changes.

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.