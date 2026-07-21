export interface BlockchainDataProvider {
  getTransaction(signature: string): Promise<unknown>;
  getAccountInfo(address: string): Promise<unknown>;
}

export interface TokenDiscoveryProvider {
  getNewTokens(since: Date): Promise<unknown[]>;
  getTokenInfo(address: string): Promise<unknown>;
}

export interface MarketDataProvider {
  getTokenPrice(address: string): Promise<unknown>;
  getMarketData(address: string): Promise<unknown>;
}

export interface TransactionStreamProvider {
  subscribe(config: unknown): AsyncIterable<unknown>;
}

export interface WalletHistoryProvider {
  getWalletTrades(address: string): Promise<unknown[]>;
  getWalletPositions(address: string): Promise<unknown[]>;
}

export interface SwapQuoteProvider {
  getQuote(params: unknown): Promise<unknown>;
}

export interface SwapExecutionProvider {
  buildSwapTransaction(quote: unknown, wallet: string): Promise<unknown>;
  simulateSwap(transaction: unknown): Promise<unknown>;
}

export class DevBlockchainProvider implements BlockchainDataProvider {
  async getTransaction(_signature: string) { return { status: "confirmed", mock: true }; }
  async getAccountInfo(_address: string) { return { lamports: 0, mock: true }; }
}

export class DevTokenDiscoveryProvider implements TokenDiscoveryProvider {
  async getNewTokens(_since: Date) { return []; }
  async getTokenInfo(_address: string) { return { symbol: "DEV", name: "Dev Token", mock: true }; }
}

export class DevMarketDataProvider implements MarketDataProvider {
  async getTokenPrice(_address: string) { return { price: 0.001, mock: true }; }
  async getMarketData(_address: string) { return { marketCap: 500000, liquidity: 25000, mock: true }; }
}

export class DevSwapQuoteProvider implements SwapQuoteProvider {
  async getQuote(_params: unknown) { return { expectedOutput: "1000", mock: true }; }
}