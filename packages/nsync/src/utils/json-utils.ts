import { destr } from 'destr'

export function safeParseJSON(input: any, options?: { default?: any }): any {
  // Handle undefined/null inputs first
  if (input === undefined || input === null) {
    return options?.default !== undefined ? options.default : undefined
  }
  
  try {
    // destr handles various input types and malformed JSON gracefully
    const result = destr(input)
    
    // If destr returns the same string, it wasn't valid JSON
    // (destr returns primitives as-is for non-JSON strings)
    if (typeof input === 'string' && result === input && !['true', 'false', 'null'].includes(input) && !/^-?\d+(\.\d+)?$/.test(input)) {
      return options?.default !== undefined ? options.default : undefined
    }
    
    return result
  } catch {
    // Return default value if parsing fails
    return options?.default !== undefined ? options.default : undefined
  }
}

export function parseGitHubResponse(response: string): any {
  try {
    // destr is perfect for API responses - handles edge cases well
    const parsed = destr(response)
    
    // Ensure we return an object for consistency
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed
    }
    
    return {}
  } catch {
    // Always return empty object for failed parses
    return {}
  }
}

export function parseConfigFile(content: string): any {
  try {
    // Remove comments for JSON5-like content
    const cleanContent = content
      .split('\n')
      .map(line => {
        // Remove single-line comments
        const commentIndex = line.indexOf('//')
        if (commentIndex !== -1) {
          // Check if it's inside a string
          const beforeComment = line.substring(0, commentIndex)
          const quoteCount = (beforeComment.match(/"/g) || []).length
          if (quoteCount % 2 === 0) {
            return line.substring(0, commentIndex)
          }
        }
        return line
      })
      .join('\n')
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
    
    const parsed = destr(cleanContent)
    
    // Return null for non-object results
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    
    return parsed
  } catch {
    return null
  }
}