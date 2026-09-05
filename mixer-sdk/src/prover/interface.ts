import type { V1Groth16Proof, V1Groth16Verifier } from './abi.js';
import type { V1PrivateWitness, V1PublicSignals } from './statement.js';

export interface PrivacyProver extends V1Groth16Verifier {
    readonly scheme: 'groth16-bn254';
    prove(
        publicSignals: V1PublicSignals,
        witness: V1PrivateWitness,
        options?: { readonly signal?: AbortSignal },
    ): Promise<V1Groth16Proof>;
}
