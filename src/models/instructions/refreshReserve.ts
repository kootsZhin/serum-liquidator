import { PublicKey, SYSVAR_CLOCK_PUBKEY, TransactionInstruction } from '@solana/web3.js';
import { struct, u8 } from '@solana/buffer-layout';
import { LendingInstruction } from './instruction';

interface Data {
    instruction: number;
}

const DataLayout = struct<Data>([u8('instruction')]);

export const refreshReserveInstruction = (reserve: PublicKey, lendginProgramID: PublicKey, oracle: PublicKey): TransactionInstruction => {
    const data = Buffer.alloc(DataLayout.span);
    DataLayout.encode({ instruction: LendingInstruction.RefreshReserve }, data);

    const keys = [
        { pubkey: reserve, isSigner: false, isWritable: true },
        { pubkey: oracle, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ];

    return new TransactionInstruction({
        keys,
        programId: lendginProgramID,
        data,
    });
};
