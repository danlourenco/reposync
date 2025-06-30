import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class SystemValidator {
  async validatePrerequisites(): Promise<Record<string, boolean>> {
    const tools = ['git', 'gh', 'node']
    const results: Record<string, boolean> = {}

    for (const tool of tools) {
      try {
        await execAsync(`which ${tool}`)
        results[tool] = true
      } catch {
        results[tool] = false
      }
    }

    return results
  }

  async validateGitHubAuth(): Promise<boolean> {
    try {
      await execAsync('gh auth status')
      return true
    } catch {
      return false
    }
  }

  async validateRepositoryAccess(repoUrl: string): Promise<boolean> {
    try {
      await execAsync(`git ls-remote ${repoUrl}`)
      return true
    } catch {
      return false
    }
  }

  async validateNode(): Promise<string> {
    try {
      const { stdout } = await execAsync('node --version')
      return stdout.trim()
    } catch {
      throw new Error('Node.js not found')
    }
  }
}