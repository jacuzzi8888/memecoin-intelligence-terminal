import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "@memecoin/logger";
import { fetchHelius } from "./helius-rate-limit.js";

const log = logger("wallet-history-service");

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6wpFLc7DbLZ4K3e3oV261W";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const WALLET_HISTORY_TIMEOUT_MS = 20_000;

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WALLET_HISTORY_TIMEOUT_MS);

    try {
      const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${this.heliusApiKey}&limit=${limit}&type=SWAP`;

      const response = await fetchHelius(url, { signal: controller.signal });
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
    } finally {
      clearTimeout(timeout);
    }
  }

  parseSwapTransaction(tx: any, walletAddress: string): WalletTrade[] {
    const trades: WalletTrade[] = [];

    try {
      const events = tx.events || {};
      const swaps = Array.isArray(events.swaps)
        ? events.swaps
        : events.swap
          ? [events.swap]
          : [];

      for (const swap of swaps) {
        const nativeInput = swap.nativeInput;
        const nativeOutput = swap.nativeOutput;
        const tokenInputs = swap.tokenInputs || [];
        const tokenOutputs = swap.tokenOutputs || [];

        if (nativeInput && tokenOutputs.length > 0) {
          const tokenOut = tokenOutputs[0];
          const rawTokenAmount = tokenOut.rawTokenAmount;
          const solAmount = Number(nativeInput.amount) / 1e9;
          const tokenAmount = Number(rawTokenAmount?.tokenAmount ?? tokenOut.amount ?? 0) / Math.pow(10, rawTokenAmount?.decimals ?? tokenOut.decimals ?? 0);

          if (!tokenOut.mint || tokenAmount <= 0) continue;

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
          const rawTokenAmount = tokenIn.rawTokenAmount;
          const solAmount = Number(nativeOutput.amount) / 1e9;
          const tokenAmount = Number(rawTokenAmount?.tokenAmount ?? tokenIn.amount ?? 0) / Math.pow(10, rawTokenAmount?.decimals ?? tokenIn.decimals ?? 0);

          if (!tokenIn.mint || tokenAmount <= 0) continue;

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
        const transferTrades = this.parseTransferBasedSwap(tx, walletAddress);
        if (transferTrades.length > 0) {
          trades.push(...transferTrades);
          return trades;
        }

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

  private parseTransferBasedSwap(tx: any, walletAddress: string): WalletTrade[] {
    const tokenTransfers = Array.isArray(tx.tokenTransfers) ? tx.tokenTransfers : [];
    if (tokenTransfers.length === 0) return [];

    const solInputs = tokenTransfers
      .filter((transfer: any) => transfer.mint === SOL_MINT && transfer.fromUserAccount === walletAddress)
      .reduce((sum: number, transfer: any) => sum + Number(transfer.tokenAmount ?? 0), 0);
    const solOutputs = tokenTransfers
      .filter((transfer: any) => transfer.mint === SOL_MINT && transfer.toUserAccount === walletAddress)
      .reduce((sum: number, transfer: any) => sum + Number(transfer.tokenAmount ?? 0), 0);

    const boughtTokens = tokenTransfers.filter((transfer: any) =>
      transfer.mint && transfer.mint !== SOL_MINT && transfer.toUserAccount === walletAddress && Number(transfer.tokenAmount ?? 0) > 0,
    );
    const soldTokens = tokenTransfers.filter((transfer: any) =>
      transfer.mint && transfer.mint !== SOL_MINT && transfer.fromUserAccount === walletAddress && Number(transfer.tokenAmount ?? 0) > 0,
    );

    const trades: WalletTrade[] = [];
    if (solInputs > 0 && boughtTokens.length > 0) {
      const totalTokenAmount = boughtTokens.reduce((sum: number, transfer: any) => sum + Number(transfer.tokenAmount ?? 0), 0);
      for (const transfer of boughtTokens) {
        const tokenAmount = Number(transfer.tokenAmount ?? 0);
        const solAmount = totalTokenAmount > 0 ? solInputs * (tokenAmount / totalTokenAmount) : solInputs;
        trades.push({
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.timestamp,
          walletAddress,
          tokenMint: transfer.mint,
          type: "buy",
          tokenAmount,
          solAmount,
          pricePerToken: tokenAmount > 0 ? solAmount / tokenAmount : 0,
          dex: this.identifyDexFromSource(tx.source),
        });
      }
    }

    if (solOutputs > 0 && soldTokens.length > 0) {
      const totalTokenAmount = soldTokens.reduce((sum: number, transfer: any) => sum + Number(transfer.tokenAmount ?? 0), 0);
      for (const transfer of soldTokens) {
        const tokenAmount = Number(transfer.tokenAmount ?? 0);
        const solAmount = totalTokenAmount > 0 ? solOutputs * (tokenAmount / totalTokenAmount) : solOutputs;
        trades.push({
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.timestamp,
          walletAddress,
          tokenMint: transfer.mint,
          type: "sell",
          tokenAmount,
          solAmount,
          pricePerToken: tokenAmount > 0 ? solAmount / tokenAmount : 0,
          dex: this.identifyDexFromSource(tx.source),
        });
      }
    }

    return trades;
  }

  private identifyDexFromSource(source: unknown) {
    const normalized = typeof source === "string" ? source.toLowerCase() : "";
    if (normalized.includes("pump")) return "pump";
    if (normalized.includes("jupiter")) return "jupiter";
    if (normalized.includes("raydium")) return "raydium";
    if (normalized.includes("orca")) return "orca";
    return "unknown";
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
