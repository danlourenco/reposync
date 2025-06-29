#!/usr/bin/env node

import { defineCommand, runMain } from 'citty'
import { name, version, description } from '../package.json'
import { syncCommand } from './commands/sync.js'
import { configCommand } from './commands/config.js'
import { statusCommand } from './commands/status.js'
import { showSplash, setupExitHandler } from './utils/ascii.js'

// Setup the animated exit handler
setupExitHandler()

const main = defineCommand({
  meta: {
    name,
    version,
    description,
  },
  async setup() {
    // Show splash screen when no command is provided
    if (process.argv.length <= 2) {
      await showSplash()
    }
  },
  subCommands: {
    sync: syncCommand,
    config: configCommand,
    status: statusCommand,
  },
})

runMain(main)