#!/usr/bin/env node

// =============================================================================
// NOSTR KEY GENERATION
// =============================================================================
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

// Generate cryptographically secure private key (32 bytes)
const privkey = generateSecretKey();
const privkeyHex = Array.from(privkey)
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');

// Derive public key using Schnorr signatures (32 bytes, hex encoded)
const pubkey = getPublicKey(privkey);

// Encode keys in Nostr formats
const nsec = nip19.nsecEncode(privkey);
const npub = nip19.npubEncode(pubkey);

// =============================================================================
// DID DOCUMENT CREATION
// =============================================================================
const didDocument = {
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/nostr/context"
  ],
  "id": `did:nostr:${pubkey}`,
  "verificationMethod": [
    {
      "id": `did:nostr:${pubkey}#key1`,
      "controller": `did:nostr:${pubkey}`,
      "type": "SchnorrVerification2025"
    }
  ],
  "authentication": [
    "#key1"
  ],
  "assertionMethod": [
    "#key1"
  ],
  "service": []  // Empty services array
};

// =============================================================================
// CONSOLE OUTPUT
// =============================================================================
// First output the initial warning message to stderr
process.stderr.write('\x1b[36m🤖 Creating new Nostr agent identity...\x1b[0m\n');
process.stderr.write('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
process.stderr.write('\x1b[33m⚠️  IMPORTANT: Keep your private key (nsec/privkey) secret!\x1b[0m\n');
process.stderr.write('\x1b[33m   Never share it with anyone or input it on websites.\x1b[0m\n');
process.stderr.write('\n');

// Then output the Nostr identity information to stderr
process.stderr.write('\n\x1b[32m📋 Your Nostr Identity:\x1b[0m\n');
process.stderr.write('\x1b[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
process.stderr.write(`\x1b[0mPublic Key (hex) : \x1b[33m${pubkey}\x1b[0m\n`);
process.stderr.write(`\x1b[0mNostr Public Key : \x1b[33m${npub}\x1b[0m\n`);
process.stderr.write(`\x1b[0mPrivate Key (hex): \x1b[31m${privkeyHex}\x1b[0m\n`);
process.stderr.write(`\x1b[0mNostr Secret Key : \x1b[31m${nsec}\x1b[0m\n`);
process.stderr.write('\n');
process.stderr.write('\x1b[36m🔍 Usage:\x1b[0m\n');
process.stderr.write('\x1b[0m- Use your npub to identify yourself to others\x1b[0m\n');
process.stderr.write('\x1b[0m- Add relays to the services array for discovery\x1b[0m\n');
process.stderr.write('\x1b[0m- Use nsec to sign into Nostr clients (handle with extreme care!)\x1b[0m\n');
process.stderr.write('\n');


// Then output the DID document to stdout with a clear header in the output
process.stderr.write('\x1b[36m📄 DID Nostr Document:\x1b[0m\n');
process.stderr.write('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
console.log(JSON.stringify(didDocument, null, 2));
process.stderr.write('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
