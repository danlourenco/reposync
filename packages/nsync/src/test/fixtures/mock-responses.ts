export const mockGitHubResponses = {
  tags: [
    {
      name: 'v2.1.0',
      commit: { sha: 'abc123def456' },
      tarball_url: 'https://api.github.com/repos/test/repo/tarball/v2.1.0',
      zipball_url: 'https://api.github.com/repos/test/repo/zipball/v2.1.0'
    },
    {
      name: 'v2.0.0',
      commit: { sha: 'def456ghi789' },
      tarball_url: 'https://api.github.com/repos/test/repo/tarball/v2.0.0',
      zipball_url: 'https://api.github.com/repos/test/repo/zipball/v2.0.0'
    },
    {
      name: 'v1.9.0',
      commit: { sha: 'ghi789jkl012' },
      tarball_url: 'https://api.github.com/repos/test/repo/tarball/v1.9.0',
      zipball_url: 'https://api.github.com/repos/test/repo/zipball/v1.9.0'
    }
  ],

  commit: {
    sha: 'abc123def456',
    commit: {
      author: {
        name: 'Test Author',
        email: 'test@example.com',
        date: '2023-12-01T10:00:00Z'
      },
      committer: {
        name: 'Test Author',
        email: 'test@example.com',
        date: '2023-12-01T10:00:00Z'
      },
      message: 'Test commit message'
    }
  },

  pullRequest: {
    id: 123456,
    number: 42,
    state: 'open',
    title: 'Sync from v2.1.0',
    body: 'Automated sync from source repository',
    html_url: 'https://github.com/test/repo/pull/42',
    diff_url: 'https://github.com/test/repo/pull/42.diff',
    patch_url: 'https://github.com/test/repo/pull/42.patch',
    draft: true,
    head: {
      ref: 'release/20231201-100000',
      sha: 'abc123def456'
    },
    base: {
      ref: 'main',
      sha: 'def456ghi789'
    },
    user: {
      login: 'testuser',
      id: 1,
      avatar_url: 'https://github.com/images/error/testuser_happy.gif',
      html_url: 'https://github.com/testuser'
    }
  },

  user: {
    login: 'testuser',
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://github.com/images/error/testuser_happy.gif',
    html_url: 'https://github.com/testuser',
    type: 'User'
  },

  repository: {
    id: 123456,
    name: 'test-repo',
    full_name: 'test/test-repo',
    owner: {
      login: 'test',
      id: 1,
      type: 'Organization'
    },
    private: false,
    html_url: 'https://github.com/test/test-repo',
    description: 'A test repository',
    clone_url: 'https://github.com/test/test-repo.git',
    ssh_url: 'git@github.com:test/test-repo.git',
    default_branch: 'main'
  }
}

export const mockSimpleGitResponses = {
  status: {
    current: 'main',
    files: [
      { path: 'src/index.ts', index: 'M', working_dir: ' ' },
      { path: 'package.json', index: 'A', working_dir: ' ' }
    ]
  },

  branchLocal: {
    all: ['main', 'develop'],
    branches: {
      main: { current: true, name: 'main', commit: 'abc123' },
      develop: { current: false, name: 'develop', commit: 'def456' }
    },
    current: 'main'
  },

  log: {
    latest: {
      hash: 'abc123def456',
      date: '2023-12-01T10:00:00.000Z',
      message: 'Test commit',
      author_name: 'Test Author',
      author_email: 'test@example.com'
    },
    all: [
      {
        hash: 'abc123def456',
        date: '2023-12-01T10:00:00.000Z',
        message: 'Test commit',
        author_name: 'Test Author',
        author_email: 'test@example.com'
      }
    ]
  },

  remotes: [
    {
      name: 'origin',
      refs: {
        fetch: 'https://github.com/test/repo.git',
        push: 'https://github.com/test/repo.git'
      }
    }
  ],

  commit: {
    commit: 'abc123def456',
    summary: {
      changes: 2,
      insertions: 10,
      deletions: 5
    }
  }
}

export const mockConfigs = {
  valid: {
    source_repo: 'https://github.com/test/source-repo.git',
    target_repos: [
      {
        name: 'Production App',
        url: 'https://github.com/test/prod-app.git'
      },
      {
        name: 'Staging Environment',
        url: 'https://github.com/test/staging-app.git'
      }
    ]
  },

  enterprise: {
    source_repo: 'https://github.enterprise.com/company/source-repo.git',
    target_repos: [
      {
        name: 'Enterprise App',
        url: 'https://github.enterprise.com/company/app.git'
      }
    ],
    github: {
      api_url: 'https://github.enterprise.com/api/v3',
      token: 'ghp_enterprise_token_123'
    }
  },

  minimal: {
    source_repo: 'https://github.com/test/source.git',
    target_repos: [
      {
        name: 'Single Target',
        url: 'https://github.com/test/target.git'
      }
    ]
  },

  invalid: {
    source_repo: 'not-a-url',
    target_repos: []
  },

  invalidTargets: {
    source_repo: 'https://github.com/test/source.git',
    target_repos: [
      {
        name: '',
        url: 'not-a-url'
      }
    ]
  }
}

export const mockFileStructures = {
  simpleRepo: {
    'README.md': '# Test Repository\n\nThis is a test repository.',
    'package.json': JSON.stringify({
      name: 'test-repo',
      version: '1.0.0',
      description: 'A test repository'
    }, null, 2),
    'src/index.ts': 'console.log("Hello, World!");',
    'src/utils.ts': 'export const helper = () => "test";',
    '.gitignore': 'node_modules/\n*.log\n.env'
  },

  repoWithInfrastructureAsCodeFile: {
    'README.md': '# Repository with InfrastructureAsCodeFile',
    'InfrastructureAsCodeFile': 'remote_artifact: my-service-1.2.3.zip\nanother_artifact: tool-0.5.1.jar',
    'src/app.ts': 'import { helper } from "./utils";\nconsole.log(helper());',
    'src/utils.ts': 'export const helper = () => "production";',
    'config/prod.yml': 'environment: production\nlog_level: info'
  },

  complexRepo: {
    'README.md': '# Complex Repository Structure',
    'package.json': JSON.stringify({
      name: 'complex-repo',
      version: '2.1.0',
      scripts: {
        build: 'tsc',
        test: 'vitest'
      }
    }, null, 2),
    'src/index.ts': 'export * from "./modules";',
    'src/modules/auth.ts': 'export class AuthService {}',
    'src/modules/database.ts': 'export class DatabaseService {}',
    'src/modules/index.ts': 'export * from "./auth";\nexport * from "./database";',
    'tests/auth.test.ts': 'import { AuthService } from "../src/modules/auth";',
    'docs/api.md': '# API Documentation',
    'InfrastructureAsCodeFile.yml': 'artifacts:\n  - name: auth-service\n    version: 2.1.0\n    file: auth-2.1.0.zip',
    '.env.example': 'DATABASE_URL=\nAPI_KEY=',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext'
      }
    }, null, 2)
  }
}