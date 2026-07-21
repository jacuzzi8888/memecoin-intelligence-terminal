import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "@memecoin/logger";

const log = logger("wallet-history-service");

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6wpFLc7DbLZ4K3e3oV261W";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface WalletTrade {
  signature: string;
  slot: number;
  blockTime: number;
  walletAddress: string;
  tokenMint: string;
  type: "buy" | "sell" | "send";
  tokenAmount: number;
  solAmount: number;
  pricePerToken: number;
  dex: string;
}

export interface WalletPosition {
  tokenMint: string;
  balance: number;
  averageBuyPrice: number;
  totalInvested: number;
  currentValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export class WalletHistoryService {
  private connection: Connection;
  private heliusApiKey: string;

  constructor(rpcUrl: string, heliusApiKey: string) {
    this.connection = new Connection(rpcUrl);
    this.heliusApiKey = heliusApiKey;
    log.info({ rpcUrl, hasApiKey: !!heliusApiKey }, "Wallet history service initialized");
  }

  async getWalletTransactions(walletAddress: string, limit: number = 100): Promise<any[]> {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${this.heliusApiKey}&limit=${limit}&type=SWAP`;

      const response = await fetch(url);
      if (!response.ok) {
        log.error({ status: response.status }, "Failed to fetch wallet transactions");
        return [];
      }

      const transactions = await response.json() as any[];
      log.info({ walletAddress, count: transactions.length }, "Fetched wallet transactions");
      return transactions;
    } catch (error) {
      log.error({ error, walletAddress }, "Error fetching wallet transactions");
      return [];
    }
  }

  parseSwapTransaction(tx: any, walletAddress: string): WalletTrade[] {
    const trades: WalletTrade[] = [];

    try {
      const events = tx.events || {};
      const swaps = events.swaps || [];

      for (const swap of swaps) {
        const nativeInput = swap.nativeInput;
        const nativeOutput = swap.nativeOutput;
        const tokenInputs = swap.tokenInputs || [];
        const tokenOutputs = swap.tokenOutputs || [];

        if (nativeInput && tokenOutputs.length > 0) {
          const tokenOut = tokenOutputs[0];
          const solAmount = nativeInput.amount / 1e9;
          const tokenAmount = tokenOut.amount / Math.pow(10, tokenOut.decimals);

          trades.push({
            signature: tx.signature,
            slot: tx.slot,
            blockTime: tx.timestamp,
            walletAddress,
            tokenMint: tokenOut.mint,
            type: "buy",
            tokenAmount,
            solAmount,
            pricePerToken: solAmount / tokenAmount,
            dex: this.identifyDex(swap),
          });
        }

        if (nativeOutput && tokenInputs.length > 0) {
          const tokenIn = tokenInputs[0];
          const solAmount = nativeOutput.amount / 1e9;
          const tokenAmount = tokenIn.amount / Math.pow(10, tokenIn.decimals);

          trades.push({
            signature: tx.signature,
            slot: tx.slot,
            blockTime: tx.timestamp,
            walletAddress,
            tokenMint: tokenIn.mint,
            type: "sell",
            tokenAmount,
            solAmount,
            pricePerToken: solAmount / tokenAmount,
            dex: this.identifyDex(swap),
          });
        }
      }

      if (swaps.length === 0) {
        const instructions = tx.instructions || [];
        for (const ix of instructions) {
          if (ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked") {
            const info = ix.parsed?.info || {};
            if (info.source === walletAddress || info.authority === walletAddress) {
              const mint = info.mint;
              const amount = parseInt(info.tokenAmount?.amount || "0");
              const decimals = info.tokenAmount?.decimals || 9;

              if (mint && amount > 0) {
                trades.push({
                  signature: tx.signature,
                  slot: tx.slot,
                  blockTime: tx.timestamp,
                  walletAddress,
                  tokenMint: mint,
                  type: "send",
                  tokenAmount: amount / Math.pow(10, decimals),
                  solAmount: 0,
                  pricePerToken: 0,
                  dex: "direct",
                });
              }
            }
          }
        }
      }
    } catch (error) {
      log.error({ error, signature: tx.signature }, "Error parsing swap transaction");
    }

    return trades;
  }

  private identifyDex(swap: any): string {
    if (swap.innerSwaps) {
      for (const inner of swap.innerSwaps) {
        if (inner.programId) {
          if (inner.programId.includes("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")) {
            return "raydium";
          }
          if (inner.programId.includes("JUP")) {
            return "jupiter";
          }
          if (inner.programId.includes("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc")) {
            return "orca";
          }
        }
      }
    }
    return "unknown";
  }

  async ingestWalletHistory(walletAddress: string): Promise<WalletTrade[]> {
    log.info({ walletAddress }, "Starting wallet history ingestion");

    const transactions = await this.getWalletTransactions(walletAddress, 100);
    const allTrades: WalletTrade[] = [];

    for (const tx of transactions) {
      const trades = this.parseSwapTransaction(tx, walletAddress);
      allTrades.push(...trades);
    }

    log.info({ walletAddress, tradeCount: allTrades.length }, "Wallet history ingestion complete");
    return allTrades;
  }

  calculatePositions(trades: WalletTrade[]): WalletPosition[] {
    const positionMap = new Map<string, {
      buys: Array<{ amount: number; price: number }>;
      sells: Array<{ amount: number; price: number }>;
    }>();

    for (const trade of trades) {
      if (!positionMap.has(trade.tokenMint)) {
        positionMap.set(trade.tokenMint, { buys: [], sells: [] });
      }

      const position = positionMap.get(trade.tokenMint)!;
      if (trade.type === "buy") {
        position.buys.push({ amount: trade.tokenAmount, price: trade.pricePerToken });
      } else {
        position.sells.push({ amount: trade.tokenAmount, price: trade.pricePerToken });
      }
    }

    const positions: WalletPosition[] = [];

    for (const [tokenMint, data] of positionMap) {
      const totalBought = data.buys.reduce((sum, b) => sum + b.amount, 0);
      const totalSold = data.sells.reduce((sum, s) => sum + s.amount, 0);
      const currentBalance = totalBought - totalSold;

      if (currentBalance <= 0) continue;

      const totalInvested = data.buys.reduce((sum, b) => sum + (b.amount * b.price), 0);
      const averageBuyPrice = totalInvested / totalBought;

      const totalSoldValue = data.sells.reduce((sum, s) => sum + (s.amount * s.price), 0);
      const realizedPnl = totalSoldValue - (data.sells.reduce((sum, s) => sum + s.amount, 0) * averageBuyPrice);

      positions.push({
        tokenMint,
        balance: currentBalance,
        averageBuyPrice,
        totalInvested,
        currentValue: currentBalance * averageBuyPrice,
        realizedPnl,
        unrealizedPnl: 0,
      });
    }

    return positions;
  }
}
