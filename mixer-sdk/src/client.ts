import { joinMix } from './operations/deposit';
import { withdrawMix } from './operations/withdraw';
import type { JoinMixParams } from './operations/deposit';
import type { DepositNote } from './types/note';
import type {
    LiveWithdrawalBuildParams,
    LiveWithdrawalExecuteParams,
} from './types/withdrawal';

export class MixerClient {
    public async deposit(params: JoinMixParams): Promise<string> {
        return joinMix(params);
    }

    public async withdraw(
        note: DepositNote,
        params?: Omit<LiveWithdrawalBuildParams, 'note'> | LiveWithdrawalExecuteParams,
    ): Promise<string> {
        return withdrawMix(note, params);
    }
}
