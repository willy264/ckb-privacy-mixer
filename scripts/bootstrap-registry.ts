/**
 * bootstrap-registry.ts
 * Create the initial nullifier registry cell on Aggron using Lumos.
 * Usage: npx tsx scripts/bootstrap-registry.ts
 */
import { bootstrapRegistryCell, initializeAggron, requiredEnv } from './lumos-common';

async function main() {
    initializeAggron();

    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const nullifierCodeHash = requiredEnv('NULLIFIER_TYPE_CODE_HASH');
    const nullifierHashType =
        (process.env.NULLIFIER_TYPE_HASH_TYPE as 'data' | 'data1' | 'type' | undefined) ?? 'data1';
    const typeArgs = process.env.NULLIFIER_REGISTRY_TYPE_ARGS || '0x';

    console.log('=== Nullifier Registry Bootstrap (Lumos) ===');
    const result = await bootstrapRegistryCell(
        privateKey,
        nullifierCodeHash,
        nullifierHashType,
        typeArgs,
    );

    console.log('Registry bootstrap complete.');
    console.log(`NULLIFIER_REGISTRY_TX_HASH=${result.txHash}`);
    console.log(`NULLIFIER_REGISTRY_INDEX=${result.index}`);
    console.log(`NULLIFIER_REGISTRY_LOCK=${result.lock}`);
    console.log(`NULLIFIER_REGISTRY_CAPACITY=${result.capacity}`);
    console.log(`NULLIFIER_REGISTRY_TYPE_ARGS=${result.typeArgs}`);
    console.log('NULLIFIER_REGISTRY_NULLIFIERS=');
}

main().catch(err => {
    console.error('Registry bootstrap failed:', err?.message || err);
    process.exit(1);
});
