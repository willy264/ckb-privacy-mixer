import { joinMix } from './operations/deposit.js';
import { something } from './operations/deposit.js'
import { withdrawMix } from './operations/withdraw.js';
import type { JoinMixParams } from './operations/deposit.js';
import type { DepositResult } from './core/session.js';
import type { DepositNote } from './types/note.js';
import type {
    LiveWithdrawalBuildParams,
    LiveWithdrawalExecuteParams,
} from './types/withdrawal.js';

export class MixerClient {
    public async deposit(params: JoinMixParams): Promise<DepositResult> {
        return joinMix(params);
    }

    public async withdraw(
        note: DepositNote,
        params?: Omit<LiveWithdrawalBuildParams, 'note'> | LiveWithdrawalExecuteParams,
    ): Promise<string> {
        return withdrawMix(note, params);
    }
}
