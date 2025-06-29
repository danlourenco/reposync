# RepoSync Monorepo

A multi-repository synchronization tool with different implementations for comparison and evaluation.

## Packages

This monorepo contains two different implementations of the same sync tool concept:

### 🐚 [@reposync/shell-sync](./packages/shell-sync/)
**Bash Script Implementation**
- Original shell script approach
- Lightweight and dependency-free
- Uses GitHub CLI (`gh`) for API interactions
- Perfect for simple automation and CI/CD workflows

```bash
cd packages/shell-sync
chmod +x repo-sync.sh
./repo-sync.sh --help
```

### 🎤 [@reposync/nsync](./packages/nsync/)
**Modern CLI Tool (*NSYNC Style!)**
- Built with modern UnJS ecosystem (citty, c12, consola)
- TypeScript implementation with excellent DX
- Rich terminal UI with progress indicators
- Advanced configuration management

```bash
cd packages/nsync
npm run build
npm run dev -- --help
```

## Getting Started

### Prerequisites
- Node.js 18+
- Git
- GitHub CLI (`gh`) authenticated

### Installation
```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run tests for all packages
npm run test

# Lint all packages
npm run lint
```

### Configuration
Each package uses the same configuration format. See `sync-config.json.example` in each package directory for the template:

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

## Development

### Workspace Commands
```bash
# Build specific package
npm run build --workspace=@reposync/nsync

# Test specific package  
npm run test --workspace=@reposync/nsync

# Run dev mode for nsync
npm run dev --workspace=@reposync/nsync
```

### Package Comparison
Use this monorepo to:
- Compare implementation approaches (shell vs modern JS)
- Evaluate performance and user experience
- Test different deployment strategies
- Experiment with new features across implementations

## License
MIT