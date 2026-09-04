# Architecture

## System

```mermaid
flowchart TD
    A[CKB application] --> B[Injected CCC Client and operation-scoped Signer]
    B --> C[Obscell PrivacyClient]
    C --> D[Privacy core]
    D --> E[Protocol state, proof, and CT invariants]
    E --> F[CKB PoolState, Vault, and Staging cells]
    G[Coordinator] -. derives and proposes .-> F
    H[Relayer] -. reconstructs and submits .-> F
    I[Indexer] -. observes and caches .-> F
```

The dashed services are replaceable operators. They do not define roots, nullifiers, commitments, balances, or accepted state. A CKB application can remove Obscell and continue using the same CCC connection and signer.

## Deposit

```mermaid
flowchart LR
    A[User-owned supported CT] -->|CCC builds; user signs| B[StagingDepositCell]
    B -->|confirmed chain discovery| C[Deterministic acceptance plan]
    C -->|input conflict selects current state| D[Successor PoolState]
    C --> E[Successor Vault]
    D --> F[Authoritative root and sequence]
    E --> G[Authoritative CT balance]
```

The staging output commits to pool identity, asset, denomination, leaf, refund lock, and timeout. Acceptance consumes the live PoolState/Vault pair and confirmed staging cells atomically. A coordinator may build the transaction, but CKB validation decides whether it is accepted.

## Withdrawal

```mermaid
flowchart LR
    A[Accepted local note] --> B[Chain-derived Merkle path]
    B --> C[Local proof generation]
    C --> D[Typed withdrawal intent]
    D --> E[Reconstructed PoolState and Vault transition]
    E --> F[Recipient-controlled CT output]
    F --> G[Recipient spends CT with normal CCC signer]
```

The proof binds pool, asset, denomination/value, accepted root, nullifier, recipient, action, and authorization tag. The Pool script must recompute protected fields from actual transaction data before accepting the transition.

## Trust Boundary

```mermaid
flowchart TB
    subgraph ON[On-chain authority]
      PS[PoolState and sequence]
      V[Vault and CT accounting]
      N[Nullifier state]
      M[Commitments and accepted roots]
      PV[Proof and transition validation]
    end
    subgraph CLIENT[Private client boundary]
      S[Note secret]
      NS[Nullifier secret]
      ES[Encrypted note state]
      PG[Proof generation]
    end
    subgraph OFF[Untrusted / replaceable services]
      CO[Coordinator]
      RE[Relayer]
      IX[Indexer and cache]
      RD[(Redis)]
    end
    CLIENT -->|public commitment / intent only| OFF
    OFF -->|candidate transactions / observations| ON
    ON -->|canonical cells and confirmations| CLIENT
    RD --- CO
    RD --- RE
    RD --- IX
```

Client secrets never belong in coordinator, relayer, indexer, Redis, logs, telemetry, or transaction witnesses. Wiping Redis may lose queues or cached progress, but must not change protocol truth.

## SDK

```mermaid
flowchart TD
    APP[Application or reference wallet] --> PC[PrivacyClient]
    PC --> CORE[core: capabilities, operations, errors]
    PC --> NOTES[notes: encrypted state and lifecycle]
    PC --> PROTOCOL[protocol: schemas and invariants]
    PC --> CRYPTO[crypto, Merkle, nullifier]
    PC --> PROVER[prover abstraction]
    PC --> SERVICES[coordinator, relayer, indexer interfaces]
    PC --> ADAPTER[ccc: deployment, reader, transaction, signer, capacity]
    ADAPTER --> CCC[Injected CCC Client / Signer]
    CCC --> CKB[CKB]
```

The SDK does not own React, JoyID, wallet selection, deployment keys, relayer hot keys, Redis, analytics, or product UI. Wallet connectors remain application concerns. A signer is supplied only to the operation that needs user approval.

## State Ownership

| Data | Authority | Cached/derived copies |
|---|---|---|
| Pool identity and configuration | Pool Type-ID / genesis PoolState | Deployment manifest, SDK cache |
| Current sequence and root | Live PoolStateCell | Client and indexer cache |
| Commitments | Accepted PoolState transition / chain history | Merkle index |
| Vault value and CT asset | Live VaultCell plus CT script | Client and service cache |
| Nullifier spent state | Live PoolState nullifier commitment | Indexer cache |
| Note secrets | User-controlled encrypted state | No service copy |
| Operation queue and idempotency | Operational only | Redis or local store |
| Transaction confirmation | CKB canonical chain | Service/client observations |

## Identity And Versioning

Corrected V1 uses fresh script code hashes, Type-IDs, pool IDs, circuit artifact hashes, and a versioned deployment manifest. Legacy registry cells and coordinator sessions are never V1 genesis inputs. Network, genesis hash, code hashes, outpoints, script args, circuit hashes, tree depth, denomination, and CT identity must all match before `getCapabilities()` may report settlement as available.
