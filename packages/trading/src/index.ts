export interface TradingService {
  getQuote(params: QuoteParams): Promise<Quote>;
  simulateSwap(quote: Quote): Promise<SimulationResult>;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}

export interface Quote {
  inputAmount: string;
  expectedOutput: string;
  minimumOutput: string;
  priceImpactPct: number;
  expiresAt: Date;
}

export interface SimulationResult {
  success: boolean;
  expectedOutput?: string;
  error?: string;
}

export class DevTradingService implements TradingService {
  async getQuote(_params: QuoteParams): Promise<Quote> {
    return { inputAmount: "1000000", expectedOutput: "500000", minimumOutput: "475000", priceImpactPct: 0.5, expiresAt: new Date(Date.now() + 30000) };
  }
  async simulateSwap(_quote: Quote): Promise<SimulationResult> {
    return { success: true, expectedOutput: "498000" };
  }
}