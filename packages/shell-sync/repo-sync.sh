#!/bin/bash

# Multi-Repo Sync Script with PR Creation
# Syncs changes from Repo A (canonical) to multiple target repos while preserving config files
# Creates release branches and PRs for each target repo
# Usage: ./repo-sync.sh [--interactive] [--no-save] [--dry-run] [--help]

set -euo pipefail

# Script directory and config file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/sync-config.json"
TEMP_BASE_DIR=$(mktemp -d -t repo-sync.XXXXXXXX)
CONFIG_FILE_NAME="config.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Global variables
SOURCE_REPO=""
declare -a TARGET_REPOS=()
declare -a TARGET_NAMES=()
INTERACTIVE_MODE=false
SAVE_CONFIG=true
DRY_RUN=false
TAG=""
TIMESTAMP=""
BRANCH_NAME=""
UPDATE_CONFIG_FILE=false

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

log_dry_run() {
    echo -e "${MAGENTA}[DRY RUN]${NC} $1"
}

# Cleanup function
cleanup() {
    if [[ -d "$TEMP_BASE_DIR" ]]; then
        log_info "Cleaning up temporary directories..."
        rm -rf "$TEMP_BASE_DIR"
    fi
}

# Set cleanup trap
trap cleanup EXIT

# Help function
show_help() {
    cat << EOF
Multi-Repo Sync Script with PR Creation

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --interactive    Force interactive mode (ignore config file)
    --no-save       Don't save configuration for future use
    --dry-run       Preview operations without making changes
    --help          Show this help message

DESCRIPTION:
    Syncs changes from a source repository (Repo A) to multiple target 
    repositories (Repo B, C, etc.) while preserving config files.
    
    Features:
    - Interactive tag selection from GitHub
    - Creates release branches with format: release/YYYYMMDD-HHMMSS
    - Opens pull requests in each target repository
    - Dry-run mode for safe previewing
    - Configuration file support

REQUIREMENTS:
    - git (for repository operations)
    - rsync (for file synchronization)  
    - gh (GitHub CLI for PR creation and tag fetching)
    - jq (for JSON config parsing)

CONFIG FILE:
    The script looks for sync-config.json in the same directory.
    If not found, it will prompt for repository URLs interactively.

EXAMPLE CONFIG:
    {
      "source_repo": "https://github.com/company/repo-a.git",
      "target_repos": [
        {
          "name": "Repo B",
          "url": "https://github.com/company/repo-b.git"
        },
        {
          "name": "Repo C", 
          "url": "https://github.com/company/repo-c.git"
        }
      ]
    }

EXAMPLES:
    $0                    # Use config file, interactive tag selection
    $0 --dry-run          # Preview what would happen
    $0 --interactive      # Force interactive setup
    $0 --no-save          # Don't save config changes
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --interactive)
                INTERACTIVE_MODE=true
                shift
                ;;
            --no-save)
                SAVE_CONFIG=false
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate prerequisites
validate_prerequisites() {
    log_step "Validating prerequisites..."
    
    local missing_tools=()
    
    if ! command -v git &> /dev/null; then
        missing_tools+=("git")
    fi
    
    if ! command -v rsync &> /dev/null; then
        missing_tools+=("rsync")
    fi
    
    if ! command -v gh &> /dev/null; then
        missing_tools+=("gh (GitHub CLI)")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        echo
        echo "Installation instructions:"
        echo "  git: https://git-scm.com/downloads"
        echo "  rsync: Usually pre-installed on Unix systems"
        echo "  gh: https://cli.github.com/"
        echo "  jq: https://stedolan.github.io/jq/"
        exit 1
    fi
    
    # Check GitHub CLI authentication
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI is not authenticated"
        echo "Please run: gh auth login"
        exit 1
    fi
    
    log_success "All prerequisites validated"
}

# Load configuration from file
load_config() {
    if [[ -f "$CONFIG_FILE" && "$INTERACTIVE_MODE" == false ]]; then
        log_info "Loading configuration from $CONFIG_FILE"
        
        if ! SOURCE_REPO=$(jq -r '.source_repo' "$CONFIG_FILE" 2>/dev/null); then
            log_error "Failed to parse config file"
            return 1
        fi
        
        if [[ "$SOURCE_REPO" == "null" || -z "$SOURCE_REPO" ]]; then
            log_error "Invalid source_repo in config file"
            return 1
        fi
        
        # Load target repositories
        local target_count
        target_count=$(jq '.target_repos | length' "$CONFIG_FILE" 2>/dev/null || echo "0")
        
        if [[ "$target_count" -eq 0 ]]; then
            log_error "No target repositories found in config file"
            return 1
        fi
        
        TARGET_REPOS=()
        TARGET_NAMES=()
        
        for i in $(seq 0 $((target_count - 1))); do
            local name url
            name=$(jq -r ".target_repos[$i].name" "$CONFIG_FILE")
            url=$(jq -r ".target_repos[$i].url" "$CONFIG_FILE")
            
            if [[ "$name" != "null" && "$url" != "null" ]]; then
                TARGET_NAMES+=("$name")
                TARGET_REPOS+=("$url")
            fi
        done
        
        log_success "Loaded config: 1 source repo, ${#TARGET_REPOS[@]} target repos"
        return 0
    fi
    
    return 1
}

# Interactive configuration setup
interactive_config() {
    log_step "Interactive configuration setup"
    
    # Get source repository
    read -p "Enter source repository URL (Repo A): " SOURCE_REPO
    if [[ -z "$SOURCE_REPO" ]]; then
        log_error "Source repository URL cannot be empty"
        exit 1
    fi
    
    # Get target repositories
    TARGET_REPOS=()
    TARGET_NAMES=()
    
    read -p "How many target repositories to sync? " repo_count
    if ! [[ "$repo_count" =~ ^[0-9]+$ ]] || [[ "$repo_count" -lt 1 ]]; then
        log_error "Invalid number of repositories"
        exit 1
    fi
    
    for i in $(seq 1 "$repo_count"); do
        echo
        read -p "Target repo $i name (e.g., 'Repo B'): " name
        read -p "Target repo $i URL: " url
        
        if [[ -z "$name" || -z "$url" ]]; then
            log_error "Repository name and URL cannot be empty"
            exit 1
        fi
        
        TARGET_NAMES+=("$name")
        TARGET_REPOS+=("$url")
    done
    
    log_success "Interactive configuration completed"
}

# Save configuration to file
save_config() {
    if [[ "$SAVE_CONFIG" == false ]]; then
        return 0
    fi
    
    log_info "Saving configuration to $CONFIG_FILE"
    
    local config_json="{\"source_repo\": \"$SOURCE_REPO\", \"target_repos\": ["
    
    for i in "${!TARGET_REPOS[@]}"; do
        if [[ $i -gt 0 ]]; then
            config_json+=","
        fi
        config_json+="{\"name\": \"${TARGET_NAMES[i]}\", \"url\": \"${TARGET_REPOS[i]}\"}"
    done
    
    config_json+="]}"
    
    echo "$config_json" | jq '.' > "$CONFIG_FILE"
    log_success "Configuration saved"
}

# Extract GitHub repo name from URL
extract_repo_name() {
    local url="$1"
    echo "$url" | sed -E 's/.*github\.com[:/]([^/]+\/[^/]+)(\.git)?$/\1/' | sed 's/\.git$//'
}

# Validate git repository accessibility
validate_git_repo() {
    local repo_url="$1"
    local repo_name="$2"
    
    log_info "Validating repository: $repo_name"
    
    if ! git ls-remote --exit-code "$repo_url" >/dev/null 2>&1; then
        log_error "Cannot access repository: $repo_url"
        log_error "Please check the URL and your access permissions"
        return 1
    fi
    
    log_success "Repository validated: $repo_name"
    return 0
}

# Extract version number from git tag (removes 'v' prefix if present)
extract_version_from_tag() {
    local tag="$1"
    echo "$tag" | sed 's/^v//'
}

# Update remote_artifact version in config file
update_config_file_version() {
    local config_file_path="$1"
    local new_version="$2"
    
    if [[ ! -f "$config_file_path" ]]; then
        log_error "Config file not found: $config_file_path"
        return 1
    fi
    
    # Check if remote_artifact key exists
    if ! grep -q "remote_artifact:" "$config_file_path"; then
        log_warning "No remote_artifact key found in $config_file_path"
        return 0
    fi
    
    # Extract current remote_artifact line
    local current_line
    current_line=$(grep "remote_artifact:" "$config_file_path")
    
    # Extract the current version using regex
    local current_version
    if [[ $current_line =~ remote_artifact:[[:space:]]*(.+)-([0-9]+\.[0-9]+\.[0-9]+)\.zip ]]; then
        local artifact_prefix="${BASH_REMATCH[1]}"
        current_version="${BASH_REMATCH[2]}"
        
        log_info "Current remote_artifact version: $current_version"
        log_info "Updating to version: $new_version"
        
        # Create the new line
        local new_line="remote_artifact: ${artifact_prefix}-${new_version}.zip"
        
        # Update the file using sed
        if sed -i.bak "s|remote_artifact:.*|$new_line|" "$config_file_path"; then
            log_success "Updated remote_artifact version in $config_file_path"
            rm -f "${config_file_path}.bak"  # Remove backup file
            return 0
        else
            log_error "Failed to update $config_file_path"
            return 1
        fi
    else
        log_warning "Could not parse version from remote_artifact in $config_file_path"
        log_warning "Current line: $current_line"
        return 0
    fi
}

# Prompt user for config file update decision
prompt_config_file_update() {
    if [[ "$DRY_RUN" == true ]]; then
        return 0  # Skip prompting in dry-run mode
    fi
    
    echo
    log_step "Config File Update Option"
    echo "The selected tag is: $TAG"
    
    local version
    version=$(extract_version_from_tag "$TAG")
    echo "Extracted version: $version"
    echo
    echo "Would you like to update the remote_artifact version in config files?"
    echo "This will update the version number in the remote_artifact path to match the selected tag."
    echo
    
    read -p "Update config file versions? (y/N): " update_decision
    if [[ "$update_decision" =~ ^[Yy]$ ]]; then
        UPDATE_CONFIG_FILE=true
        log_success "Config file updates enabled"
    else
        UPDATE_CONFIG_FILE=false
        log_info "Config file updates disabled"
    fi
    echo
}

# Interactive tag selection using GitHub CLI
select_tag() {
    local repo_url="$1"
    local repo_name
    repo_name=$(extract_repo_name "$repo_url")
    
    log_step "Fetching available tags from $repo_name..."
    
    # Fetch tags with metadata using GitHub API
    local tag_data
    if ! tag_data=$(gh api "repos/$repo_name/tags" --jq '.[] | "\(.name)|\(.commit.sha[0:7])|\(.commit.commit.author.date)"' 2>/dev/null); then
        log_error "Failed to fetch tags from $repo_name"
        log_error "Make sure the repository exists and you have access to it"
        exit 1
    fi
    
    if [[ -z "$tag_data" ]]; then
        log_error "No tags found in $repo_name"
        exit 1
    fi
    
    # Display formatted list (limit to 20 most recent)
    echo
    echo "Available tags from $repo_name (showing recent 20):"
    echo "================================================="
    printf "%-4s %-25s %-10s %s\n" "#" "Tag" "Commit" "Date"
    echo "--------------------------------------------------------"
    
    local -a tags=()
    local i=1
    while IFS='|' read -r tag commit date && [[ $i -le 20 ]]; do
        # Format date for display
        local formatted_date
        if formatted_date=$(date -d "$date" '+%Y-%m-%d' 2>/dev/null); then
            printf "%-4s %-25s %-10s %s\n" "$i" "$tag" "$commit" "$formatted_date"
        else
            printf "%-4s %-25s %-10s %s\n" "$i" "$tag" "$commit" "${date:0:10}"
        fi
        tags+=("$tag")
        ((i++))
    done <<< "$tag_data"
    
    echo
    read -p "Select tag number (1-${#tags[@]}): " selection
    
    if [[ "$selection" =~ ^[0-9]+$ ]] && [[ "$selection" -ge 1 ]] && [[ "$selection" -le ${#tags[@]} ]]; then
        TAG="${tags[$((selection-1))]}"
        log_success "Selected tag: $TAG"
    else
        log_error "Invalid selection"
        exit 1
    fi
}

# Validate tag exists in source repository
validate_tag() {
    local tag="$1"
    local repo_name
    repo_name=$(extract_repo_name "$SOURCE_REPO")
    
    log_info "Validating tag '$tag' in source repository..."
    
    if ! gh api "repos/$repo_name/git/refs/tags/$tag" &>/dev/null; then
        log_error "Tag '$tag' not found in source repository"
        exit 1
    fi
    
    log_success "Tag '$tag' validated"
}

# Clone source repository
clone_source_repo() {
    local source_dir="$TEMP_BASE_DIR/source"
    
    if [[ "$DRY_RUN" == true ]]; then
        log_dry_run "Would clone source repository: $SOURCE_REPO (tag: $TAG)"
        return 0
    fi
    
    log_step "Cloning source repository at tag '$TAG'..."
    mkdir -p "$TEMP_BASE_DIR"
    
    if ! git clone --depth 1 --branch "$TAG" "$SOURCE_REPO" "$source_dir"; then
        log_error "Failed to clone source repository"
        exit 1
    fi
    
    log_success "Source repository cloned to $source_dir"
}

# Process single target repository
process_target_repo() {
    local repo_index="$1"
    local repo_name="${TARGET_NAMES[repo_index]}"
    local repo_url="${TARGET_REPOS[repo_index]}"
    local target_dir="$TEMP_BASE_DIR/target-$repo_index"
    local source_dir="$TEMP_BASE_DIR/source"
    
    log_step "Processing $repo_name..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_dry_run "Would process $repo_name:"
        log_dry_run "  • Clone: $repo_url"
        log_dry_run "  • Create branch: $BRANCH_NAME"
        log_dry_run "  • Sync files (preserving $CONFIG_FILE_NAME if present)"
        if [[ "$UPDATE_CONFIG_FILE" == true ]]; then
            local version
            version=$(extract_version_from_tag "$TAG")
            log_dry_run "  • Update $CONFIG_FILE_NAME version to $version"
        fi
        log_dry_run "  • Commit changes"
        log_dry_run "  • Push branch to origin"
        log_dry_run "  • Create draft PR: 'Release sync: $TAG ($TIMESTAMP)'"
        echo
        return 0
    fi
    
    # Clone target repository
    log_info "Cloning $repo_name..."
    if ! git clone "$repo_url" "$target_dir"; then
        log_error "Failed to clone $repo_name"
        return 1
    fi
    
    if ! cd "$target_dir"; then
        log_error "Failed to change to target directory: $target_dir"
        return 1
    fi
    
    # Check if config file exists
    local has_config_file=true
    if [[ ! -f "$CONFIG_FILE_NAME" ]]; then
        log_warning "$CONFIG_FILE_NAME not found in $repo_name - proceeding without preservation"
        has_config_file=false
    fi
    
    # Create and checkout release branch
    log_info "Creating release branch: $BRANCH_NAME"
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        log_error "Branch $BRANCH_NAME already exists in $repo_name"
        return 1
    fi
    if ! git checkout -b "$BRANCH_NAME"; then
        log_error "Failed to create branch $BRANCH_NAME"
        return 1
    fi
    
    # Backup config file if it exists
    local config_file_backup=""
    if [[ "$has_config_file" == true ]]; then
        config_file_backup=$(mktemp -t config-file-backup.XXXXXXXX)
        if ! cp "$CONFIG_FILE_NAME" "$config_file_backup"; then
            log_error "Failed to backup $CONFIG_FILE_NAME"
            return 1
        fi
    fi
    
    # Sync files from source (excluding .git and optionally config file)
    log_info "Syncing files from source repository..."
    if [[ "$has_config_file" == true ]]; then
        rsync -av \
            --exclude='.git' \
            --exclude="$CONFIG_FILE_NAME" \
            --delete \
            "$source_dir/" ./
    else
        rsync -av \
            --exclude='.git' \
            --delete \
            "$source_dir/" ./
    fi
    
    # Restore config file if it was backed up
    if [[ "$has_config_file" == true ]]; then
        if ! cp "$config_file_backup" "$CONFIG_FILE_NAME"; then
            log_error "Failed to restore $CONFIG_FILE_NAME"
            return 1
        fi
        rm "$config_file_backup"
        
        # Verify config file is still there
        if [[ ! -f "$CONFIG_FILE_NAME" ]]; then
            log_error "$CONFIG_FILE_NAME was lost during sync!"
            return 1
        fi
        
        # Update config file version if requested
        if [[ "$UPDATE_CONFIG_FILE" == true ]]; then
            log_info "Updating $CONFIG_FILE_NAME version..."
            local version
            version=$(extract_version_from_tag "$TAG")
            if update_config_file_version "$CONFIG_FILE_NAME" "$version"; then
                log_success "$CONFIG_FILE_NAME version updated to $version"
            else
                log_warning "Could not update $CONFIG_FILE_NAME version"
            fi
        fi
    fi
    
    # Check for changes
    if [[ -z $(git status --porcelain) ]]; then
        log_warning "No changes detected in $repo_name"
        return 0
    fi
    
    # Show what changed
    log_info "Changes detected:"
    git status --short | head -10
    
    # Commit changes
    local commit_msg="Sync from source repository tag: $TAG

Automated sync from canonical repository"
    if [[ "$has_config_file" == true ]]; then
        commit_msg+=" while preserving $CONFIG_FILE_NAME"
        if [[ "$UPDATE_CONFIG_FILE" == true ]]; then
            local version
            version=$(extract_version_from_tag "$TAG")
            commit_msg+=" and updating version to $version"
        fi
    fi
    commit_msg+=".
Source tag: $TAG
Sync timestamp: $TIMESTAMP
Branch: $BRANCH_NAME

Changes synced"
    if [[ "$has_config_file" == true ]]; then
        commit_msg+=" while preserving infrastructure configuration"
        if [[ "$UPDATE_CONFIG_FILE" == true ]]; then
            commit_msg+=" with version update"
        fi
    fi
    commit_msg+="."
    
    log_info "Committing changes..."
    if ! git add .; then
        log_error "Failed to stage changes"
        return 1
    fi
    if ! git commit -m "$commit_msg"; then
        log_error "Failed to commit changes"
        return 1
    fi
    
    # Push branch
    log_info "Pushing release branch..."
    if ! git push -u origin "$BRANCH_NAME"; then
        log_error "Failed to push branch $BRANCH_NAME"
        return 1
    fi
    
    # Create pull request
    local pr_title="Release sync: $TAG ($TIMESTAMP)"
    local canonical_repo_name
    canonical_repo_name=$(extract_repo_name "$SOURCE_REPO")
    local pr_body="## 🔄 Automated Repository Sync

**Source Tag:** \`$TAG\`  
**Sync Timestamp:** \`$TIMESTAMP\`  
**Branch:** \`$BRANCH_NAME\`

This PR contains an automated sync from the canonical repo, $canonical_repo_name."
    if [[ "$has_config_file" == true ]]; then
        pr_body+=" while preserving the \`$CONFIG_FILE_NAME\` configuration"
    fi
    pr_body+=".

### 📋 Summary
- ✅ Synced all files from source repository tag \`$TAG\`"
    if [[ "$has_config_file" == true ]]; then
        pr_body+="
- ✅ Preserved existing \`$CONFIG_FILE_NAME\` configuration"
        if [[ "$UPDATE_CONFIG_FILE" == true ]]; then
            local version
            version=$(extract_version_from_tag "$TAG")
            pr_body+="
- ✅ Updated \`$CONFIG_FILE_NAME\` remote_artifact version to \`$version\`"
        fi
    else
        pr_body+="
- ⚠️  No \`$CONFIG_FILE_NAME\` found in target repository"
    fi
    pr_body+="
- ✅ Branch created with timestamp: \`$TIMESTAMP\`

### 🧪 Testing
- [ ] Review file changes in this PR
- [ ] Run application tests"
    if [[ "$has_config_file" == true ]]; then
        pr_body+="
- [ ] Verify \`$CONFIG_FILE_NAME\` configuration is intact"
    fi
    pr_body+="
- [ ] Test deployment pipeline"
    if [[ "$has_config_file" == true && "$UPDATE_CONFIG_FILE" == true ]]; then
        pr_body+="
- [ ] Verify updated remote_artifact version is correct"
    fi
    pr_body+="

### 🚀 Next Steps
1. Review the changes in this PR
2. Run any necessary tests"
    if [[ "$has_config_file" == true && "$UPDATE_CONFIG_FILE" == true ]]; then
        pr_body+="
3. Verify remote_artifact version update
4. Merge when ready to deploy"
    else
        pr_body+="
3. Merge when ready to deploy"
    fi
    pr_body+="

---
*This PR was created automatically by the repo-sync script.*"
    
    log_info "Creating pull request..."
    local pr_url
    if pr_url=$(gh pr create --draft --title "$pr_title" --body "$pr_body" 2>/dev/null); then
        log_success "Pull request created: $pr_url"
        echo "  📋 $repo_name: $pr_url"
    else
        log_error "Failed to create pull request for $repo_name"
        return 1
    fi
    
    log_success "$repo_name processing completed"
    return 0
}

# Main sync function
sync_repositories() {
    log_step "Starting repository synchronization..."
    
    # Generate timestamp and branch name
    TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
    BRANCH_NAME="release/$TIMESTAMP"
    
    log_info "Release branch: $BRANCH_NAME"
    log_info "Processing ${#TARGET_REPOS[@]} target repositories..."
    
    if [[ "$DRY_RUN" == true ]]; then
        log_dry_run "Dry run mode - no actual changes will be made"
        echo
        log_dry_run "Would create branch: $BRANCH_NAME"
        log_dry_run "Would sync from: $SOURCE_REPO (tag: $TAG)"
        echo
    fi
    
    # Clone source repository
    clone_source_repo
    
    # Process each target repository
    local success_count=0
    
    if [[ "$DRY_RUN" == false ]]; then
        echo
        echo "📋 Pull Request Summary:"
        echo "========================"
    fi
    
    for i in "${!TARGET_REPOS[@]}"; do
        echo
        if process_target_repo "$i"; then
            ((success_count++))
        fi
    done
    
    echo
    if [[ "$DRY_RUN" == true ]]; then
        log_success "Dry run completed: validated $success_count/${#TARGET_REPOS[@]} repositories"
        echo
        echo "✅ Dry run summary:"
        echo "  • Source repo accessible: $SOURCE_REPO"
        echo "  • Tag validated: $TAG"
        echo "  • Target repos: ${#TARGET_REPOS[@]}"
        echo "  • Branch name: $BRANCH_NAME"
        echo "  • Preserved file: $CONFIG_FILE_NAME"
        echo
        echo "Run without --dry-run to execute the sync."
    else
        log_success "Sync completed: $success_count/${#TARGET_REPOS[@]} repositories processed successfully"
        
        if [[ $success_count -eq ${#TARGET_REPOS[@]} ]]; then
            echo
            echo "🎉 All repositories synced successfully!"
            echo "Review the pull requests above and merge when ready."
        else
            echo
            log_warning "Some repositories failed to sync. Check the logs above for details."
        fi
    fi
}

# Main function
main() {
    echo "================================================"
    echo "       Multi-Repo Sync Script with PRs"
    echo "================================================"
    echo
    
    # Parse command line arguments
    parse_args "$@"
    
    # Validate prerequisites
    validate_prerequisites
    
    # Load or create configuration
    if ! load_config; then
        interactive_config
        if [[ "$DRY_RUN" == false ]]; then
            save_config
        fi
    fi
    
    # Validate all repositories
    log_step "Validating repository access..."
    
    local source_repo_name
    source_repo_name=$(extract_repo_name "$SOURCE_REPO")
    if ! validate_git_repo "$SOURCE_REPO" "$source_repo_name (source)"; then
        exit 1
    fi
    
    for i in "${!TARGET_REPOS[@]}"; do
        if ! validate_git_repo "${TARGET_REPOS[i]}" "${TARGET_NAMES[i]} (target)"; then
            exit 1
        fi
    done
    
    log_success "All repositories validated successfully"
    
    # Display configuration summary
    echo
    echo "Configuration Summary:"
    echo "====================="
    echo "Source Repository: $SOURCE_REPO"
    echo "Target Repositories:"
    for i in "${!TARGET_REPOS[@]}"; do
        echo "  $((i+1)). ${TARGET_NAMES[i]}: ${TARGET_REPOS[i]}"
    done
    echo
    
    # Interactive tag selection
    select_tag "$SOURCE_REPO"
    
    # Validate selected tag
    validate_tag "$TAG"
    
    # Prompt for config file update decision
    prompt_config_file_update
    
    # Confirmation
    echo
    echo "Sync Plan:"
    echo "=========="
    echo "  📥 Source: $SOURCE_REPO (tag: $TAG)"
    echo "  📤 Targets: ${#TARGET_REPOS[@]} repositories"
    echo "  🌿 Branch: release/$(date +"%Y%m%d-%H%M%S")"
    echo "  🔄 Action: Create PRs for each target repo"
    echo "  🛡️  Preserve: $CONFIG_FILE_NAME in each target"
    if [[ "$DRY_RUN" == true ]]; then
        echo "  🔍 Mode: DRY RUN (no changes will be made)"
    fi
    echo
    
    local action_text="sync and PR creation"
    if [[ "$DRY_RUN" == true ]]; then
        action_text="dry run preview"
    fi
    
    read -p "Continue with $action_text? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "Operation cancelled by user"
        exit 0
    fi
    
    # Perform sync
    echo
    sync_repositories
}

# Run main function
main "$@"