import * as fs from 'fs';
import * as path from 'path';
import { generateMixerInput } from '../mixer-sdk/src/utils/snark.js';
import { buildPoseidon } from 'circomlibjs';

async function main() {
    console.log('Generating SNARK input...');
    
    const poseidon = await buildPoseidon();
    
    // Mock data for the proof
    const blindingFactor = "123456789";
    const sessionId = "12345";
    
    // Create some leaves for the tree
    const leafRes = poseidon([blindingFactor, sessionId]);
    const leaf = poseidon.F.toString(leafRes);
    
    const leaves = [
        leaf,
        "111",
        "222",
        "333"
    ];
    
    const input = await generateMixerInput(blindingFactor, sessionId, leaves, 0);
    
    const inputPath = path.resolve('circuits/input.json');
    fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
    console.log(`Input written to ${inputPath}`);
    
    console.log('To generate proof, run:');
    console.log('npx snarkjs groth16 fullprove circuits/input.json circuits/mixer_js/mixer.wasm circuits/mixer_final.zkey circuits/proof.json circuits/public.json');
}

main().catch(console.error);
