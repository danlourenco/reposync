#!/bin/bash

# Script to push the husky hooks branch and create a pull request
# Run this script from your local machine after pulling the changes

echo "📌 Creating Pull Request for Husky Hooks..."

# First, make sure we're on the right branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "feat/add-husky-hooks" ]; then
    echo "❌ Error: Not on feat/add-husky-hooks branch"
    echo "   Please run: git checkout feat/add-husky-hooks"
    exit 1
fi

# Push the branch
echo "🚀 Pushing branch to origin..."
git push -u origin feat/add-husky-hooks

# Create the pull request
echo "📝 Creating pull request..."
gh pr create --title "feat: add husky pre-push and pre-commit hooks" --body "$(cat <<'EOF'
## Summary
- Add Husky Git hooks to enforce code quality before commits and pushes
- Configure pre-commit hook to run linting (non-blocking warnings)
- Configure pre-push hook to run linting and tests (blocking on failures)
- Add ESLint configuration for TypeScript
- Disable console warnings in ESLint for cleaner output
- Add .gitignore to exclude node_modules and build artifacts

## Changes
- **.husky/pre-commit**: Runs linting on commit with warnings only
- **.husky/pre-push**: Runs linting and tests before push (blocks on failure)
- **packages/nsync/.eslintrc.json**: ESLint configuration for TypeScript
- **.gitignore**: Ignore common files and directories
- **package.json**: Add husky dependency and prepare script

## Test Plan
- [x] Pre-commit hook runs on `git commit`
- [x] Pre-push hook runs on `git push`
- [x] ESLint configuration works with TypeScript files
- [x] Console warnings are disabled in ESLint

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"

echo "✅ Pull request created successfully!"