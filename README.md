# npm init agent

[![npm version](https://img.shields.io/npm/v/create-agent.svg)](https://www.npmjs.com/package/create-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org/)

> **Your AI agent has no identity.** It can't prove who it is. It can't sign anything. It can't be trusted.

Instantly generates a cryptographic identity with a [W3C DID document](https://www.w3.org/TR/did-core/) — the foundation for **safe AI agents you can trust**.

Use with [aam](https://aam.wtf) to sign and verify skills and agents.

---

## Why?

AI agents and autonomous systems need verifiable identities. Traditional auth (API keys, OAuth) wasn't designed for machine-to-machine trust. **create-agent** provides:

- **W3C Standards** — DID documents for interoperability
- **Cryptographic Identity** — Schnorr keypairs on secp256k1
- **Decentralized** — No central authority, works with Nostr relays
- **Zero Config** — One command, instant identity

---

## Installation

```bash
# Just run it (no install required)
npm init agent

# Or install globally
npm install -g create-agent
create-agent

# Or as a library
npm install create-agent
```

---

## CLI Output

The tool outputs a spec-compliant DID document to `stdout`:

```json
{
  "@context": [
    "https://www.w3.org/ns/cid/v1",
    "https://w3id.org/nostr/context"
  ],
  "id": "did:nostr:dd82687ee5a352c6d6de337bce53f150ca1567f3861475c74e7da62695931d23",
  "type": "DIDNostr",
  "verificationMethod": [
    {
      "id": "did:nostr:dd82687ee5a352c6d6de337bce53f150ca1567f3861475c74e7da62695931d23#key1",
      "type": "Multikey",
      "controller": "did:nostr:dd82687ee5a352c6d6de337bce53f150ca1567f3861475c74e7da62695931d23",
      "publicKeyMultibase": "fe70102dd82687ee5a352c6d6de337bce53f150ca1567f3861475c74e7da62695931d23"
    }
  ],
  "authentication": ["#key1"],
  "assertionMethod": ["#key1"],
  "service": []
}
```

Key information is displayed on `stderr` for security (private keys in red).

---

## Programmatic API

```javascript
import { generateAgent } from 'create-agent'

const agent = generateAgent()

// Nostr keys
console.log(agent.pubkey)   // hex public key
console.log(agent.npub)     // bech32 public key
console.log(agent.privkey)  // hex private key (keep secret)
console.log(agent.nsec)     // bech32 private key (keep secret)

// W3C DID Document
console.log(agent.did.id)   // did:nostr:<pubkey>
console.log(agent.did)      // full DID document
```

---

## CLI Examples

```bash
# Save DID document to file
create-agent > agent-identity.json

# Extract DID identifier
create-agent | jq -r '.id'

# Extract public key
create-agent | jq -r '.verificationMethod[0].publicKeyMultibase'

# Suppress stderr, get only JSON
create-agent 2>/dev/null
```

---

## Output Reference

### Keys

| Field | Format | Description |
|-------|--------|-------------|
| `pubkey` | 64 hex chars | Public key (shareable) |
| `npub` | bech32 | Human-readable public key |
| `privkey` | 64 hex chars | Private key — **keep secret** |
| `nsec` | bech32 | Human-readable private key — **keep secret** |

### DID Document

| Field | Value |
|-------|-------|
| `@context` | W3C DID v1 + Nostr context |
| `id` | `did:nostr:<pubkey>` |
| `type` | `DIDNostr` |
| `verificationMethod` | Multikey with secp256k1 |
| `authentication` | `#key1` reference |
| `assertionMethod` | `#key1` reference |

### Multibase Encoding

The `publicKeyMultibase` follows multicodec standards:

```
fe70102<pubkey>
│└───┘└┘└─────┘
│  │   │   └── 32-byte x-coordinate
│  │   └────── 02 compressed key prefix
│  └────────── e701 secp256k1-pub varint
└───────────── f base16-lower prefix
```

---

## Use Cases

| Application | Description |
|-------------|-------------|
| **Sign Skills & Agents** | Cryptographically sign AI skills with [aam](https://aam.wtf) |
| **AI Agents** | Verifiable identity for autonomous systems |
| **Nostr Bots** | Generate keypairs for automated accounts |
| **Testing** | Create ephemeral identities for integration tests |
| **Credentials** | Subject identifiers for Verifiable Credentials |

---

## Security

Private keys (`privkey`, `nsec`) are cryptographic secrets. Exposure allows:

- Signing messages as the identity
- Accessing encrypted communications
- Full impersonation

The CLI outputs private keys to `stderr` only, allowing safe piping of the DID document.

---

## Next Steps: Sign Your Agents

Use your identity to sign skills and agents with [aam](https://aam.wtf):

```bash
# 1. Generate your identity
npm init agent
# Save your privkey (hex format)

# 2. Install aam
npm install -g aam

# 3. Sign a skill you've created
aam skill sign my-skill --privkey <your-privkey> --repo user/repo

# 4. Others can verify your signature
aam skill verify my-skill
```

This creates a **Nostr event (kind 31337)** cryptographically linking your identity to the skill. No black boxes. No hidden motives. Trust through transparency.

Learn more at [aam.wtf](https://aam.wtf)

---

## Specification

This implementation follows the [did:nostr Method Specification](https://nostrcg.github.io/did-nostr/) maintained by the [W3C Nostr Community Group](https://www.w3.org/community/nostr/).

---

## Related

- [aam](https://aam.wtf) — Sign and verify AI skills and agents
- [did:nostr Specification](https://nostrcg.github.io/did-nostr/)
- [DID:nostr Explorer](https://nostrapps.github.io/did-explorer/)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- [W3C DID Core](https://www.w3.org/TR/did-core/)

---

## Development

```bash
git clone https://github.com/melvincarvalho/create-agent.git
cd create-agent
npm install
npm test
```

---

## License

MIT — [Agentic Alliance](https://agenticalliance.com/)
