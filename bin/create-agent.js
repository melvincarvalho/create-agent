#!/usr/bin/env node

// npm create agent@latest [profile] [-- --chain <id>] [--announce] [--dry-run] [--no-fund] [--no-mark]
// The key and the DID are always made. A profile (built in, from the catalogue, or a manifest
// path or URL) adds files, git config and the built-in actions fund, trail, mark, announce.

import { generateAgent } from '../index.js'
import { resolveProfile, applyManifest, render, builtinNames } from '../lib/profiles.js'
import { runActions, trailInfo } from '../lib/actions.js'
import { execSync, execFileSync } from 'child_process'
import fs from 'fs'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : null }
const has = (name) => args.includes(name)
const word = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--chain' && args[i - 1] !== '--profile') || flag('--profile') || 'bare'
const dryRun = has('--dry-run') || has('--dry')
const log = (s) => process.stderr.write(`${s}\n`)

if (has('--help') || has('-h')) {
  log(`Usage: npm create agent@latest [profile] [-- options]

Profiles (built in): ${builtinNames().join(', ')}. A name from the catalogue at init-agent.com/profiles.json,
or a path or URL to a manifest, also works. No profile means bare: a key and a DID, nothing else.

Options (after --):
  --chain <id>   chain for the gitmark profile (default: git config gitmark.network, else txbt4)
  --announce     also publish the repo and its first mark to Nostr (public)
  --no-fund      skip funding; --no-mark  skip the first mark
  --dry-run      say what would happen, write nothing, spend nothing
  -h, --help     this`)
  process.exit(0)
}

// Check if this directory is the top of its own git repo. A subfolder of
// another repo does not count: its git config is the parent's, so a key saved
// there would be shared with (and overwritten by) every other subfolder.
function isRepoRoot() {
  try {
    const top = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return fs.realpathSync(top) === fs.realpathSync(process.cwd())
  } catch {
    return false
  }
}

// Check if agent identity already exists in THIS repo (not inherited from parent)
function hasIdentity() {
  try {
    const result = execSync('git config --local nostr.privkey', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return result.length > 0 && fs.existsSync('agent.did.json')
  } catch {
    return false
  }
}

function gitConfig(key) {
  try { return execFileSync('git', ['config', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null } catch { return null }
}

// The profile first, so a bad word fails before anything is written
let profile
try { profile = await resolveProfile(word) } catch (e) { log(`\x1b[31m${e.message}\x1b[0m`); process.exit(1) }
const { manifest } = profile
const chain = flag('--chain') || gitConfig('gitmark.network') || 'txbt4'
const actions = manifest.actions.filter((a) => !(has('--no-fund') && a === 'fund') && !(has('--no-mark') && a === 'mark'))
if (has('--announce') && !actions.includes('announce')) actions.push('announce')

if (profile.source !== 'built-in') {
  log(`\x1b[36mProfile ${manifest.name} from ${profile.source}${profile.publisher ? ` (publisher ${profile.publisher})` : ''}\x1b[0m`)
  log(`  writes: ${Object.keys(manifest.files).join(', ') || 'nothing'}; config: ${Object.keys(manifest.config).join(', ') || 'nothing'}; actions: ${actions.join(', ') || 'none'}`)
}

if (dryRun) {
  log(`\x1b[33m--dry-run: nothing is written, nothing is spent\x1b[0m`)
  log(`would create: a key in git config nostr.privkey, agent.did.json${isRepoRoot() ? '' : ', a git repo here'}`)
  const vars = { DID: 'did:nostr:<pubkey>', PUBKEY: '<pubkey>', CHAIN: chain, NAME: manifest.name }
  const r = applyManifest(manifest, { vars, dryRun: true })
  if (r.written.length) log(`would write: ${r.written.join(', ')}`)
  if (r.skipped.length) log(`would leave alone (exists): ${r.skipped.join(', ')}`)
  if (r.config.length) log(`would set git config: ${r.config.join(', ')}`)
  await runActions(actions, { pubkey: '<pubkey>', chain, cwd: process.cwd(), dryRun: true, log })
  process.exit(0)
}

if (!isRepoRoot()) {
  log('\x1b[36mInitializing git repository...\x1b[0m')
  execSync('git init', { stdio: 'inherit' })
}

let pubkey, did
if (hasIdentity()) {
  if (!actions.length) {
    log('\x1b[33mAgent identity already exists.\x1b[0m')
    log('Privkey found in: git config nostr.privkey')
    log('To regenerate, first run: git config --unset nostr.privkey')
    process.exit(1)
  }
  // a rerun after a failed step: keep the key, continue the profile where it stopped
  did = JSON.parse(fs.readFileSync('agent.did.json', 'utf8'))
  pubkey = String(did.id).replace(/^did:nostr:/, '')
  log(`\x1b[33mAgent identity already exists (${did.id}); continuing the ${manifest.name} profile.\x1b[0m`)
} else {
  const a = generateAgent()
  pubkey = a.pubkey; did = a.did
  fs.writeFileSync('agent.did.json', JSON.stringify(did, null, 2) + '\n')
  execFileSync('git', ['config', 'nostr.privkey', a.privkey])

  // The DID document on stdout (clean JSON, no npm noise); everything else on stderr
  console.log(JSON.stringify(did, null, 2))
  log('')
  log('\x1b[32m✓ Agent identity created\x1b[0m')
  log('\x1b[32m✓ DID saved to agent.did.json\x1b[0m')
  log('\x1b[32m✓ Private key saved to git config nostr.privkey\x1b[0m')
  log('')
  log(`\x1b[36m  Public key:  \x1b[33m${pubkey}\x1b[0m`)
  log(`\x1b[36m  DID:         \x1b[33m${did.id}\x1b[0m`)
  log('')
  log('\x1b[33m⚠  The private key is identity and money. Never print it, never commit it.\x1b[0m')
  log('')
}

// The profile: files, config, then the actions
const vars = { DID: did.id, PUBKEY: pubkey, CHAIN: chain, NAME: manifest.name }
const applied = applyManifest(manifest, { vars })
for (const f of applied.written) log(`\x1b[32m✓ ${f}\x1b[0m`)
for (const f of applied.skipped) log(`\x1b[33m· ${f} exists, left alone\x1b[0m`)
for (const k of applied.config) log(`\x1b[32m✓ git config ${k}\x1b[0m`)
if (manifest.skills.length) log(`\x1b[36mSkills this profile names (install with aam):\x1b[0m\n${manifest.skills.map((s) => `  aam skill install ${s}`).join('\n')}`)

try {
  const ran = await runActions(actions, { pubkey, chain, cwd: process.cwd(), dryRun: false, log, generated: [...applied.written, ...applied.skipped.filter((f) => f in manifest.files)] })
  if (ran.length) { log(''); log(trailInfo({ cwd: process.cwd(), log }).trimEnd()) }
} catch (e) {
  log(`\x1b[31m${e.message}\x1b[0m`)
  log('The key and the DID are in place. Fix the cause and run the same command again; it continues where it stopped.')
  process.exit(1)
}

if (manifest.next.length) { log(''); log('\x1b[36mNext:\x1b[0m'); for (const l of manifest.next) log(`  ${render(l, vars)}`) }
log('')
