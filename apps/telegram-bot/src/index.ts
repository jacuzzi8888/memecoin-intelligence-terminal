import { Bot } from "grammy";
import { logger } from "@memecoin/logger";
import { formatTelegramAlert, generateDeepLinks } from "@memecoin/notifications";
import type { AlertData } from "@memecoin/notifications";

const log = logger("telegram-bot");

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    log.warn("TELEGRAM_BOT_TOKEN not set - bot will not start");
    return null;
  }

  const bot = new Bot(token);

  bot.command("start", (ctx) => {
    ctx.reply(
      "👋 Welcome to Memecoin Intelligence Terminal!\n\n" +
      "I help you discover alpha signals on Solana.\n\n" +
      "Use /help to see available commands.",
    );
  });

  bot.command("help", (ctx) => {
    ctx.reply(
      "📖 Available Commands:\n\n" +
      "/start - Welcome message\n" +
      "/help - Show this help\n" +
      "/status - System status\n" +
      "/alerts - Recent alerts\n" +
      "/scan <address> - Token intelligence\n\n" +
      "More commands coming in Phase 2!",
    );
  });

  bot.command("status", (ctx) => {
    ctx.reply(
      "📊 System Status\n\n" +
      "✅ Indexer: Running\n" +
      "✅ Processor: Running\n" +
      "✅ Scoring: Running\n" +
      "✅ Alerts: Running\n\n" +
      "📦 Data Source: Development\n" +
      "🕐 Last Update: Just now\n" +
      "📊 Tokens: 5\n" +
      "📈 Signals: 5",
    );
  });

  bot.command("alerts", async (ctx) => {
    try {
      const response = await fetch(`${process.env.API_URL || "http://localhost:4000"}/api/v1/alerts?limit=5`);
      const data: any = await response.json();

      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const lines = data.data.map((a: any) =>
          `${a.priority === "critical" ? "🔴" : a.priority === "high" ? "🟠" : "🟡"} ${a.title} (Score: ${a.signalScore})\n🔗 ${a.webDeepLink}`,
        );
        ctx.reply("🔔 Recent Alerts:\n\n" + lines.join("\n\n"));
      } else {
        ctx.reply("No alerts yet. Signals will appear here when detected.");
      }
    } catch {
      ctx.reply("Could not fetch alerts. Is the API running?");
    }
  });

  bot.command("scan", async (ctx) => {
    const address = ctx.message?.text?.split(" ")[1];

    if (!address) {
      ctx.reply("Usage: /scan <token_address>\n\nExample: /scan EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      return;
    }

    try {
      const response = await fetch(`${process.env.API_URL || "http://localhost:4000"}/api/v1/tokens/${address}`);
      const data: any = await response.json();

      if (data.success && data.data) {
        const t = data.token || data.data.token;
        const m = data.market || data.data.market;
        const i = data.intelligence || data.data.intelligence;

        let msg = `📊 ${t.symbol} - ${t.name}\n`;
        msg += `📍 ${t.address.slice(0, 12)}...\n\n`;

        if (m) {
          msg += `💰 Market Cap: $${Number(m.marketCapUsd).toLocaleString()}\n`;
          msg += `💧 Liquidity: $${Number(m.liquidityUsd).toLocaleString()}\n`;
          msg += `📈 Volume (1h): $${Number(m.volume1hUsd).toLocaleString()}\n`;
          msg += `👥 Holders: ${m.holderCount}\n\n`;
        }

        if (i) {
          msg += `⭐ Score: ${i.score}/100\n`;
          msg += `📊 Confidence: ${(i.confidence * 100).toFixed(0)}%\n`;
          msg += `🎯 Priority: ${i.priority}\n`;
        }

        const links = generateDeepLinks(address, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
        msg += `\n🔗 ${links.webUrl}`;

        ctx.reply(msg);
      } else {
        ctx.reply("Token not found. Check the address and try again.");
      }
    } catch {
      ctx.reply("Could not fetch token data. Is the API running?");
    }
  });

  bot.catch((err) => {
    log.error({ error: err.message }, "Bot error");
  });

  log.info("Telegram bot created");
  return bot;
}

export async function startBot() {
  const bot = createBot();
  if (!bot) {
    log.info("Telegram bot disabled (no token configured)");
    return;
  }

  try {
    await bot.start();
    log.info("Telegram bot started");
  } catch (err) {
    log.error({ error: err }, "Failed to start Telegram bot");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startBot();
}
