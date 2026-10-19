// Profiles: what npm create agent@latest <word> adds on top of the key.
// A profile is a JSON manifest, never code. Built-ins ship in ../profiles; the catalogue at
// init-agent.com/profiles.json names the rest; a path or URL is tried as a manifest directly.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'
import { createHash } from 'crypto'

export const BUILTIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'profiles')
export const CATALOGUE_URL = 'https://init-agent.com/profiles.json'
export const KNOWN_ACTIONS = ['fund', 'trail', 'mark', 'announce']
const ALLOWED_KEYS = new Set(['$comment', 'name', 'description', 'actions', 'files', 'config', 'skills', 'next'])
// git runs the values of many config keys as commands (core.pager, core.fsmonitor, alias.*, filter.*, ...),
// so a profile may only touch these namespaces, none of which git executes.
export const CONFIG_KEY = /^(gitmark\.[a-z][a-z0-9-]*|agent\.[a-z][a-z0-9-]*|nostr\.relays)$/i

/** A relative path that stays inside the repo and never touches .git, on any platform */
export function safeRelativePath(p) {
  if (typeof p !== 'string' || !p || p.includes('\\') || p.includes('\0') || /^[A-Za-z]:/.test(p) || p.startsWith('/')) return false
  const parts = p.split('/')
  return parts.every((seg) => seg && seg !== '.' && seg !== '..' && seg.toLowerCase() !== '.git')
}

export function builtinNames() {
  return fs.readdirSync(BUILTIN_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
}

/** Check a manifest's shape; throws naming what is wrong. Returns the manifest with defaults filled. */
export function validateManifest(m, source = 'manifest') {
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error(`${source}: not a JSON object`)
  for (const k of Object.keys(m)) if (!ALLOWED_KEYS.has(k)) throw new Error(`${source}: unknown key "${k}"`)
  if (typeof m.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(m.name)) throw new Error(`${source}: name must be lowercase letters, digits and dashes`)
  const out = { name: m.name, description: String(m.description || ''), actions: m.actions || [], files: m.files || {}, config: m.config || {}, skills: m.skills || [], next: m.next || [] }
  if (!Array.isArray(out.actions)) throw new Error(`${source}: actions must be a list`)
  for (const a of out.actions) if (!KNOWN_ACTIONS.includes(a)) throw new Error(`${source}: unknown action "${a}" (known: ${KNOWN_ACTIONS.join(', ')})`)
  if (typeof out.files !== 'object' || Array.isArray(out.files)) throw new Error(`${source}: files must be an object of path: content`)
  for (const [p, c] of Object.entries(out.files)) {
    if (typeof c !== 'string') throw new Error(`${source}: file ${p} content must be a string`)
    if (!safeRelativePath(p)) throw new Error(`${source}: file path not allowed: ${p}`)
  }
  if (typeof out.config !== 'object' || Array.isArray(out.config)) throw new Error(`${source}: config must be an object of key: value`)
  for (const [k, v] of Object.entries(out.config)) {
    if (k.toLowerCase() === 'nostr.privkey') throw new Error(`${source}: a profile may not set nostr.privkey`)
    if (!CONFIG_KEY.test(k)) throw new Error(`${source}: config key not allowed: ${k} (profiles may set gitmark.*, agent.* and nostr.relays only)`)
    if (typeof v !== 'string' || /[\r\n]/.test(v)) throw new Error(`${source}: config ${k} must be a single-line string`)
  }
  if (!Array.isArray(out.skills) || !out.skills.every((s) => typeof s === 'string')) throw new Error(`${source}: skills must be a list of names`)
  if (!Array.isArray(out.next) || !out.next.every((s) => typeof s === 'string')) throw new Error(`${source}: next must be a list of lines`)
  return out
}

async function fetchText(url, f) {
  const res = await f(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}
async function fetchJson(url, f) { return JSON.parse(await fetchText(url, f)) }

/**
 * Find a profile by word: a built-in name, a catalogue name, or a path or URL to a manifest.
 * @returns {Promise<{manifest: object, source: string, publisher?: string}>}
 */
export async function resolveProfile(word = 'bare', { fetch: f = globalThis.fetch, catalogueUrl = CATALOGUE_URL } = {}) {
  const builtin = path.join(BUILTIN_DIR, `${word}.json`)
  if (/^[a-z0-9][a-z0-9-]*$/.test(word) && fs.existsSync(builtin)) {
    return { manifest: validateManifest(JSON.parse(fs.readFileSync(builtin, 'utf8')), `built-in ${word}`), source: 'built-in' }
  }
  if (/^https?:\/\//.test(word)) {
    return { manifest: validateManifest(await fetchJson(word, f), word), source: word }
  }
  if (word.includes('/') || word.endsWith('.json')) {
    if (!fs.existsSync(word)) throw new Error(`No manifest at ${word}`)
    return { manifest: validateManifest(JSON.parse(fs.readFileSync(word, 'utf8')), word), source: path.resolve(word) }
  }
  let catalogue
  try { catalogue = await fetchJson(catalogueUrl, f) } catch (e) { throw new Error(`Unknown profile "${word}" (built-ins: ${builtinNames().join(', ')}); the catalogue could not be read: ${e.message}`) }
  const entry = (catalogue.profiles || []).find((p) => p.name === word)
  if (!entry) throw new Error(`Unknown profile "${word}". Built-ins: ${builtinNames().join(', ')}. Catalogue: ${(catalogue.profiles || []).map((p) => p.name).join(', ') || 'empty'}`)
  if (!/^https:\/\//.test(entry.manifest || '')) throw new Error(`Catalogue entry ${word} has no https manifest URL`)
  const text = await fetchText(entry.manifest, f)
  // a catalogue entry may pin the manifest it was reviewed with; then the hosted file cannot change under it
  if (entry.sha256) {
    const got = createHash('sha256').update(text).digest('hex')
    if (got !== String(entry.sha256).toLowerCase()) throw new Error(`Catalogue entry ${word}: the manifest at ${entry.manifest} has changed since it was listed (sha256 ${got.slice(0, 16)}… ≠ ${String(entry.sha256).slice(0, 16)}…)`)
  }
  const manifest = validateManifest(JSON.parse(text), entry.manifest)
  if (manifest.name !== word) throw new Error(`Catalogue entry ${word} points at a manifest named ${manifest.name}`)
  return { manifest, source: entry.manifest, publisher: entry.publisher }
}

/** Fill ${DID}, ${PUBKEY}, ${CHAIN}, ${NAME} in a string */
export function render(text, vars) {
  return text.replace(/\$\{(DID|PUBKEY|CHAIN|NAME)\}/g, (_, k) => vars[k] ?? '')
}

/**
 * Write the manifest's files and config into the repo at cwd. Existing files are left alone.
 * @returns {{written: string[], skipped: string[], config: string[]}}
 */
export function applyManifest(manifest, { cwd = process.cwd(), vars = {}, dryRun = false } = {}) {
  const written = [], skipped = [], config = []
  const root = fs.realpathSync(cwd)
  for (const [rel, content] of Object.entries(manifest.files)) {
    if (!safeRelativePath(rel)) throw new Error(`file path not allowed: ${rel}`)
    const file = path.resolve(root, rel)
    if (!file.startsWith(root + path.sep)) throw new Error(`file path not allowed: ${rel}`)
    if (fs.existsSync(file)) { skipped.push(rel); continue }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const realDir = fs.realpathSync(path.dirname(file))
      if (realDir !== root && !realDir.startsWith(root + path.sep)) throw new Error(`file path not allowed (leaves the repo through a link): ${rel}`)
      fs.writeFileSync(file, render(content, vars))
    }
    written.push(rel)
  }
  for (const [k, v] of Object.entries(manifest.config)) {
    if (!dryRun) execFileSync('git', ['config', '--local', k, render(v, vars)], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    config.push(k)
  }
  return { written, skipped, config }
}
