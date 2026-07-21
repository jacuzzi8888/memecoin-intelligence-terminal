# Data Provider Strategy

## Provider Abstraction

All external data sources are accessed through provider interfaces. No provider-specific code exists outside of provider implementations.

## Provider Interfaces

```typescript
// Blockchain data (transactions, accounts, programs)
interface BlockchainDataProvider {
  getTransaction(signature: string): Promise<TransactionData>;
  getAccountInfo(address: string): Promise<AccountInfo>;
  getMultipleAccounts(addresses: string[]): Promise<AccountInfo[]>;
  getProgramAccounts(programId: string, filters?: Filter[]): Promise<ProgramAccount[]>;
}

// Token discovery (new tokens, launches)
interface TokenDiscoveryProvider {
  getNewTokens(since: Date): Promise<TokenEvent[]>;
  getTokenInfo(address: string): Promise<TokenInfo>;
  getTokenHolders(address: string, limit?: number): Promise<HolderInfo[]>;
}

// Market data (prices, volumes, liquidity)
interface MarketDataProvider {
  getTokenPrice(address: string): Promise<PriceData>;
  getMarketData(address: string): Promise<MarketData>;
  getHistoricalPrices(address: string, range: PriceRange): Promise<PricePoint[]>;
  getPoolsForToken(address: string): Promise<PoolData[]>;
}

// Transaction streaming (real-time events)
interface TransactionStreamProvider {
  subscribe(config: StreamConfig): AsyncIterable<StreamEvent>;
  unsubscribe(subscriptionId: string): Promise<void>;
}

// Wallet history (trades, positions, PnL)
interface WalletHistoryProvider {
  getWalletTrades(address: string, options?: QueryOptions): Promise<TradeRecord[]>;
  getWalletPositions(address: string): Promise<PositionRecord[]>;
  getWalletPnl(address: string, range?: DateRange): Promise<PnlData>;
}

// Swap quotes (Jupiter, Raydium)
interface SwapQuoteProvider {
  getQuote(params: QuoteParams): Promise<SwapQuote>;
  getQuotes(params: QuoteParams): Promise<SwapQuote[]>;
}

// Swap execution
interface SwapExecutionProvider {
  buildSwapTransaction(quote: SwapQuote, wallet: string): Promise<Transaction>;
  simulateSwap(transaction: Transaction): Promise<SimulationResult>;
}

// Notifications
interface NotificationProvider {
  send(params: NotificationParams): Promise<DeliveryResult>;
  validate(): Promise<boolean>;
}
```

## Provider Implementations

### Development/Mock (Current Phase)
All interfaces have development implementations that:
- Return realistic sample data
- Support deterministic outputs for testing
- Log all operations for debugging
- Do not require API keys
- Work offline

### Production Implementations (Future)

| Interface | Provider | Status |
|-----------|----------|--------|
| BlockchainDataProvider | Helius, Solana RPC | Planned |
| TokenDiscoveryProvider | Helius, Birdeye | Planned |
| MarketDataProvider | Birdeye, DexScreener | Planned |
| TransactionStreamProvider | Helius, Yellowstone gRPC | Planned |
| WalletHistoryProvider | Helius, Birdeye | Planned |
| SwapQuoteProvider | Jupiter V6 | Planned |
| SwapExecutionProvider | Jupiter V6 | Planned |
| NotificationProvider | Telegram, Discord | Planned |

## Provider Selection

Providers are selected based on:
1. **Environment**: Development uses mock providers; production uses real providers
2. **Feature flags**: `ENABLE_PAID_PROVIDERS` gates real provider usage
3. **Fallback chain**: If primary provider fails, fallback to secondary
4. **Rate limits**: Providers track remaining quota and throttle accordingly

## Error Handling

All provider calls:
- Return typed errors with provider context
- Include retry-after headers when rate-limited
- Support circuit breaking for sustained failures
- Log all failures with structured context
