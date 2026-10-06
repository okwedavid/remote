/**
 * Syntax highlighting.
 *
 * `highlight.js` is loaded on demand (its own chunk) and only a curated set of
 * languages is registered, which keeps the main bundle small. Output is HTML
 * that highlight.js has already escaped, so it is safe to inject.
 */
import type { HLJSApi, LanguageFn } from 'highlight.js'

const LANGUAGES: Record<string, () => Promise<{ default: LanguageFn }>> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  go: () => import('highlight.js/lib/languages/go'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  php: () => import('highlight.js/lib/languages/php'),
  python: () => import('highlight.js/lib/languages/python'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
}

const ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  console: 'bash',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  yml: 'yaml',
  md: 'markdown',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  vue: 'xml',
  toml: 'ini',
  conf: 'ini',
  cfg: 'ini',
  cs: 'csharp',
  'c++': 'cpp',
  h: 'c',
  hpp: 'cpp',
  docker: 'dockerfile',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  text: '',
  txt: '',
  plaintext: '',
  '': '',
}

let highlighterPromise: Promise<HLJSApi> | null = null

async function loadHighlighter(): Promise<HLJSApi> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const module = await import('highlight.js/lib/core')
      const hljs = module.default
      const entries = Object.entries(LANGUAGES)
      const loaded = await Promise.all(
        entries.map(async ([name, loader]) => {
          const language = await loader()
          return [name, language.default] as const
        }),
      )
      for (const [name, language] of loaded) hljs.registerLanguage(name, language)
      return hljs
    })()
  }
  return highlighterPromise
}

/** Resolve a fence language to a registered one (or `null` for plain text). */
export function normalizeLanguage(language?: string): string | null {
  if (!language) return null
  const key = language.trim().toLowerCase()
  if (key in ALIASES) return ALIASES[key] === '' ? null : (ALIASES[key] as string)
  if (key in LANGUAGES) return key
  return null
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function highlightCode(code: string, language?: string): Promise<string> {
  const name = normalizeLanguage(language)
  if (!name) return escapeHtml(code)
  try {
    const hljs = await loadHighlighter()
    if (!hljs.getLanguage(name)) return escapeHtml(code)
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

/** Label shown in the code block header. */
export function languageLabel(language?: string): string {
  if (!language || language.trim() === '') return 'text'
  const key = language.trim().toLowerCase()
  const resolved = ALIASES[key]
  return resolved === undefined ? key : resolved === '' ? 'text' : resolved
}
