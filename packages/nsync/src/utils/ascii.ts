import figlet from 'figlet'
import chalk from 'chalk'
import boxen from 'boxen'
import { promisify } from 'util'

const figletAsync = promisify(figlet)

export const animations = {
  tearin: '💔',
  digital: '💿',
  popstar: '⭐',
  frosted: '❄️',
  curls: '🌀',
  denim: '👖',
  dance: '🕺',
  microphone: '',  // Removed microphone emoji
  stage: '🎭',
  nineties: '📼'
}

export async function createNsyncLogo(): Promise<string> {
  try {
    // Create the NSYNC text with figlet using a wider, more stylized font
    const nsyncText = await figletAsync('NSYNC')
    
    // Apply solid colors: dark blue for first N, light blue for rest
    const lines = (nsyncText as string).split('\n')
    const coloredLines = lines.map(line => {
      // The first N in 'Big Money-nw' font ends at a different position without the asterisk
      const firstNEnd = 14 // Adjusted for no asterisk
      const firstPart = chalk.hex('#1e3a8a')(line.substring(0, firstNEnd)) // Dark blue
      const restPart = chalk.hex('#60a5fa')(line.substring(firstNEnd)) // Light blue
      return firstPart + restPart
    })
    
    return coloredLines.join('\n')
  } catch {
    // Fallback to 5 Line Oblique if Big Money-nw fails
    try {
      const fallbackText = await figletAsync('NSYNC')
      const lines = (fallbackText as string).split('\n')
      const coloredLines = lines.map(line => {
        // For 5 Line Oblique font, first N ends around position 8
        const firstNEnd = Math.min(8, Math.floor(line.length * 0.2))
        return chalk.hex('#1e3a8a')(line.substring(0, firstNEnd)) + chalk.hex('#60a5fa')(line.substring(firstNEnd))
      })
      return coloredLines.join('\n')
    } catch {
      // Final fallback to simple text
      return chalk.hex('#1e3a8a')('N') + chalk.hex('#60a5fa')('SYNC')
    }
  }
}

export async function createWelcomeBox(): Promise<string> {
  const welcomeMessage = [
    chalk.bold('Multi-repository synchronization tool'),
    '',
    chalk.dim('Sync changes from source repositories to multiple targets'),
    chalk.dim('with automated pull request creation')
  ].join('\n')

  return boxen(welcomeMessage, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
    backgroundColor: 'black'
  })
}

// Simple, professional success messages
export const successMessages = [
  "Sync completed successfully",
  "Repositories synchronized",
  "Operation completed",
  "All targets updated",
  "Synchronization finished"
]

// Animation frames for the "Bye Bye Bye" dance
export const byeByeByeDance = [
  // Frame 1: Initial pose
  [
    "     🕺    ",
    "    /|\\   ",
    "    / \\   ",
    "          "
  ],
  // Frame 2: Arms up
  [
    "     🙋    ",
    "    \\|/   ",
    "    / \\   ",
    "          "
  ],
  // Frame 3: To the side
  [
    "   🕺      ",
    "  /|      ",
    "  / \\     ",
    "          "
  ],
  // Frame 4: Other side
  [
    "      🕺   ",
    "      |\\  ",
    "     / \\  ",
    "          "
  ],
  // Frame 5: Final wave
  [
    "     👋    ",
    "    /|    ",
    "    / \\   ",
    "   Bye!   "
  ]
]

export function getRandomSuccess(): string {
  return successMessages[Math.floor(Math.random() * successMessages.length)]
}

export async function showSplash(): Promise<void> {
  console.clear()
  
  // Show the logo
  const logo = await createNsyncLogo()
  console.log(logo)
  
  // Show the welcome box
  const welcomeBox = await createWelcomeBox()
  console.log(welcomeBox)
  console.log()
}

// Animated "Bye Bye Bye" exit sequence
export async function showByeByeByeAnimation(): Promise<void> {
  console.log(chalk.yellow('\n♪ Bye Bye Bye ♪\n'))
  
  for (const frame of byeByeByeDance) {
    // Clear previous frame
    process.stdout.write('\x1b[5A') // Move cursor up 5 lines
    
    // Draw current frame
    for (const line of frame) {
      console.log(chalk.cyan(line))
    }
    
    // Wait before next frame
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log(chalk.dim('\nThanks for using *NSYNC!'))
}

// Setup graceful exit handler
export function setupExitHandler(): void {
  const gracefulExit = async () => {
    await showByeByeByeAnimation()
    process.exit(0)
  }

  // Handle various exit signals
  process.on('SIGINT', gracefulExit)  // Ctrl+C
  process.on('SIGTERM', gracefulExit) // Termination signal
  process.on('SIGUSR1', gracefulExit) // User signal 1
  process.on('SIGUSR2', gracefulExit) // User signal 2
}