import { test, describe } from 'node:test'
import assert from 'node:assert'
import { generateAgent } from '../index.js'

describe('generateAgent', () => {
  test('returns all expected properties', () => {
    const agent = generateAgent()
    
    assert.ok(agent.privkey, 'should have privkey')
    assert.ok(agent.pubkey, 'should have pubkey')
    assert.ok(agent.nsec, 'should have nsec')
    assert.ok(agent.npub, 'should have npub')
    assert.ok(agent.did, 'should have did')
  })

  test('privkey is 64-character hex string', () => {
    const { privkey } = generateAgent()
    
    assert.strictEqual(privkey.length, 64)
    assert.match(privkey, /^[0-9a-f]{64}$/)
  })

  test('pubkey is 64-character hex string', () => {
    const { pubkey } = generateAgent()
    
    assert.strictEqual(pubkey.length, 64)
    assert.match(pubkey, /^[0-9a-f]{64}$/)
  })

  test('nsec starts with nsec1', () => {
    const { nsec } = generateAgent()
    
    assert.ok(nsec.startsWith('nsec1'))
  })

  test('npub starts with npub1', () => {
    const { npub } = generateAgent()
    
    assert.ok(npub.startsWith('npub1'))
  })

  test('did document has correct structure', () => {
    const { did, pubkey } = generateAgent()
    
    assert.deepStrictEqual(did['@context'], [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/nostr/context'
    ])
    assert.strictEqual(did.id, `did:nostr:${pubkey}`)
    assert.ok(Array.isArray(did.verificationMethod))
    assert.strictEqual(did.verificationMethod[0].type, 'SchnorrVerification2025')
    assert.deepStrictEqual(did.authentication, ['#key1'])
    assert.deepStrictEqual(did.assertionMethod, ['#key1'])
    assert.deepStrictEqual(did.service, [])
  })

  test('generates unique keys on each call', () => {
    const agent1 = generateAgent()
    const agent2 = generateAgent()
    
    assert.notStrictEqual(agent1.privkey, agent2.privkey)
    assert.notStrictEqual(agent1.pubkey, agent2.pubkey)
    assert.notStrictEqual(agent1.nsec, agent2.nsec)
    assert.notStrictEqual(agent1.npub, agent2.npub)
  })
})
