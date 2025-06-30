#!/usr/bin/env node

/**
 * Automated Versioning and Changelog Generation Script for Monorepo
 * 
 * This script handles unified versioning for the reposync monorepo:
 * 1. Analyzes commits since last release for semantic version bump
 * 2. Updates ALL package.json versions (root + workspaces) to stay synchronized
 * 3. Generates unified CHANGELOG.md using changelogen
 * 4. Handles monorepo-specific concerns (dependencies, build order, publishable packages)
 * 5. Creates unified git tag and release commit
 * 
 * Monorepo Strategy: Unified versioning (all packages use same version)
 * 
 * Usage:
 *   node scripts/auto-version.js [--dry-run] [--force-type=patch|minor|major] [--workspace=package-name]
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { glob } from 'glob'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const forceType = args.find(arg => arg.startsWith('--force-type='))?.split('=')[1]

console.log('🚀 Starting automated versioning process...')
if (isDryRun) console.log('📋 DRY RUN MODE - No changes will be made')

/**
 * Execute command with optional dry-run handling
 */
function runCommand(command, description, critical = true) {
  console.log(`📝 ${description}`)
  if (isDryRun) {
    console.log(`   Would run: ${command}`)
    return ''
  }
  
  try {
    const result = execSync(command, { 
      cwd: rootDir, 
      encoding: 'utf-8',
      stdio: critical ? 'pipe' : 'inherit'
    })
    return result.toString().trim()
  } catch (error) {
    console.error(`❌ Failed: ${description}`)
    console.error(`   Command: ${command}`)
    console.error(`   Error: ${error.message}`)
    if (critical) process.exit(1)
    return ''
  }
}

/**
 * Get the current version from root package.json
 */
function getCurrentVersion() {
  const packagePath = join(rootDir, 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'))
  return packageJson.version
}

/**
 * Get commits since last tag
 */
function getCommitsSinceLastTag() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', { 
      cwd: rootDir, 
      encoding: 'utf-8' 
    }).trim()
    const commits = execSync(`git log ${lastTag}..HEAD --oneline --no-merges`, { 
      cwd: rootDir, 
      encoding: 'utf-8' 
    }).trim()
    return commits ? commits.split('\n') : []
  } catch {
    // No previous tags, get all commits
    const commits = execSync('git log --oneline --no-merges', { 
      cwd: rootDir, 
      encoding: 'utf-8' 
    }).trim()
    return commits ? commits.split('\n') : []
  }
}

/**
 * Analyze commit messages to determine version bump type
 */
function analyzeCommits(commits) {
  let hasBreaking = false
  let hasFeature = false
  let hasFix = false

  for (const commit of commits) {
    const message = commit.toLowerCase()
    
    // Check for breaking changes
    if (message.includes('breaking change') || 
        message.includes('breaking:') ||
        message.includes('!:')) {
      hasBreaking = true
    }
    
    // Check for features
    if (message.startsWith('feat') || message.includes('feat:')) {
      hasFeature = true
    }
    
    // Check for fixes
    if (message.startsWith('fix') || message.includes('fix:')) {
      hasFix = true
    }
  }

  if (hasBreaking) return 'major'
  if (hasFeature) return 'minor'
  if (hasFix) return 'patch'
  return 'patch' // Default to patch for other changes
}

/**
 * Calculate next version based on current version and bump type
 */
function calculateNextVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number)
  
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Invalid bump type: ${bumpType}`)
  }
}

/**
 * Update package.json version in a file
 */
function updatePackageVersion(packagePath, newVersion) {
  const content = readFileSync(packagePath, 'utf-8')
  const packageJson = JSON.parse(content)
  packageJson.version = newVersion
  
  if (!isDryRun) {
    writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n')
  }
  console.log(`   ✅ Updated ${packagePath}`)
}

/**
 * Update all package.json files with new version
 */
async function updateAllPackageVersions(newVersion) {
  console.log(`📦 Updating package versions to ${newVersion}`)
  
  // Update root package.json
  updatePackageVersion(join(rootDir, 'package.json'), newVersion)
  
  // Update workspace packages
  const workspacePackages = await glob('packages/*/package.json', { cwd: rootDir })
  for (const packagePath of workspacePackages) {
    updatePackageVersion(join(rootDir, packagePath), newVersion)
  }
}

/**
 * Generate changelog using changelogen from workspace
 */
function generateChangelog(newVersion) {
  console.log('📝 Generating unified changelog with changelogen')
  
  // Run changelogen from the nsync workspace where it's installed
  // This generates a unified changelog for the entire monorepo
  const changelogCommand = `cd packages/nsync && npx changelogen --release --push=false --tag=v${newVersion} --output=../../CHANGELOG.md`
  runCommand(changelogCommand, 'Generate unified changelog from workspace', false)
  
  // Also update the package-specific changelog if it exists
  const packageChangelogCommand = `cd packages/nsync && npx changelogen --release --push=false --tag=v${newVersion}`
  runCommand(packageChangelogCommand, 'Update package changelog', false)
}

/**
 * Build all packages to ensure everything works before release
 */
function buildAllPackages() {
  console.log('🔨 Building all packages to verify release readiness')
  
  // Run build from root which builds all workspaces
  runCommand('npm run build', 'Build all workspace packages')
  
  // Run tests to ensure nothing is broken
  runCommand('npm run test', 'Run all tests')
  
  // Run linting to ensure code quality
  runCommand('npm run lint', 'Run linting')
}

/**
 * Create git commit and tag
 */
function createReleaseCommit(newVersion, bumpType) {
  console.log(`🏷️  Creating release commit and tag for v${newVersion}`)
  
  // Stage all changes
  runCommand('git add .', 'Stage all changes')
  
  // Create commit with monorepo context
  const commitMessage = `chore(release): v${newVersion}

Release unified version across monorepo packages:
- @reposync/nsync@${newVersion}
- reposync@${newVersion}

Generated ${bumpType} release with automated versioning

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`
  
  runCommand(`git commit -m "${commitMessage}"`, 'Create release commit')
  
  // Create unified tag for entire monorepo
  runCommand(`git tag -a v${newVersion} -m "Release v${newVersion} (unified monorepo release)"`, 'Create git tag')
}

/**
 * Main execution function
 */
async function main() {
  try {
    // Check if we're on main branch
    const currentBranch = runCommand('git branch --show-current', 'Check current branch')
    if (currentBranch !== 'main' && !isDryRun && !forceType) {
      console.log('⚠️  Not on main branch. Use --force-type to override.')
      process.exit(1)
    }

    // Get current version
    const currentVersion = getCurrentVersion()
    console.log(`📋 Current version: ${currentVersion}`)

    // Get commits since last tag
    const commits = getCommitsSinceLastTag()
    console.log(`📊 Found ${commits.length} commits since last release`)
    
    if (commits.length === 0 && !forceType) {
      console.log('✅ No new commits to release')
      process.exit(0)
    }

    // Determine version bump type
    const bumpType = forceType || analyzeCommits(commits)
    console.log(`🔄 Detected bump type: ${bumpType}`)

    // Calculate next version
    const nextVersion = calculateNextVersion(currentVersion, bumpType)
    console.log(`🎯 Next version: ${nextVersion}`)

    if (isDryRun) {
      console.log('\n📋 DRY RUN SUMMARY:')
      console.log(`   Current version: ${currentVersion}`)
      console.log(`   Next version: ${nextVersion}`)
      console.log(`   Bump type: ${bumpType}`)
      console.log(`   Commits to include: ${commits.length}`)
      return
    }

    // Build and test before making any changes
    console.log('🔍 Verifying monorepo state before release...')
    buildAllPackages()

    // Update package versions across monorepo
    await updateAllPackageVersions(nextVersion)

    // Generate unified changelog
    generateChangelog(nextVersion)

    // Create release commit and tag
    createReleaseCommit(nextVersion, bumpType)

    console.log(`\n🎉 Successfully created monorepo release v${nextVersion}!`)
    console.log(`📦 Packages updated:`)
    console.log(`   - reposync@${nextVersion} (root workspace manager)`)
    console.log(`   - @reposync/nsync@${nextVersion} (CLI package)`)
    console.log(`\n📝 To push to remote:`)
    console.log(`   git push origin main && git push origin v${nextVersion}`)
    console.log(`\n📋 Next steps:`)
    console.log(`   - Verify the release in GitHub`)
    console.log(`   - Publish @reposync/nsync to npm if needed: cd packages/nsync && npm publish`)

  } catch (error) {
    console.error('❌ Error during versioning process:', error.message)
    process.exit(1)
  }
}

// Run the script
main()