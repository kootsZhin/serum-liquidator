import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { Config, Market } from "global";
import { refreshReserveInstruction, refreshObligationInstruction, liquidateObligationInstruction, redeemReserveCollateralInstruction } from "../models";
import { findWhere, map } from 'underscore';
import { getTokenInfo } from "../libs/utils";
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';

export const liquidate = async (
    connection: Connection,
    config: Config,
    payer: Keypair,
    liquidityAmount: number | bigint,
    repayTokenSymbol: string,
    withdrawTokenSymbol: string,
    lendingMarket: Market,
    obligation: any,
) => {
    const instructions: TransactionInstruction[] = [];
    const signers: Keypair[] = [];

    const [authority] = await PublicKey.findProgramAddress(
        [new PublicKey(lendingMarket.address).toBuffer()],
        new PublicKey(config.programID)
    );

    const depositReserves = map(obligation.info.deposits, (deposit) => deposit.depositReserve);
    const borrowReserves = map(obligation.info.borrows, (borrow) => borrow.borrowReserve);
    const uniqReserveAddresses = [...new Set<String>(map(depositReserves.concat(borrowReserves), (reserve) => reserve.toString()))];
    uniqReserveAddresses.forEach((reserveAddress) => {
        const reserveInfo = findWhere(lendingMarket!.reserves, {
            address: reserveAddress,
        });
        const oracleInfo = findWhere(config.oracles.assets, {
            asset: reserveInfo!.asset,
        });
        const refreshReserveIx = refreshReserveInstruction(
            new PublicKey(reserveAddress),
            new PublicKey(config.programID),
            new PublicKey(oracleInfo!.priceAddress),
        );
        instructions.push(refreshReserveIx);
    });

    const refreshObligationIx = refreshObligationInstruction(
        obligation.pubkey,
        new PublicKey(config.programID),
        depositReserves,
        borrowReserves,
    );
    instructions.push(refreshObligationIx);

    const repayTokenInfo = getTokenInfo(config, repayTokenSymbol);

    const repayAccount = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(repayTokenInfo.mintAddress), payer.publicKey);

    const repayReserve = findWhere(lendingMarket.reserves, { asset: repayTokenSymbol });
    const withdrawReserve = findWhere(lendingMarket.reserves, { asset: withdrawTokenSymbol });
    const withdrawTokenInfo = getTokenInfo(config, withdrawTokenSymbol);

    const rewardedWithdrawalCollateralAccount = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(withdrawReserve.collateralMintAddress), payer.publicKey);

    const rewardedWithdrawalLiquidityAccount = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(withdrawTokenInfo.mintAddress), payer.publicKey);

    instructions.push(
        liquidateObligationInstruction(
            liquidityAmount,
            new PublicKey(config.programID),
            repayAccount.address,
            rewardedWithdrawalCollateralAccount.address,
            new PublicKey(repayReserve.address),
            new PublicKey(repayReserve.liquidityAddress),
            new PublicKey(withdrawReserve.address),
            new PublicKey(withdrawReserve.collateralSupplyAddress),
            obligation.pubkey,
            new PublicKey(lendingMarket.address),
            authority,
            payer.publicKey
        )
    )

    console.log(`Liquidating ${obligation.pubkey.toString()}`);
    const tx = new Transaction().add(...instructions);
    const blockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash.blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer, ...signers);

    const txHash = await sendAndConfirmRawTransaction(connection, tx.serialize(), { skipPreflight: false });
    console.log(`Transaction completed: ${txHash}\n`);

    // comment this part if you would not want to redeem the collateral right after liquidation
    // note that redeeming could fail when there is not enough liquidity
    // <=========================================== Redeeming Collateral ===========================================>

    const redeemInstructions: TransactionInstruction[] = [];

    const redeemReserveInfo = findWhere(lendingMarket!.reserves, {
        address: withdrawReserve.address,
    });
    const oracleInfo = findWhere(config.oracles.assets, {
        asset: redeemReserveInfo!.asset,
    });
    const refreshReserveIx = refreshReserveInstruction(
        new PublicKey(withdrawReserve.address),
        new PublicKey(config.programID),
        new PublicKey(oracleInfo!.priceAddress),
    );
    redeemInstructions.push(refreshReserveIx);

    const collateralBalance = await connection.getTokenAccountBalance(rewardedWithdrawalCollateralAccount.address);
    redeemInstructions.push(
        redeemReserveCollateralInstruction(
            BigInt(collateralBalance.value.amount),
            new PublicKey(config.programID),
            rewardedWithdrawalCollateralAccount.address,
            rewardedWithdrawalLiquidityAccount.address,
            new PublicKey(withdrawReserve.address),
            new PublicKey(withdrawReserve.collateralMintAddress),
            new PublicKey(withdrawReserve.liquidityAddress),
            new PublicKey(lendingMarket.address),
            authority,
            payer.publicKey
        )
    )

    console.log(`Redeeming ${obligation.pubkey.toString()}`);
    const redeemTx = new Transaction().add(...redeemInstructions);
    const redeemBlockhash = await connection.getLatestBlockhash();
    redeemTx.recentBlockhash = redeemBlockhash.blockhash;
    redeemTx.feePayer = payer.publicKey;
    redeemTx.sign(payer, ...signers);

    const redeemTxHash = await sendAndConfirmRawTransaction(connection, redeemTx.serialize(), { skipPreflight: false });

    console.log(`Transaction completed: ${redeemTxHash}\n`);
}