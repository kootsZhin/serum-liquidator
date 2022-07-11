import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { calculateRefreshedObligation } from "./libs/refreshObligation";
import { getObligation, getReserves } from "./libs/utils";
import { getTokensOracleData } from "./libs/pyth";
import { liquidate } from "./libs/liquidate";
import { readSecret } from "./utils";

const APP = "devnet";
const REST_API_URL = "https://solana-lending-frontend.vercel.app/api/markets";

async function runLiquidator() {
    const config = await (await fetch(REST_API_URL)).json();

    const connection = new Connection(clusterApiUrl(APP), "confirmed");
    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readSecret("payer"))));

    console.log(`
    app: ${APP}
    clusterUrl: ${clusterApiUrl(APP)}
    wallet: ${payer.publicKey.toBase58()}
  `);

    for (let epoch = 0; ; epoch += 1) {
        for (const market of config.markets) {
            const tokensOracle = await getTokensOracleData(connection, config, market.reserves);
            const allObligation = await getObligation(connection, config, market.address);
            const allReserves = await getReserves(connection, config, market.address);

            for (let obligation of allObligation) {
                try {
                    while (obligation) {
                        const {
                            depositedValue,
                            borrowedValue,
                            allowedBorrowValue,
                            unhealthyBorrowValue,
                            deposits,
                            borrows,
                            utilizationRatio,
                        } = calculateRefreshedObligation(
                            obligation.info,
                            allReserves,
                            tokensOracle,
                        );

                        // Do nothing if obligation is healthy
                        if (borrowedValue.isLessThanOrEqualTo(unhealthyBorrowValue)) {
                            console.log(`Obligation ${obligation.pubkey.toString()} is healthy`);
                            break;
                        }

                        // select repay token that has the highest market value
                        let selectedBorrow;
                        borrows.forEach((borrow) => {
                            if (!selectedBorrow || borrow.marketValue.gt(selectedBorrow.marketValue)) {
                                selectedBorrow = borrow;
                            }
                        });

                        // select the withdrawal collateral token with the highest market value
                        let selectedDeposit;
                        deposits.forEach((deposit) => {
                            if (!selectedDeposit || deposit.marketValue.gt(selectedDeposit.marketValue)) {
                                selectedDeposit = deposit;
                            }
                        });

                        if (!selectedBorrow || !selectedDeposit) {
                            // skip toxic obligations caused by toxic oracle data
                            break;
                        }

                        console.log(`Obligation ${obligation.pubkey.toString()} is underwater
                            owner: ${obligation.info.owner.toString()}
                            borrowedValue: ${borrowedValue.toString()}
                            depositedValue: ${depositedValue.toString()}
                            allowedBorrowValue: ${allowedBorrowValue.toString()}
                            unhealthyBorrowValue: ${unhealthyBorrowValue.toString()}
                            market address: ${market.address}`);

                        const liquidityAccount = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(selectedBorrow.mintAddress), payer.publicKey);
                        const balanceBase = BigInt((await connection.getTokenAccountBalance(liquidityAccount.address)).value.amount.toString());

                        if (balanceBase === BigInt(0)) {
                            console.log(`insufficient ${selectedBorrow.symbol} to liquidate obligation ${obligation.pubkey.toString()} in market: ${market.address}`);
                            break;
                        } else if (balanceBase < BigInt(0)) {
                            console.log(`failed to get wallet balance for ${selectedBorrow.symbol} to liquidate obligation ${obligation.pubkey.toString()} in market: ${market.address}. 
                                    Potentially network error or token account does not exist in wallet`);
                            break;
                        }

                        await liquidate(
                            connection,
                            config,
                            payer,
                            balanceBase,
                            selectedBorrow.symbol,
                            selectedDeposit.symbol,
                            market,
                            obligation,
                        )
                    }
                } catch (err) {
                    console.error(`error liquidating ${obligation!.pubkey.toString()}: `, err);
                    continue;
                }
            }
        }
    }
}
runLiquidator();