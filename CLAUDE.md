# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This repository contains **RepoSync** - a multi-repository synchronization tool available in two implementations:

1. **Bash Script** (`repo-sync.sh`) - Original shell script implementation
2. **TypeScript CLI** (`reposync-cli/`) - Modern CLI tool built with OCLIF framework

The tool synchronizes changes from a source repository to multiple target repositories while preserving repository-specific files like `config.yml` and automatically creating pull requests.

## Common Development Commands

### TypeScript CLI Development
```bash
# Navigate to CLI directory
cd reposync-cli

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

# Generate README docs
npm run prepack
```

### Testing the CLI
```bash
# Check system status
./bin/run.js status

# Validate configuration
./bin/run.js config validate

# Run dry-run sync
./bin/run.js sync --dry-run

# Interactive configuration setup
./bin/run.js config set
```

### Bash Script Usage
```bash
# Make executable
chmod +x repo-sync.sh

# Preview operations
./repo-sync.sh --dry-run

# Interactive mode
./repo-sync.sh --interactive

# Get help
./repo-sync.sh --help
```

## Project Architecture

### TypeScript CLI Structure (`reposync-cli/`)
- **Commands** (`src/commands/`) - OCLIF command implementations
  - `sync.ts` - Main synchronization command
  - `status.ts` - System status checking
  - `config/` - Configuration management commands
- **Services** (`src/services/`) - Core business logic
  - `config.ts` - Configuration file handling
  - `git.ts` - Git operations using simple-git
  - `github.ts` - GitHub API integration using Octokit
- **Types** (`src/types/`) - TypeScript type definitions and Zod schemas
- **Utils** (`src/utils/`) - Utility functions and validation

### Configuration Format
Both implementations use JSON configuration files:
```json
{
  "source_repo": "https://github.com/company/source-repo.git",
  "target_repos": [
    {
      "name": "Production App",
      "url": "https://github.com/company/prod-app.git"
    }
  ]
}
```

### Key Features Implemented
- Multi-repository synchronization
- Interactive tag selection from GitHub releases
- File preservation (especially `config.yml` infrastructure files)
- Automated pull request creation with detailed descriptions
- Dry-run mode for safe previewing
- Configuration validation and management
- Comprehensive error handling and logging

### Technology Stack
- **TypeScript CLI**: Currently using OCLIF framework (experimental - considering migration to unjs.io tooling)
  - Current: OCLIF, Zod validation, simple-git, Octokit, Inquirer
  - Under consideration: c12 (config), changelogen (changelogs), citty (CLI), consola (logging)
- **Bash Script**: Native shell scripting with GitHub CLI (`gh`) integration
- **Testing**: Mocha with Chai assertions
- **Linting**: ESLint with OCLIF configuration

## Development Notes

- The TypeScript CLI is experimental and technology choices are still being evaluated
- Currently implemented with OCLIF but considering migration to modern unjs.io ecosystem:
  - **c12** for configuration management (replacing custom config handling)
  - **citty** for CLI framework (replacing OCLIF)
  - **consola** for enhanced logging (replacing basic console output)
  - **changelogen** for automated changelog generation
- Both implementations support the same core functionality
- Configuration files are interchangeable between implementations
- The CLI provides better error handling, progress indicators, and type safety
- Prerequisites: `git`, `gh` (GitHub CLI), Node.js 18+

## Testing Configuration

Test configuration files are provided:
- `sync-config.json.example` - Template configuration
- `sync-config.json` - Active configuration (gitignored in production)


# Bash commands
- npm run build: Build the project
- npm run typecheck: Run the typechecker

# Code style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')

# Workflow
- Be sure to typecheck when you’re done making a series of code changes

- Follow this recommended workflow: Write tests, commit; code, iterate, commit
- Write tests based on expected input/output pairs. We're adopting test-driven development; avoids creating mock implementations for functionality that doesn’t exist yet in the codebase.
- Then,  run the tests and confirm they fail. Do not write any implementation code yet.
- Commit the tests when the user is satisfied with them.
- Next, write code that passes the tests; do NOT modify the tests. Keep going until all tests pass. 
- Please verify with independent subagents that the implementation isn’t overfitting to the tests
- Commit the code when the user is satisfied with the changes.