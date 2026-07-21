export function createDevToken(overrides?: Partial<DevToken>): DevToken {
  return { address: "DevTokenXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", symbol: "DEVTK", name: "Development Token", decimals: 9, ...overrides };
}

export function createDevWallet(overrides?: Partial<DevWallet>): DevWallet {
  return { address: "DevWallet111111111111111111111111111111", classification: "legitimate_trader", ...overrides };
}

export function createDevScore(overrides?: Partial<DevScore>): DevScore {
  return { score: 75, confidence: 0.72, rulesetVersion: "token-signal-v0.1.0", positiveFactors: [], negativeFactors: [], missingFeatures: [], calculatedAt: new Date().toISOString(), ...overrides };
}

export interface DevToken { address: string; symbol: string; name: string; decimals: number; }
export interface DevWallet { address: string; classification: string; }
export interface DevScore { score: number; confidence: number; rulesetVersion: string; positiveFactors: string[]; negativeFactors: string[]; missingFeatures: string[]; calculatedAt: string; }