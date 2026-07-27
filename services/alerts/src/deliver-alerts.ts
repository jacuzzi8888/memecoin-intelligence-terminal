import { randomUUID } from "crypto";
import type { Database } from "@memecoin/database";
import { getDb } from "@memecoin/database";
import * as schema from "@memecoin/database/schema";
import { logger as createLogger } from "@memecoin/logger";
import { formatDevLogAlert, formatTelegramAlert } from "@memecoin/notifications";
import { asc, eq } from "drizzle-orm";

const log = createLogger("alerts");

interface PendingAlertRecord {
  id: string;
  userId: string | null;
  tokenAddress: string;
  priority: string;
  signalScore: number;
  title: string;
  webDeepLink: string | null;
  telegramDeepLink: string | null;
  triggeredAt: Date;
  tokenSymbol: string | null;
  confidence: string;
  signalId: string;
}

interface FactorRecord {
  factorType: string;
  factorName: string;
  rawValue: string | null;
}

interface DestinationRecord {
  channel: string;
  destination: string;
  priorityMin: string;
}

export interface AlertsRepository {
  getPendingAlerts(limit: number): Promise<PendingAlertRecord[]>;
  getSignalFactors(signalId: string): Promise<FactorRecord[]>;
  getAlertDestinations(userId: string | null): Promise<DestinationRecord[]>;
  insertAlertDelivery(delivery: {
    id: string;
    alertId: string;
    channel: string;
    destination: string;
    status: string;
    messageId?: string | null;
    error?: string | null;
    deliveredAt: Date | null;
  }): Promise<void>;
  markAlertDelivered(alertId: string): Promise<void>;
  markAlertFailed(alertId: string, error: unknown): Promise<void>;
}

export interface DeliverPendingAlertsOptions {
  limit?: number;
  repository: AlertsRepository;
}

export interface DeliverPendingAlertsResult {
  delivered: number;
  failed: number;
}

export function createAlertsRepository(db: Database = getDb()): AlertsRepository {
  return {
    async getPendingAlerts(limit) {
      const rows = await db.select({
        id: schema.alerts.id,
        userId: schema.alerts.userId,
        tokenAddress: schema.alerts.tokenAddress,
        priority: schema.alerts.priority,
        signalScore: schema.alerts.signalScore,
        title: schema.alerts.title,
        webDeepLink: schema.alerts.webDeepLink,
        telegramDeepLink: schema.alerts.telegramDeepLink,
        triggeredAt: schema.alerts.triggeredAt,
        tokenSymbol: schema.tokens.symbol,
        confidence: schema.signals.confidence,
        signalId: schema.alerts.signalId,
      })
        .from(schema.alerts)
        .leftJoin(schema.signals, eq(schema.alerts.signalId, schema.signals.id))
        .leftJoin(schema.tokens, eq(schema.alerts.tokenAddress, schema.tokens.address))
        .where(eq(schema.alerts.status, "pending"))
        .orderBy(asc(schema.alerts.triggeredAt))
        .limit(limit);

      return rows as PendingAlertRecord[];
    },
    async getSignalFactors(signalId) {
      const rows = await db.select({
        factorType: schema.signalFactors.factorType,
        factorName: schema.signalFactors.factorName,
        rawValue: schema.signalFactors.rawValue,
      })
        .from(schema.signalFactors)
        .where(eq(schema.signalFactors.signalId, signalId));

      return rows as FactorRecord[];
    },
    async getAlertDestinations(userId) {
      if (userId) {
        const rows = await db.select({
          channel: schema.notificationDestinations.channel,
          destination: schema.notificationDestinations.destination,
          priorityMin: schema.notificationDestinations.priorityMin,
          enabled: schema.notificationDestinations.enabled,
        })
          .from(schema.notificationDestinations)
          .where(eq(schema.notificationDestinations.userId, userId));

        return rows.filter((row) => row.destination && row.enabled).map((row) => ({
          channel: row.channel,
          destination: row.destination,
          priorityMin: row.priorityMin,
        }));
      }

      const rows = await db.select({
        channel: schema.notificationDestinations.channel,
        destination: schema.notificationDestinations.destination,
        priorityMin: schema.notificationDestinations.priorityMin,
        enabled: schema.notificationDestinations.enabled,
      })
        .from(schema.notificationDestinations);

      return rows.filter((row) => row.destination && row.enabled).map((row) => ({
        channel: row.channel,
        destination: row.destination,
        priorityMin: row.priorityMin,
      }));
    },
    async insertAlertDelivery(delivery) {
      await db.insert(schema.alertDeliveries).values(delivery);
    },
    async markAlertDelivered(alertId) {
      await db.update(schema.alerts)
        .set({ status: "delivered" })
        .where(eq(schema.alerts.id, alertId));
    },
    async markAlertFailed(alertId, error) {
      await db.update(schema.alerts)
        .set({ status: "failed" })
        .where(eq(schema.alerts.id, alertId));

      await db.insert(schema.processingFailures).values({
        id: randomUUID(),
        stage: "alerts",
        entityType: "alert",
        entityId: alertId,
        error: error instanceof Error ? error.message : String(error),
        stackTrace: error instanceof Error ? error.stack : undefined,
        payload: { alertId },
      });
    },
  };
}

const PRIORITY_ORDER: Record<string, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function shouldDeliver(alertPriority: string, minimumPriority: string) {
  return (PRIORITY_ORDER[alertPriority] ?? 0) >= (PRIORITY_ORDER[minimumPriority] ?? 0);
}

async function sendTelegramAlert(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not set");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram delivery failed with status ${response.status}`);
  }

  const payload = await response.json() as { result?: { message_id?: number } };
  return payload.result?.message_id ? String(payload.result.message_id) : null;
}

async function sendDiscordAlert(webhookUrl: string, title: string, lines: string[]) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: `**${title}**\n${lines.join("\n")}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord delivery failed with status ${response.status}`);
  }

  return null;
}

export async function deliverPendingAlerts(options: DeliverPendingAlertsOptions): Promise<DeliverPendingAlertsResult> {
  const limit = options.limit ?? 25;
  const alerts = await options.repository.getPendingAlerts(limit);

  let delivered = 0;
  let failed = 0;

  for (const alert of alerts) {
    try {
      const factors = await options.repository.getSignalFactors(alert.signalId);
      const positiveFactors = factors
        .filter((factor) => factor.factorType === "positive")
        .map((factor) => `${factor.factorName}: ${factor.rawValue ?? "n/a"}`);
      const negativeFactors = factors
        .filter((factor) => factor.factorType === "negative")
        .map((factor) => `${factor.factorName}: ${factor.rawValue ?? "n/a"}`);
      const alertData = {
        id: alert.id,
        tokenSymbol: alert.tokenSymbol || "UNKNOWN",
        tokenAddress: alert.tokenAddress,
        priority: alert.priority as "critical" | "high" | "medium" | "low" | "info",
        signalScore: alert.signalScore,
        confidence: Number(alert.confidence),
        positiveFactors,
        negativeFactors,
        webDeepLink: alert.webDeepLink || "",
        telegramDeepLink: alert.telegramDeepLink || undefined,
        triggeredAt: alert.triggeredAt.toISOString(),
      };
      const destinations = await options.repository.getAlertDestinations(alert.userId);
      const eligibleDestinations = destinations.filter((destination) =>
        shouldDeliver(alert.priority, destination.priorityMin),
      );

      if (eligibleDestinations.length === 0) {
        await options.repository.insertAlertDelivery({
          id: randomUUID(),
          alertId: alert.id,
          channel: "routing",
          destination: "suppressed",
          status: "skipped",
          messageId: null,
          error: null,
          deliveredAt: null,
        });
        await options.repository.markAlertDelivered(alert.id);
        delivered++;
        continue;
      }

      let successCount = 0;

      for (const destination of eligibleDestinations) {
        try {
          let messageId: string | null = null;

          if (destination.channel === "telegram") {
            messageId = await sendTelegramAlert(destination.destination, formatTelegramAlert(alertData));
          } else if (destination.channel === "discord") {
            messageId = await sendDiscordAlert(destination.destination, alert.title, [
              `Priority: ${alert.priority}`,
              `Score: ${alert.signalScore}/100`,
              `Token: ${alert.tokenSymbol || "UNKNOWN"} (${alert.tokenAddress})`,
              `Positive: ${positiveFactors.join(", ") || "n/a"}`,
              `Risks: ${negativeFactors.join(", ") || "n/a"}`,
              alert.webDeepLink ? `Web: ${alert.webDeepLink}` : "",
            ].filter(Boolean));
          } else {
            log.info(formatDevLogAlert(alertData), "Delivered alert to dev log");
          }

          await options.repository.insertAlertDelivery({
            id: randomUUID(),
            alertId: alert.id,
            channel: destination.channel,
            destination: destination.destination,
            status: "delivered",
            messageId,
            error: null,
            deliveredAt: new Date(),
          });
          successCount++;
        } catch (channelError) {
          await options.repository.insertAlertDelivery({
            id: randomUUID(),
            alertId: alert.id,
            channel: destination.channel,
            destination: destination.destination,
            status: "failed",
            messageId: null,
            error: channelError instanceof Error ? channelError.message : String(channelError),
            deliveredAt: null,
          });
          log.error({ error: channelError, alertId: alert.id, channel: destination.channel }, "Channel delivery failed");
        }
      }

      if (successCount > 0) {
        await options.repository.markAlertDelivered(alert.id);
        delivered++;
      } else {
        failed++;
        await options.repository.markAlertFailed(alert.id, new Error("No alert destinations succeeded"));
      }
    } catch (error) {
      failed++;
      await options.repository.markAlertFailed(alert.id, error);
      log.error({ error, alertId: alert.id }, "Failed to deliver alert");
    }
  }

  return { delivered, failed };
}
