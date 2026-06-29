import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'

/**
 * Generate a new Nostr agent identity
 * @returns {{ privkey: string, pubkey: string, nsec: string, npub: string, did: object }}
 */
export function generateAgent() {
  // Generate cryptographically secure private key (32 bytes)
  const sk = generateSecretKey()
  const privkey = Array.from(sk)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Derive public key using Schnorr signatures
  const pubkey = getPublicKey(sk)

  // Encode keys in Nostr formats
  const nsec = nip19.nsecEncode(sk)
  const npub = nip19.npubEncode(pubkey)

  // Create publicKeyMultibase: f (base16-lower) + e701 (secp256k1-pub varint) + 02 (even parity) + pubkey
  const publicKeyMultibase = `fe70102${pubkey}`

  // Create DID document per https://nostrcg.github.io/did-nostr/
  const did = {
    "@context": [
      "https://www.w3.org/ns/cid/v1",
      "https://w3id.org/nostr/context"
    ],
    "id": `did:nostr:${pubkey}`,
    "type": "DIDNostr",
    // Discovery breadcrumb: an agent can follow this to learn the did:nostr method
    "seeAlso": "https://init-agent.com/SKILL.md",
    "verificationMethod": [
      {
        "id": `did:nostr:${pubkey}#key1`,
        "type": "Multikey",
        "controller": `did:nostr:${pubkey}`,
        "publicKeyMultibase": publicKeyMultibase
      }
    ],
    "authentication": ["#key1"],
    "assertionMethod": ["#key1"],
    "service": []
  }

  return { privkey, pubkey, nsec, npub, did }
}
