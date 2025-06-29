import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { join } from 'pathe'
import { tmpdir } from 'os'
import { SyncConfig, TargetRepository } from '../../core/types.js'

export class TestHelpers {
  private tempDirs: string[] = []

  /**
   * Create a temporary directory for testing
   */
  async createTempDir(prefix = 'nsync-test-'): Promise<string> {
    const tempDir = await mkdtemp(join(tmpdir(), prefix))
    this.tempDirs.push(tempDir)
    return tempDir
  }

  /**
   * Clean up all created temporary directories
   */
  async cleanup(): Promise<void> {
    await Promise.all(
      this.tempDirs.map(dir => 
        rm(dir, { recursive: true, force: true }).catch(() => {
          // Ignore cleanup errors in tests
        })
      )
    )
    this.tempDirs = []
  }

  /**
   * Create a mock repository structure
   */
  async createMockRepo(repoPath: string, files: Record<string, string> = {}): Promise<void> {
    await mkdir(repoPath, { recursive: true })
    
    // Create default files
    const defaultFiles = {
      'README.md': '# Test Repository',
      'package.json': JSON.stringify({ name: 'test-repo', version: '1.0.0' }, null, 2),
      'src/index.ts': 'console.log("Hello, World!");',
      'InfrastructureAsCodeFile': 'remote_artifact: my-api-1.0.0.zip',
      ...files
    }

    for (const [filePath, content] of Object.entries(defaultFiles)) {
      const fullPath = join(repoPath, filePath)
      await mkdir(join(fullPath, '..'), { recursive: true })
      await writeFile(fullPath, content)
    }
  }

  /**
   * Create a mock configuration
   */
  createMockConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
    return {
      source_repo: 'https://github.com/test/source-repo.git',
      target_repos: [
        {
          name: 'Test Target 1',
          url: 'https://github.com/test/target-repo-1.git'
        },
        {
          name: 'Test Target 2', 
          url: 'https://github.com/test/target-repo-2.git'
        }
      ],
      github: {
        api_url: 'https://api.github.com',
        token: 'test-token'
      },
      ...overrides
    }
  }

  /**
   * Create mock target repository
   */
  createMockTarget(overrides: Partial<TargetRepository> = {}): TargetRepository {
    return {
      name: 'Test Repository',
      url: 'https://github.com/test/repo.git',
      ...overrides
    }
  }

  /**
   * Create mock GitHub API responses
   */
  createMockGitHubResponses() {
    return {
      tags: [
        { name: 'v2.1.0', commit: { sha: 'abc123' } },
        { name: 'v2.0.0', commit: { sha: 'def456' } },
        { name: 'v1.9.0', commit: { sha: 'ghi789' } }
      ],
      pullRequest: {
        number: 42,
        html_url: 'https://github.com/test/repo/pull/42'
      },
      user: {
        login: 'testuser',
        name: 'Test User'
      }
    }
  }

  /**
   * Sleep for testing async operations
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Assert that a string contains all expected substrings
   */
  assertContains(actual: string, expected: string[], message?: string): void {
    for (const substring of expected) {
      if (!actual.includes(substring)) {
        throw new Error(
          message || `Expected string to contain "${substring}", but it didn't.\nActual: ${actual}`
        )
      }
    }
  }
}