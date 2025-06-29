import { consola } from 'consola'

// Configure consola globally for our app
consola.options.formatOptions = {
  colors: true,
  compact: false,
  date: false
}

// Set default level (3 = info, higher numbers for more verbose)
consola.level = 3

// Create semantic, scoped loggers for different components
export const gitLogger = consola.withTag('git')
export const githubLogger = consola.withTag('github') 
export const syncLogger = consola.withTag('sync')
export const configLogger = consola.withTag('config')
export const wizardLogger = consola.withTag('wizard')
export const fileLogger = consola.withTag('files')

// Utility functions for controlling verbosity elegantly
export function setVerbose(verbose: boolean) {
  consola.level = verbose ? 4 : 3 // Debug level for verbose, info for normal
}

export function setSilent(silent: boolean) {
  consola.level = silent ? -999 : 3 // Silent mode or restore normal
}

export function setQuiet(quiet: boolean) {
  consola.level = quiet ? 1 : 3 // Only errors/warnings or normal
}

// Semantic operation helpers using consola's patterns
export const operation = {
  start: (message: string) => consola.start(message),
  success: (message: string) => consola.success(message),
  fail: (message: string) => consola.fail(message),
  ready: (message: string) => consola.ready(message),
  info: (message: string) => consola.info(message),
  warn: (message: string) => consola.warn(message),
  step: (message: string, step?: number, total?: number) => {
    if (step && total) {
      consola.info(`[${step}/${total}] 🔄 ${message}`)
    } else {
      consola.info(`🔄 ${message}`)
    }
  }
}

// Legacy compatibility layer (will phase out)
export const log = {
  info: consola.info.bind(consola),
  success: consola.success.bind(consola),
  warn: consola.warn.bind(consola),
  error: consola.error.bind(consola),
  debug: consola.debug.bind(consola),
  step: (message: string, ...args: any[]) => consola.info(`🔄 ${message}`, ...args),
  dryRun: (message: string, ...args: any[]) => consola.info(`🔍 Preview: ${message}`, ...args)
}

// Export main consola instance
export default consola