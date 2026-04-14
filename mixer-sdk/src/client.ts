import { joinMix } from './operations/deposit';
import type { JoinMixParams } from './operations/deposit';

export class MixerClient {
    public async deposit(params: JoinMixParams): Promise<string> {
        return joinMix(params);
    }
}
