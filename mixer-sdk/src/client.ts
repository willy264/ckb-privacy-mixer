import { joinMix } from './operations/deposit';
import { withdrawMix } from './operations/withdraw';
import type { JoinMixParams } from './operations/deposit';
import type { DepositNote } from './types/note';

export class MixerClient {
    public async deposit(params: JoinMixParams): Promise<string> {
        return joinMix(params);
    }

    public async withdraw(note: DepositNote): Promise<string> {
        return withdrawMix(note);
    }
}
