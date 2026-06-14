# How Privacy Mixer Withdrawal Works

## 1. What is in the Deposit Note?

When you deposit into the privacy mixer, your funds are essentially locked in a massive pool alongside everyone else's. To withdraw your funds later without anyone knowing which deposit was yours, you need mathematical proof of ownership.

### The Deposit Note contains two absolutely essential pieces of data:

- **secret**: A completely random 32-byte number generated locally in your browser.
- **nullifierSecret**: Another completely random 32-byte number.

When you deposit, the system combines these two secrets, hashes them, and publishes the resulting commitment to the blockchain. No one can reverse-engineer the hash to find your secrets.

Later, when you want to withdraw, the frontend uses the secret and nullifierSecret from your note to generate a **Zero-Knowledge Proof (ZK Proof)**. This proof mathematically guarantees to the blockchain: "I know the secrets for one of the deposits in this pool, and I haven't spent it yet" — all without revealing which specific deposit it belongs to!

> ⚠️ **Important**: If you lose the note, you lose the secrets, and the ZK proof cannot be generated. Your funds would be permanently locked in the mixer.

## 2. Broadcast Direct vs. Relay Private

When you withdraw, the CKB blockchain requires a small transaction fee (gas) to process the withdrawal. How that fee is paid is what separates these two buttons:

### 🟢 Broadcast Direct

**How it works:** Your browser generates the ZK Proof, builds the withdrawal transaction, and asks your connected JoyID wallet to pay the CKB transaction fee and broadcast it.

**The Catch:** Because your JoyID wallet pays the fee, there is an on-chain link between your JoyID wallet and the withdrawal. Anyone looking at the blockchain can see: "Ah, Wallet A paid the gas fee for this anonymous withdrawal, so Wallet A must own those funds."

**Result:** It breaks your privacy. It is useful for testing or if you don't care about anonymity, but it defeats the purpose of the mixer.

### 🕵️ Relay Private (The Anonymous Way)

**How it works:** Your browser generates the ZK Proof and builds the withdrawal transaction, but does not ask your JoyID wallet to pay the fee. Instead, it sends the unsigned transaction to the Relayer backend.

**What the Relayer does:** The Relayer is a separate server with its own wallet. It takes your transaction, pays the CKB gas fee using its own funds, and broadcasts it to the network. In exchange, the Relayer automatically deducts a small fee (e.g., 1%) from your withdrawn amount.

**Security:** The Relayer cannot steal your funds. The destination address where the funds are going is cryptographically locked into the ZK proof before it ever leaves your browser. If the Relayer tries to change the destination address to itself, the ZK proof becomes invalid and the blockchain rejects it.

**Result:** 100% Privacy. Your JoyID wallet is never involved. The funds arrive at a brand-new, clean stealth address, and there is absolutely zero on-chain link between your original deposit and your new withdrawal.