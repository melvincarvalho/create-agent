#!/usr/bin/env node

import { generateAgent } from '../index.js'
import { execSync } from 'child_process'
import fs from 'fs'

// Check if in a git repo
function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Check if agent identity already exists in THIS repo (not inherited from parent)
function hasIdentity() {
  try {
    const result = execSync('git config --local nostr.privkey', { encoding: 'utf8' }).trim()
    const hasLocalPrivkey = result.length > 0
    const hasDIDFile = fs.existsSync('agent.did.json')
    return hasLocalPrivkey && hasDIDFile
  } catch {
    return false
  }
}

// Main
if (!isGitRepo()) {
  console.error('\x1b[36mInitializing git repository...\x1b[0m')
  execSync('git init', { stdio: 'inherit' })
}

if (hasIdentity()) {
  console.error('\x1b[33mAgent identity already exists.\x1b[0m')
  console.error('Privkey found in: git config nostr.privkey')
  console.error('To regenerate, first run: git config --unset nostr.privkey')
  process.exit(1)
}

// Generate agent identity
const { privkey, pubkey, nsec, npub, did } = generateAgent()

// Save DID document to file
const didFile = 'agent.did.json'
fs.writeFileSync(didFile, JSON.stringify(did, null, 2) + '\n')

// Save privkey to git config
execSync(`git config nostr.privkey ${privkey}`)

// Also output DID to stdout (clean JSON, no npm noise)
console.log(JSON.stringify(did, null, 2))

// Status messages to stderr
process.stderr.write('\n')
process.stderr.write('\x1b[32m✓ Agent identity created\x1b[0m\n')
process.stderr.write(`\x1b[32m✓ DID saved to ${didFile}\x1b[0m\n`)
process.stderr.write('\x1b[32m✓ Private key saved to git config nostr.privkey\x1b[0m\n')
process.stderr.write('\n')
process.stderr.write(`\x1b[36m  Public key:  \x1b[33m${pubkey}\x1b[0m\n`)
process.stderr.write(`\x1b[36m  npub:        \x1b[33m${npub}\x1b[0m\n`)
process.stderr.write(`\x1b[36m  DID:         \x1b[33m${did.id}\x1b[0m\n`)
process.stderr.write('\n')
process.stderr.write('\x1b[33m⚠  Keep your privkey secret - never commit it\x1b[0m\n')
process.stderr.write('\x1b[0m   View with: git config nostr.privkey\x1b[0m\n')
process.stderr.write('\n')
process.stderr.write('\x1b[36mNext steps:\x1b[0m\n')
process.stderr.write('\x1b[0m  npm install -g aam\x1b[0m\n')
process.stderr.write('\x1b[0m  aam skill sign <name> --repo you/repo\x1b[0m\n')
process.stderr.write('\n')
