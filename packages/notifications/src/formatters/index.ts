export interface AlertData {
  id: string;
  tokenSymbol: string;
  tokenAddress: string;
  priority: "critical" | "high" | "medium" | "low" | "info";
  signalScore: number;
  confidence: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volume1hUsd?: number;
  holderCount?: number;
  qualifiedWalletCount?: number;
  tokenAgeMinutes?: number;
  positiveFactors: string[];
  negativeFactors: string[];
  webDeepLink: string;
  telegramDeepLink?: string;
  triggeredAt: string;
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

function formatUsd(value?: number): string {
  if (value === undefined) return "N/A";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatNumber(value?: number): string {
  if (value === undefined) return "N/A";
  return value.toLocaleString();
}

function priorityEmoji(priority: string): string {
  switch (priority) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "🟢";
    default: return "⚪";
  }
}

export function formatTelegramAlert(alert: AlertData): string {
  const lines: string[] = [];

  lines.push(`${priorityEmoji(alert.priority)} *NEW SIGNAL \\[${alert.priority.toUpperCase()}\\]*`);
  lines.push("");
  lines.push(`📊 *Token:* \\$${escapeMarkdownV2(alert.tokenSymbol)}`);
  lines.push(`📍 *Address:* \`${alert.tokenAddress.slice(0, 8)}...${alert.tokenAddress.slice(-6)}\``);
  lines.push("");

  if (alert.marketCapUsd !== undefined) {
    lines.push(`💰 *Market Cap:* ${formatUsd(alert.marketCapUsd)}`);
  }
  if (alert.liquidityUsd !== undefined) {
    lines.push(`💧 *Liquidity:* ${formatUsd(alert.liquidityUsd)}`);
  }
  if (alert.volume1hUsd !== undefined) {
    lines.push(`📈 *Volume \\(1h\\):* ${formatUsd(alert.volume1hUsd)}`);
  }
  if (alert.holderCount !== undefined) {
    lines.push(`👥 *Holders:* ${formatNumber(alert.holderCount)}`);
  }
  if (alert.qualifiedWalletCount !== undefined) {
    lines.push(`🏆 *Qualified Wallets:* ${alert.qualifiedWalletCount}`);
  }
  if (alert.tokenAgeMinutes !== undefined) {
    lines.push(`🕐 *Age:* ${alert.tokenAgeMinutes} min`);
  }

  lines.push("");
  lines.push(`⭐ *Signal Score:* ${alert.signalScore}/100`);
  lines.push(`📊 *Confidence:* ${alert.confidence.toFixed(2)}`);
  lines.push("");

  if (alert.positiveFactors.length > 0) {
    lines.push("✅ *Positive Factors:*");
    for (const factor of alert.positiveFactors) {
      lines.push(`  • ${escapeMarkdownV2(factor)}`);
    }
  }

  if (alert.negativeFactors.length > 0) {
    lines.push("");
    lines.push("⚠️ *Risk Factors:*");
    for (const factor of alert.negativeFactors) {
      lines.push(`  • ${escapeMarkdownV2(factor)}`);
    }
  }

  lines.push("");
  lines.push(`🔗 [View on Web](${alert.webDeepLink})`);

  return lines.join("\n");
}

export function formatDevLogAlert(alert: AlertData): Record<string, unknown> {
  return {
    alertId: alert.id,
    type: "signal_alert",
    priority: alert.priority,
    token: {
      symbol: alert.tokenSymbol,
      address: alert.tokenAddress,
    },
    score: alert.signalScore,
    confidence: alert.confidence,
    market: {
      marketCap: alert.marketCapUsd,
      liquidity: alert.liquidityUsd,
      volume1h: alert.volume1hUsd,
      holders: alert.holderCount,
    },
    positiveFactors: alert.positiveFactors,
    negativeFactors: alert.negativeFactors,
    links: {
      web: alert.webDeepLink,
      telegram: alert.telegramDeepLink,
    },
    triggeredAt: alert.triggeredAt,
  };
}

export function generateDeepLinks(tokenAddress: string, appUrl: string): { webUrl: string; telegramUrl: string } {
  return {
    webUrl: `${appUrl}/tokens/${tokenAddress}`,
    telegramUrl: `https://t.me/memecoin_bot?start=token_${tokenAddress}`,
  };
}
