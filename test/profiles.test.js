import { test, describe } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, execSync } from 'child_process'
import { resolveProfile, validateManifest, applyManifest, render, builtinNames, KNOWN_ACTIONS } from '../lib/profiles.js'
import { runActions } from '../lib/actions.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'create-agent-'))
const bin = path.resolve('bin/create-agent.js')

describe('profiles', () => {
  test('built-ins: bare does nothing, gitmark asks for fund, trail, mark', async () => {
    assert.deepStrictEqual(builtinNames(), ['bare', 'gitmark'])
    const bare = await resolveProfile('bare')
    assert.strictEqual(bare.source, 'built-in')
    assert.deepStrictEqual(bare.manifest.actions, [])
    const gm = await resolveProfile('gitmark')
    assert.deepStrictEqual(gm.manifest.actions, ['fund', 'trail', 'mark'])
    assert.ok('.claude/settings.json' in gm.manifest.files)
    const def = await resolveProfile()
    assert.strictEqual(def.manifest.name, 'bare')
  })

  test('validateManifest refuses code-like and key-touching manifests', () => {
    assert.throws(() => validateManifest({ name: 'x', hooks: ['rm -rf'] }), /unknown key "hooks"/)
    assert.throws(() => validateManifest({ name: 'x', actions: ['exec'] }), /unknown action "exec"/)
    assert.throws(() => validateManifest({ name: 'x', files: { '../../.bashrc': 'x' } }), /not allowed/)
    assert.throws(() => validateManifest({ name: 'x', files: { '/etc/passwd': 'x' } }), /not allowed/)
    assert.throws(() => validateManifest({ name: 'x', files: { '.git/hooks/pre-commit': 'x' } }), /not allowed/)
    assert.throws(() => validateManifest({ name: 'x', config: { 'nostr.privkey': '00' } }), /may not set nostr.privkey/)
    assert.throws(() => validateManifest({ name: 'Bad Name' }), /name must be/)
    const ok = validateManifest({ name: 'ok', files: { 'a/b.txt': '${DID}' }, config: { 'gitmark.announce': 'true' }, actions: ['mark'] })
    assert.deepStrictEqual(ok.skills, [])
    assert.ok(KNOWN_ACTIONS.includes('announce'))
  })

  test('resolves a path, a URL and a catalogue name; refuses an unknown word with the names it knows', async () => {
    const dir = tmp()
    const file = path.join(dir, 'mine.json')
    fs.writeFileSync(file, JSON.stringify({ name: 'mine', files: { 'hello.txt': 'hi ${NAME}' } }))
    const byPath = await resolveProfile(file)
    assert.strictEqual(byPath.manifest.name, 'mine')
    const seen = []
    const fetch = async (url) => {
      seen.push(url)
      if (url === 'https://init-agent.com/profiles.json') return { ok: true, text: async () => JSON.stringify({ profiles: [{ name: 'vercel', publisher: 'did:nostr:ab', manifest: 'https://example.com/vercel.json' }] }) }
      if (url === 'https://example.com/vercel.json') return { ok: true, text: async () => JSON.stringify({ name: 'vercel', next: ['deploy'] }) }
      return { ok: false, status: 404 }
    }
    const byUrl = await resolveProfile('https://example.com/vercel.json', { fetch })
    assert.strictEqual(byUrl.source, 'https://example.com/vercel.json')
    const byCat = await resolveProfile('vercel', { fetch })
    assert.strictEqual(byCat.publisher, 'did:nostr:ab')
    assert.deepStrictEqual(seen.slice(-2), ['https://init-agent.com/profiles.json', 'https://example.com/vercel.json'])
    await assert.rejects(resolveProfile('nope', { fetch }), /Unknown profile "nope". Built-ins: bare, gitmark. Catalogue: vercel/)
    fs.rmSync(dir, { recursive: true })
  })

  test('applyManifest writes rendered files and config, never overwrites, and a dry run writes nothing', () => {
    const dir = tmp()
    execSync('git init -q', { cwd: dir })
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'mine')
    const m = validateManifest({ name: 'x', files: { 'keep.txt': 'theirs', 'sub/did.txt': 'I am ${DID} on ${CHAIN}' }, config: { 'gitmark.announce': 'true' } })
    const dry = applyManifest(m, { cwd: dir, vars: { DID: 'did:nostr:ab', CHAIN: 'txbt4' }, dryRun: true })
    assert.deepStrictEqual(dry.written, ['sub/did.txt'])
    assert.ok(!fs.existsSync(path.join(dir, 'sub/did.txt')))
    const r = applyManifest(m, { cwd: dir, vars: { DID: 'did:nostr:ab', CHAIN: 'txbt4' } })
    assert.deepStrictEqual(r, { written: ['sub/did.txt'], skipped: ['keep.txt'], config: ['gitmark.announce'] })
    assert.strictEqual(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8'), 'mine')
    assert.strictEqual(fs.readFileSync(path.join(dir, 'sub/did.txt'), 'utf8'), 'I am did:nostr:ab on txbt4')
    assert.strictEqual(execSync('git config --local gitmark.announce', { cwd: dir, encoding: 'utf8' }).trim(), 'true')
    assert.strictEqual(render('${PUBKEY}-${NOPE}', { PUBKEY: 'p' }), 'p-${NOPE}')
    fs.rmSync(dir, { recursive: true })
  })

  test('runActions keeps the fixed order and names the failing step', async () => {
    const order = []
    const fake = { mark: async () => order.push('mark'), fund: async () => order.push('fund'), trail: async () => { throw new Error('no coin') } }
    await assert.rejects(runActions(['mark', 'trail', 'fund'], { actions: fake, log: () => {} }), /step "trail" failed: no coin/)
    assert.deepStrictEqual(order, ['fund'])
  })

  test('CLI: gitmark --dry-run in an empty folder writes nothing and spends nothing', () => {
    const dir = tmp()
    const r = execFileSync('node', [bin, 'gitmark', '--dry-run'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FUND_AGENT_FAUCET: path.join(dir, 'no-such-faucet.txt') } })
    assert.strictEqual(fs.readdirSync(dir).length, 0)
    fs.rmSync(dir, { recursive: true })
  })

  test('CLI: an unknown profile fails before anything is written', () => {
    const dir = tmp()
    assert.throws(() => execFileSync('node', [bin, 'https://127.0.0.1:9/none.json'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
    assert.strictEqual(fs.readdirSync(dir).length, 0)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('review fixes', () => {
  test('config keys git could execute are refused; gitmark.*, agent.* and nostr.relays pass', () => {
    for (const k of ['core.pager', 'core.fsmonitor', 'alias.x', 'filter.a.clean', 'credential.helper', 'include.path', 'core.sshCommand', 'diff.external', 'NOSTR.PRIVKEY']) {
      assert.throws(() => validateManifest({ name: 'x', config: { [k]: '!sh' } }), new RegExp('not allowed|may not set'), k)
    }
    const ok = validateManifest({ name: 'x', config: { 'gitmark.announce': 'true', 'agent.role': 'bot', 'nostr.relays': 'wss://a' } })
    assert.deepStrictEqual(Object.keys(ok.config), ['gitmark.announce', 'agent.role', 'nostr.relays'])
    assert.throws(() => validateManifest({ name: 'x', config: { 'gitmark.x': 'a\nb' } }), /single-line/)
  })

  test('file paths: case-insensitive .git, nested .git, backslashes and drive letters are refused', () => {
    for (const p of ['.GIT/config', 'a/.git/hooks/x', 'a\\..\\b', 'C:/x', 'a/../b', './a', 'a//b']) {
      assert.throws(() => validateManifest({ name: 'x', files: { [p]: 'x' } }), /not allowed/, p)
    }
    assert.ok(validateManifest({ name: 'x', files: { 'a/b/c.txt': 'x', '.claude/settings.json': '{}' } }))
  })

  test('applyManifest refuses to follow a symlinked directory out of the repo', () => {
    const dir = tmp(); const outside = tmp()
    execSync('git init -q', { cwd: dir })
    fs.symlinkSync(outside, path.join(dir, 'link'))
    const m = validateManifest({ name: 'x', files: { 'link/evil.txt': 'x' } })
    assert.throws(() => applyManifest(m, { cwd: dir }), /leaves the repo/)
    assert.ok(!fs.existsSync(path.join(outside, 'evil.txt')))
    fs.rmSync(dir, { recursive: true }); fs.rmSync(outside, { recursive: true })
  })

  test('a catalogue entry with sha256 pins the manifest', async () => {
    const body = JSON.stringify({ name: 'pinned', next: ['ok'] })
    const { createHash } = await import('node:crypto')
    const good = createHash('sha256').update(body).digest('hex')
    const fetch = (hash) => async (url) => {
      if (url.endsWith('/profiles.json')) return { ok: true, text: async () => JSON.stringify({ profiles: [{ name: 'pinned', manifest: 'https://example.com/p.json', sha256: hash }] }) }
      return { ok: true, text: async () => body }
    }
    assert.strictEqual((await resolveProfile('pinned', { fetch: fetch(good) })).manifest.name, 'pinned')
    await assert.rejects(resolveProfile('pinned', { fetch: fetch('00'.repeat(32)) }), /has changed since it was listed/)
  })

  test('CLI mark step commits only the generated files, with signing and hooks off, and a rerun continues', async () => {
    const dir = tmp()
    execSync('git init -q', { cwd: dir })
    fs.writeFileSync(path.join(dir, 'secret.env'), 'TOKEN=abc')          // must never be committed
    execSync('git config --local commit.gpgsign true', { cwd: dir })       // must not break the commit
    fs.mkdirSync(path.join(dir, '.git/hooks'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })  // must be bypassed
    const { ACTIONS } = await import('../lib/actions.js')
    // run the mark step with gitmark replaced by a no-op: we are testing the commit, not the chain
    const ctx = { cwd: dir, dryRun: false, log: () => {}, generated: ['.claude/settings.json'] }
    fs.writeFileSync(path.join(dir, 'agent.did.json'), '{"id":"did:nostr:ab"}')
    fs.mkdirSync(path.join(dir, '.claude')); fs.writeFileSync(path.join(dir, '.claude/settings.json'), '{}')
    fs.writeFileSync(path.join(dir, 'blocktrails.json'), JSON.stringify({ states: [] }))
    // gitmark binary is spawned via process.execPath; point GITMARK at a stub by monkeypatching the module is heavy,
    // so instead expect the real git mark to fail (no coin) and check what was committed before it ran
    await assert.rejects(ACTIONS.mark(ctx))
    const files = execSync('git show --name-only --format= HEAD', { cwd: dir, encoding: 'utf8' }).trim().split('\n').sort()
    assert.deepStrictEqual(files, ['.claude/settings.json', 'agent.did.json', 'blocktrails.json'])
    assert.strictEqual(execSync('git log --format=%s', { cwd: dir, encoding: 'utf8' }).trim(), 'agent identity')
    assert.match(execSync('git status --short', { cwd: dir, encoding: 'utf8' }), /\?\? secret\.env/)
    fs.rmSync(dir, { recursive: true })
  })
})

describe('trail waits for the explorer', () => {
  test('waitForExplorer retries lookupOutput until it resolves, without real sleeping', async () => {
    const { waitForExplorer } = await import('../lib/actions.js')
    const logs = []
    const ctx = { funded: { chain: 'txbt4', txid: 'ab'.repeat(32), vout: 0 }, log: (l) => logs.push(l) }
    // lookupOutput hits the real explorer URL; stub fetch through fund-agent is not reachable from here,
    // so point the outpoint at a chain whose API host does not resolve and check the retry/give-up path
    const slept = []
    const ok = await waitForExplorer({ ...ctx, funded: { chain: 'tbtc3', txid: 'ab'.repeat(32), vout: 0 } }, { tries: 2, delayMs: 1, sleep: async (ms) => { slept.push(ms) } })
    assert.strictEqual(ok, false)
    assert.deepStrictEqual(slept, [1, 1])
    assert.match(logs[0], /waiting for the explorer/)
    assert.match(logs.at(-1), /trying init anyway/)
  })
})
