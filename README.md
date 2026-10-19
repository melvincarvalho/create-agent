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
# A key and a DID document, nothing else (the bare profile)
npm create agent@latest

# Key, coins, a trail on Bitcoin and the first mark, in one command (the gitmark profile)
npm create agent@latest gitmark

# Or install globally
npm install -g create-agent
create-agent gitmark

# Or as a library
npm install create-agent
```

`npm init agent` is the same command. Write `@latest`: npm keeps an old copy around and reuses it without saying so.

---

## CLI Output

The tool outputs a spec-compliant DID document to `stdout`:

```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://www.w3.org/ns/cid/v1",
    "https://w3id.org/nostr/context"
  ],
  "id": "did:nostr:dd82687ee5a352c6d6de337bce53f150ca1567f3861475c74e7da62695931d23",
  "type": "DIDNostr",
  "seeAlso": "https://init-agent.com/SKILL.md",
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

## Profiles

The key and the DID are always made. A profile is what the command adds on top, chosen by the first word:

| word | what you get |
|------|--------------|
| none, or `bare` | the key in `git config nostr.privkey` and `agent.did.json` |
| `gitmark` | the same, then 10,000 sats to the key from your voucher file, a trail (`git mark init`), the generated files committed as "agent identity" and that commit marked on Bitcoin. Ends with what `git mark info` prints. With no voucher file at all on a test chain it takes one coin from the public bootstrap address first |
| a name from the [catalogue](https://init-agent.com/profiles.json) | a profile someone else published; the command says where it came from and what it writes before applying it |
| a path or URL ending in `.json` | a manifest of your own, before it is listed |

Options go after `--`: `--chain <id>` (default: `git config gitmark.network`, else `txbt4`), `--announce` to also publish the repo and its first mark to Nostr, `--no-fund`, `--no-mark`, `--dry-run` to see every step and write nothing.

```bash
npm create agent@latest gitmark -- --dry-run
npm create agent@latest gitmark -- --chain xbt --announce
```

### A profile is a manifest, not code

```json
{
  "name": "gitmark",
  "description": "Key, coins, a trail on Bitcoin and the first mark, in one command.",
  "actions": ["fund", "trail", "mark"],
  "files": { ".claude/settings.json": "{ \"permissions\": { \"allow\": [\"Bash(git mark *)\"] } }" },
  "config": { "gitmark.announce": "false" },
  "skills": [],
  "next": ["Your agent ${DID} exists on ${CHAIN}."]
}
```

- `files`: written into the repo unless they exist; `${DID}`, `${PUBKEY}`, `${CHAIN}`, `${NAME}` are filled in. Forward-slash relative paths only, no `..`, no segment named `.git` in any case, and the resolved path must stay inside the repo, links included
- `config`: `git config --local` keys, in the `gitmark.*` and `agent.*` namespaces or `nostr.relays` only. git runs the values of many other keys as commands (`core.pager`, `alias.*`, `filter.*`), so those are refused, as is `nostr.privkey`
- `actions`: only these four, run in this order whatever the manifest says: `fund`, `trail`, `mark`, `announce`. They are the steps of [git-mark.com/start.html](https://git-mark.com/start.html), implemented here, not in the manifest
- `skills`: names for [aam](https://aam.wtf); printed as install lines, never run
- `next`: lines printed at the end

A profile never sees the private key, never runs code, and stops at the first failing step with the step named; the key and the DID stay in place, and running the same command again continues where it stopped. The `mark` step commits only what the command made (`agent.did.json`, the profile's files, the funding record, the trail), never the rest of a working tree, with commit signing and hooks off for that commit. A catalogue entry may carry the manifest's `sha256`; then a hosted manifest that changes after review is refused.

### Where profiles live

Looked up in this order: `profiles/` in this package (built in, offline), then the catalogue at `init-agent.com/profiles.json` (name, description, publisher DID, manifest URL; added by pull request to this repo), then a path or URL given directly. The gitmark profile also writes `.claude/settings.json` into the repo with allow rules for `git mark`, `npx fund-agent@latest` and `npm create agent@latest`, so an agent running under Claude Code is not blocked on its own tools.

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
| `@context` | W3C CID v1 + Nostr context |
| `id` | `did:nostr:<pubkey>` |
| `type` | `DIDNostr` |
| `seeAlso` | Link to the [agent onboarding skill](https://init-agent.com/SKILL.md) |
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
