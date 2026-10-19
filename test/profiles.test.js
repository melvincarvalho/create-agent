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
      if (url === 'https://init-agent.com/profiles.json') return { ok: true, json: async () => ({ profiles: [{ name: 'vercel', publisher: 'did:nostr:ab', manifest: 'https://example.com/vercel.json' }] }) }
      if (url === 'https://example.com/vercel.json') return { ok: true, json: async () => ({ name: 'vercel', next: ['deploy'] }) }
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
