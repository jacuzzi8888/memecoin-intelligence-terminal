import type {
  TokenEvent,
  TokenInfo,
  HolderInfo,
  TradeRecord,
  PositionRecord,
  PnlData,
  ProviderHealth,
} from "../types.js";
import type { ITokenDiscoveryProvider, IWalletHistoryProvider } from "../interfaces.js";
import { logger } from "@memecoin/logger";

const log = logger("helius-provider");

interface HeliusConfig {
  apiKey: string;
  baseUrl?: string;
}

export class HeliusProvider implements ITokenDiscoveryProvider, IWalletHistoryProvider {
  readonly name = "helius";
  private apiKey: string;
  private baseUrl: string;
  private rpcUrl: string;

  constructor(config: HeliusConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://api.helius.xyz/v0";
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
    log.info("Helius provider initialized");
  }

  async getNewTokens(since: Date): Promise<TokenEvent[]> {
    try {
      const url = `${this.baseUrl}/tokens/new?api-key=${this.apiKey}&since=${Math.floor(since.getTime() / 1000)}`;
      const response = await fetch(url);
      if (!response.ok) {
        log.error({ status: response.status }, "Helius getNewTokens failed");
        return [];
      }

      const data = (await response.json()) as any[];
      return data.map((item) => ({
        type: "token_launch" as const,
        tokenAddress: item.tokenAccount || item.mint || "",
        deployer: item.payer || item.owner || "",
        timestamp: item.timestamp || Math.floor(Date.now() / 1000),
        slot: item.slot || 0,
        signature: item.signature || "",
        metadata: item,
      }));
    } catch (err) {
      log.error({ error: err }, "Failed to get new tokens from Helius");
      return [];
    }
  }

  async getTokenInfo(address: string): Promise<TokenInfo | null> {
    try {
      const url = `${this.baseUrl}/token-metadata?api-key=${this.apiKey}&mintAccounts=${address}`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = (await response.json()) as any[];
      const token = data[0];
      if (!token) return null;

      const meta = token.onChainInfo?.tokenMetadata || token.metadata || {};
      return {
        address,
        symbol: meta.symbol || "UNKNOWN",
        name: meta.name || "Unknown Token",
        decimals: token.decimals || token.onChainInfo?.decimals || 9,
        totalSupply: meta.supply || null,
        logoUri: meta.image || meta.logoURI || null,
        isVerified: meta.isVerified || false,
      };
    } catch (err) {
      log.error({ error: err, address }, "Failed to get token info from Helius");
      return null;
    }
  }

  async getTokenHolders(address: string, limit?: number): Promise<HolderInfo[]> {
    try {
      const url = `${this.baseUrl}/token-holders?api-key=${this.apiKey}&mint=${address}&limit=${limit || 100}`;
      const response = await fetch(url);
      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const holders = data.token_holders || data || [];
      return holders.map((h: any) => ({
        address: h.address || h.owner,
        balance: h.balance || "0",
        decimals: h.decimals || 9,
        percentage: h.percentage || 0,
      }));
    } catch (err) {
      log.error({ error: err, address }, "Failed to get token holders from Helius");
      return [];
    }
  }

  async getWalletTrades(
    address: string,
    options?: { limit?: number; before?: string },
  ): Promise<TradeRecord[]> {
    try {
      const params = new URLSearchParams({
        "api-key": this.apiKey,
        type: "SWAP",
      });
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.before) params.set("before", options.before);

      const url = `${this.baseUrl}/addresses/${address}/transactions?${params}`;
      const response = await fetch(url);
      if (!response.ok) return [];

      const transactions = (await response.json()) as any[];
      const trades: TradeRecord[] = [];

      for (const tx of transactions) {
        const events = tx.events || [];
        for (const event of events) {
          if (event.type === "SWAP") {
            const swap = event.swap;
            if (swap) {
              trades.push({
                signature: tx.signature,
                walletAddress: address,
                tokenAddress: swap.tokenSold?.mint || swap.tokenBought?.mint || "",
                type: "buy",
                amount: swap.tokenBought?.amount || "0",
                amountSol: swap.nativeInput?.amount
                  ? String(Number(swap.nativeInput.amount) / 1e9)
                  : "0",
                priceUsd: 0,
                timestamp: tx.timestamp || Math.floor(Date.now() / 1000),
                slot: tx.slot || 0,
              });
            }
          }
        }
      }

      return trades;
    } catch (err) {
      log.error({ error: err, address }, "Failed to get wallet trades from Helius");
      return [];
    }
  }

  async getWalletPositions(address: string): Promise<PositionRecord[]> {
    try {
      const url = `${this.baseUrl}/addresses/${address}/balances?api-key=${this.apiKey}`;
      const response = await fetch(url);
      if (!response.ok) return [];

      const data = (await response.json()) as any;
      const tokens = data.nativeBalances || data.tokenBalances || [];

      return tokens
        .filter((t: any) => t.mint || t.tokenAddress)
        .map((t: any) => ({
          tokenAddress: t.mint || t.tokenAddress || "",
          balance: t.balance || "0",
          averageBuyPrice: 0,
          currentValueUsd: (t.priceInfo?.totalPrice || 0) * 1,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: 0,
        }));
    } catch (err) {
      log.error({ error: err, address }, "Failed to get wallet positions from Helius");
      return [];
    }
  }

  async getWalletPnl(
    address: string,
    _range?: { start: Date; end: Date },
  ): Promise<PnlData> {
    const positions = await this.getWalletPositions(address);
    const trades = await this.getWalletTrades(address, { limit: 1000 });

    const totalRealized = positions.reduce((sum, p) => sum + p.realizedPnlUsd, 0);
    const totalUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0);
    const profitableTrades = trades.filter(() => false);
    const winRate = trades.length > 0 ? profitableTrades.length / trades.length : 0;

    return {
      totalPnlUsd: totalRealized + totalUnrealized,
      realizedPnlUsd: totalRealized,
      unrealizedPnlUsd: totalUnrealized,
      winRate,
      totalTrades: trades.length,
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      const response = await fetch(
        `${this.baseUrl}/health?api-key=${this.apiKey}`,
      );
      const healthy = response.ok;
      return {
        provider: this.name,
        healthy,
        latencyMs: Date.now() - start,
        error: healthy ? undefined : "Helius API unhealthy",
      };
    } catch (err) {
      return {
        provider: this.name,
        healthy: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  getRpcUrl(): string {
    return this.rpcUrl;
  }
}
