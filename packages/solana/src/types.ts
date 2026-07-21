export interface TransactionData {
  signature: string;
  slot: number;
  blockTime: number | null;
  fee: number;
  status: "confirmed" | "failed";
  instructions: TransactionInstruction[];
  tokenBalances: TokenBalance[];
}

export interface TransactionInstruction {
  programId: string;
  accounts: string[];
  data: string;
  parsed?: Record<string, unknown>;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
}

export interface AccountInfo {
  address: string;
  lamports: number;
  owner: string;
  executable: boolean;
  rentEpoch: number;
  data: unknown;
}

export interface ProgramAccount {
  pubkey: string;
  account: AccountInfo;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: string | null;
  logoUri: string | null;
  isVerified: boolean;
}

export interface HolderInfo {
  address: string;
  balance: string;
  decimals: number;
  percentage: number;
}

export interface TokenEvent {
  type: "token_launch" | "pool_created" | "liquidity_added";
  tokenAddress: string;
  poolAddress?: string;
  deployer: string;
  timestamp: number;
  slot: number;
  signature: string;
  initialLiquidityUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface PriceData {
  address: string;
  priceUsd: number;
  timestamp: number;
}

export interface MarketData {
  address: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  volume1hUsd: number;
  holderCount: number;
  priceChange24h: number;
  priceChange1h: number;
  timestamp: number;
}

export interface PricePoint {
  timestamp: number;
  priceUsd: number;
  volumeUsd: number;
}

export interface PoolData {
  address: string;
  baseMint: string;
  quoteMint: string;
  dexProgram: string;
  liquidityUsd: number;
  volume24hUsd: number;
}

export interface StreamConfig {
  accounts?: string[];
  programs?: string[];
  tokenMints?: string[];
}

export interface StreamEvent {
  type: string;
  signature: string;
  slot: number;
  timestamp: number;
  data: unknown;
}

export interface TradeRecord {
  signature: string;
  walletAddress: string;
  tokenAddress: string;
  type: "buy" | "sell";
  amount: string;
  amountSol: string;
  priceUsd: number;
  timestamp: number;
  slot: number;
}

export interface PositionRecord {
  tokenAddress: string;
  balance: string;
  averageBuyPrice: number;
  currentValueUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
}

export interface PnlData {
  totalPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  winRate: number;
  totalTrades: number;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  expectedOutput: string;
  minimumOutput: string;
  priceImpactPct: number;
  routePlan: RoutePlan[];
  expiresAt: number;
}

export interface RoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface SimulationResult {
  success: boolean;
  expectedOutput?: string;
  actualOutput?: string;
  error?: string;
  logs?: string[];
}

export interface ProviderHealth {
  provider: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}
