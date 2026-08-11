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
import { fetchHelius } from "./helius-rate-limit.js";

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
    if (process.env.HELIUS_TOKEN_PROGRAM_DISCOVERY_ENABLED !== "true") {
      return [];
    }

    try {
      const response = await fetchHelius(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "new-tokens",
          method: "getSignaturesForAddress",
          params: [
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            { limit: 50, until: undefined },
          ],
        }),
      });

      if (!response.ok) {
        log.error({ status: response.status }, "Helius getSignaturesForAddress failed");
        return [];
      }

      const data = (await response.json()) as any;
      const signatures = data.result || [];
      const events: TokenEvent[] = [];

      for (const sig of signatures.slice(0, 10)) {
        if (sig.blockTime && sig.blockTime * 1000 < since.getTime()) continue;

        try {
          const txResponse = await fetchHelius(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "tx",
              method: "getTransaction",
              params: [
                sig.signature,
                { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
              ],
            }),
          });

          const txData = (await txResponse.json()) as any;
          const tx = txData.result;
          if (!tx || tx.meta?.err) continue;

          const instructions = tx.transaction?.message?.instructions || [];
          for (const ix of instructions) {
            if (ix.program !== "spl-token" && ix.program !== "spl-token-2022") continue;
            if (ix.parsed?.type !== "initializeMint" && ix.parsed?.type !== "initializeMint2") continue;

            const mint = ix.parsed?.info?.mint;
            const decimals = ix.parsed?.info?.decimals;
            const mintAuthority = ix.parsed?.info?.mintAuthority;

            if (mint) {
              events.push({
                type: "token_launch",
                tokenAddress: mint,
                deployer: mintAuthority || "",
                timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
                slot: tx.slot || 0,
                signature: sig.signature,
                metadata: { decimals, source: "helius" },
              });
            }
          }
        } catch (err) {
          log.debug({ error: err, signature: sig.signature }, "Failed to parse transaction");
        }
      }

      return events;
    } catch (err) {
      log.error({ error: err }, "Failed to get new tokens from Helius");
      return [];
    }
  }

  async getTokenInfo(address: string): Promise<TokenInfo | null> {
    try {
      const url = `${this.baseUrl}/token-metadata?api-key=${this.apiKey}&mintAccounts=${address}`;
      const response = await fetchHelius(url);
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
      const requestedLimit = Math.max(1, Math.min(limit ?? 20, 20));
      const holderRpcUrl = process.env.SOLANA_HOLDER_RPC_URL
        || "https://public.rpc.solanavibestation.com";
      const holderDetailsRpcUrl = process.env.SOLANA_HOLDER_DETAILS_RPC_URL
        || "https://api.mainnet-beta.solana.com";
      const largestAccountsResponse = await fetchHelius(holderRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "largest-token-accounts",
          method: "getTokenLargestAccounts",
          params: [address],
        }),
      });
      if (!largestAccountsResponse.ok) {
        throw new Error(`Holder ranking RPC unavailable (${largestAccountsResponse.status})`);
      }

      const largestAccountsPayload = (await largestAccountsResponse.json()) as {
        error?: { code?: number; message?: string };
        result?: { value?: Array<{ address?: string; amount?: string; decimals?: number }> };
      };
      if (largestAccountsPayload.error) {
        throw new Error(`Holder ranking RPC error: ${largestAccountsPayload.error.message ?? largestAccountsPayload.error.code ?? "unknown"}`);
      }
      const largestAccounts = (largestAccountsPayload.result?.value ?? [])
        .filter((account): account is { address: string; amount: string; decimals?: number } => Boolean(account.address && account.amount))
        .slice(0, requestedLimit);
      if (largestAccounts.length === 0) return [];

      // Use one JSON-RPC batch so public endpoints only receive one details request.
      const detailsResponse = await fetchHelius(holderDetailsRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            jsonrpc: "2.0",
            id: "token-supply",
            method: "getTokenSupply",
            params: [address],
          },
          {
            jsonrpc: "2.0",
            id: "largest-token-account-owners",
            method: "getMultipleAccounts",
            params: [
              largestAccounts.map((account) => account.address),
              { encoding: "jsonParsed" },
            ],
          },
        ]),
      });
      if (!detailsResponse.ok) {
        throw new Error(`Holder details RPC unavailable (${detailsResponse.status})`);
      }
      const detailsPayload = (await detailsResponse.json()) as Array<{
        id?: string;
        error?: { code?: number; message?: string };
        result?: {
          value?: { amount?: string; decimals?: number }
            | Array<{ data?: { parsed?: { info?: { owner?: string } } } } | null>;
        };
      }>;
      if (!Array.isArray(detailsPayload)) {
        throw new Error("Holder details RPC returned an invalid batch response");
      }
      const supplyPayload = detailsPayload.find((item) => item.id === "token-supply");
      const ownersPayload = detailsPayload.find((item) => item.id === "largest-token-account-owners");
      const rpcError = supplyPayload?.error ?? ownersPayload?.error;
      if (rpcError) {
        throw new Error(`Holder details RPC error: ${rpcError.message ?? rpcError.code ?? "unknown"}`);
      }
      const supplyValue = supplyPayload?.result?.value;
      const ownerValues = ownersPayload?.result?.value;
      if (!supplyValue || Array.isArray(supplyValue) || !Array.isArray(ownerValues)) {
        throw new Error("Holder details RPC omitted supply or owner data");
      }
      const decimals = supplyValue.decimals ?? 9;
      const supply = Number(supplyValue.amount ?? 0);
      const balancesByOwner = new Map<string, number>();

      for (const [index, account] of largestAccounts.entries()) {
        const owner = ownerValues[index]?.data?.parsed?.info?.owner;
        if (!owner) continue;
        const amount = Number(account.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        balancesByOwner.set(owner, (balancesByOwner.get(owner) ?? 0) + amount);
      }

      return [...balancesByOwner.entries()]
        .sort(([, left], [, right]) => right - left)
        .slice(0, requestedLimit)
        .map(([owner, balance]) => ({
          address: owner,
          balance: Math.round(balance).toString(),
          decimals,
          percentage: supply > 0 ? (balance / supply) * 100 : 0,
        }));
    } catch (err) {
      log.error({
        error: err instanceof Error ? err.message : String(err),
        address,
      }, "Failed to get token holders");
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
      const response = await fetchHelius(url);
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
      const response = await fetchHelius(url);
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
      const response = await fetchHelius(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "health",
          method: "getSlot",
          params: [],
        }),
      });
      const data = (await response.json()) as any;
      const healthy = !!data.result;
      return {
        provider: this.name,
        healthy,
        latencyMs: Date.now() - start,
        error: healthy ? undefined : "Helius RPC returned no result",
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
