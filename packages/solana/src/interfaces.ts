import type {
  TransactionData,
  AccountInfo,
  ProgramAccount,
  TokenInfo,
  HolderInfo,
  TokenEvent,
  PriceData,
  MarketData,
  PricePoint,
  PoolData,
  StreamConfig,
  StreamEvent,
  TradeRecord,
  PositionRecord,
  PnlData,
  QuoteParams,
  SwapQuote,
  SimulationResult,
  ProviderHealth,
} from "./types.js";

export interface IBlockchainDataProvider {
  readonly name: string;
  getTransaction(signature: string): Promise<TransactionData | null>;
  getAccountInfo(address: string): Promise<AccountInfo | null>;
  getMultipleAccounts(addresses: string[]): Promise<(AccountInfo | null)[]>;
  getProgramAccounts(programId: string, filters?: { memcmp?: { offset: number; bytes: string } }[]): Promise<ProgramAccount[]>;
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  health(): Promise<ProviderHealth>;
}

export interface ITokenDiscoveryProvider {
  readonly name: string;
  getNewTokens(since: Date): Promise<TokenEvent[]>;
  getTokenInfo(address: string): Promise<TokenInfo | null>;
  getTokenHolders(address: string, limit?: number): Promise<HolderInfo[]>;
  health(): Promise<ProviderHealth>;
}

export interface IMarketDataProvider {
  readonly name: string;
  getTokenPrice(address: string): Promise<PriceData | null>;
  getMarketData(address: string): Promise<MarketData | null>;
  getHistoricalPrices(address: string, start: Date, end: Date): Promise<PricePoint[]>;
  getPoolsForToken(address: string): Promise<PoolData[]>;
  health(): Promise<ProviderHealth>;
}

export interface ITransactionStreamProvider {
  readonly name: string;
  subscribe(config: StreamConfig): AsyncIterable<StreamEvent>;
  unsubscribe(subscriptionId: string): Promise<void>;
  isConnected(): boolean;
  health(): Promise<ProviderHealth>;
}

export interface IWalletHistoryProvider {
  readonly name: string;
  getWalletTrades(address: string, options?: { limit?: number; before?: string }): Promise<TradeRecord[]>;
  getWalletPositions(address: string): Promise<PositionRecord[]>;
  getWalletPnl(address: string, range?: { start: Date; end: Date }): Promise<PnlData>;
  health(): Promise<ProviderHealth>;
}

export interface ISwapQuoteProvider {
  readonly name: string;
  getQuote(params: QuoteParams): Promise<SwapQuote | null>;
  getQuotes(params: QuoteParams): Promise<SwapQuote[]>;
  health(): Promise<ProviderHealth>;
}

export interface ISwapExecutionProvider {
  readonly name: string;
  buildSwapTransaction(quote: SwapQuote, wallet: string): Promise<unknown>;
  simulateSwap(transaction: unknown): Promise<SimulationResult>;
  health(): Promise<ProviderHealth>;
}

export interface IProviderRegistry {
  blockchain: IBlockchainDataProvider;
  tokenDiscovery: ITokenDiscoveryProvider;
  marketData: IMarketDataProvider;
  transactionStream: ITransactionStreamProvider;
  walletHistory: IWalletHistoryProvider;
  swapQuote: ISwapQuoteProvider;
  swapExecution: ISwapExecutionProvider;
}
