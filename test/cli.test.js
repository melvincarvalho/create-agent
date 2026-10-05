import { test, describe } from 'node:test'
import assert from 'node:assert'
import { execSync, execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const bin = path.resolve('bin/create-agent.js')
const git = (cwd, args) => execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const run = (cwd) => execFileSync('node', [bin], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'create-agent-'))

describe('create-agent CLI', () => {
  test('in a subfolder of a repo, makes the subfolder its own repo', () => {
    const parent = tmp()
    git(parent, 'init -q')
    const sub = path.join(parent, 'project')
    fs.mkdirSync(sub)

    run(sub)

    assert.ok(fs.existsSync(path.join(sub, '.git')), 'subfolder should get its own .git')
    assert.ok(fs.existsSync(path.join(sub, 'agent.did.json')))
    assert.match(git(sub, 'config --local nostr.privkey'), /^[0-9a-f]{64}$/)
    assert.throws(() => git(parent, 'config --local nostr.privkey'), 'parent config must not hold the key')
  })

  test('two subfolders of one repo keep separate keys', () => {
    const parent = tmp()
    git(parent, 'init -q')
    const a = path.join(parent, 'a')
    const b = path.join(parent, 'b')
    fs.mkdirSync(a)
    fs.mkdirSync(b)

    run(a)
    const keyA = git(a, 'config --local nostr.privkey')
    run(b)

    assert.strictEqual(git(a, 'config --local nostr.privkey'), keyA, "b must not overwrite a's key")
    assert.notStrictEqual(git(b, 'config --local nostr.privkey'), keyA)
  })

  test('at the top of an existing repo, uses that repo', () => {
    const dir = tmp()
    git(dir, 'init -q')
    const before = fs.readdirSync(path.join(dir, '.git')).length

    run(dir)

    assert.match(git(dir, 'config --local nostr.privkey'), /^[0-9a-f]{64}$/)
    assert.ok(fs.readdirSync(path.join(dir, '.git')).length >= before)
  })

  test('outside any repo, initialises one', () => {
    const dir = tmp()
    run(dir)
    assert.ok(fs.existsSync(path.join(dir, '.git')))
    assert.match(git(dir, 'config --local nostr.privkey'), /^[0-9a-f]{64}$/)
  })

  test('refuses to run twice in the same folder', () => {
    const dir = tmp()
    run(dir)
    assert.throws(() => run(dir), /already exists/)
  })
})
