import { initializeAggron, requiredEnv, bootstrapRegistryCell, waitForTransaction } from './lumos-common';

async function main() {
    initializeAggron();
    const privateKey = requiredEnv('OWNER_PRIVATE_KEY');
    const nullifierTypeCodeHash = requiredEnv('NULLIFIER_TYPE_CODE_HASH');
    const nullifierTypeHashType = requiredEnv('NULLIFIER_TYPE_HASH_TYPE') as 'data' | 'data1' | 'type';
    const typeArgs = '0x'; // default args

    console.log('Bootstrapping registry cell...');
    const result = await bootstrapRegistryCell(privateKey, nullifierTypeCodeHash, nullifierTypeHashType, typeArgs);
    console.log('Registry cell bootstrapped!');
    console.log(`TX Hash: ${result.txHash}`);
    console.log(`Index: ${result.index}`);
    console.log(`Capacity: ${result.capacity}`);

    await waitForTransaction(result.txHash);
    
    console.log('\nAdd these to your .env:');
    console.log(`NULLIFIER_REGISTRY_TX_HASH=${result.txHash}`);
    console.log(`NULLIFIER_REGISTRY_INDEX=${result.index}`);
    console.log(`NULLIFIER_REGISTRY_CAPACITY=${result.capacity}`);
    console.log(`NULLIFIER_REGISTRY_TYPE_ARGS=${result.typeArgs}`);
}

main().catch(console.error);
