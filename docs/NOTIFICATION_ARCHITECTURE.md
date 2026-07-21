# Notification Architecture

## Overview

Multi-channel notification system with consistent formatting and delivery tracking.

## Notification Channels

| Channel | Priority | Status |
|---------|----------|--------|
| Telegram | Primary | Phase 1 (dev mode) |
| Discord | Secondary | Planned |
| Web Push | Tertiary | Planned |
| Email | Low priority | Planned |
| WhatsApp | Optional | Planned (needs official integration) |
| Browser | In-app | Planned |

## Architecture

```
Alert Generated
→ Alert Service determines channels
→ For each channel:
  → Format message (channel-specific)
  → Check user preferences
  → Check rate limits
  → Queue delivery job
  → Execute delivery
  → Record result
```

## Notification Provider Interface

```typescript
interface NotificationProvider {
  readonly channel: NotificationChannel;
  
  send(params: NotificationParams): Promise<DeliveryResult>;
  validate(): Promise<boolean>;
  formatAlert(alert: Alert, user: UserPreferences): FormattedMessage;
}

interface NotificationParams {
  userId: string;
  alertId: string;
  priority: AlertPriority;
  title: string;
  body: string;
  deepLinks: DeepLinks;
  metadata?: Record<string, unknown>;
}

interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt: Date;
  channel: NotificationChannel;
}

interface DeepLinks {
  webUrl: string;
  telegramUrl?: string;
  discordUrl?: string;
}
```

## Channel Implementations

### Telegram Provider
- Uses grammY framework
- Formats messages in MarkdownV2
- Includes inline keyboard buttons for actions
- Supports silent mode for low-priority alerts

### Discord Provider (Planned)
- Uses Discord webhook API
- Formats as rich embeds
- Supports interaction buttons

### Web Push Provider (Planned)
- Uses Web Push API (VAPID)
- Service worker for background handling
- Action buttons in notification

## Formatting

### Message Components
Each notification includes:
1. **Header**: Priority indicator, alert type
2. **Token Identity**: Symbol, name, address (shortened)
3. **Market Data**: Market cap, liquidity, volume
4. **Intelligence**: Score, confidence, key factors
5. **Risk**: Risk level, key risk factors
6. **Actions**: Deep links, quick action buttons
7. **Timestamp**: When signal was generated

### Format Variations by Channel
- **Telegram**: MarkdownV2 with inline keyboards
- **Discord**: Rich embeds with action buttons
- **Web Push**: Short title + body, deep link
- **Email**: HTML email with full details

## Delivery Guarantees

- **At-least-once**: Failed deliveries are retried
- **Idempotent**: Duplicate deliveries are detected
- **Ordered**: Alerts for same token are ordered
- **Tracked**: Every delivery attempt is recorded

## User Preferences

Each user can configure:
- Enabled channels
- Minimum alert priority per channel
- Quiet hours (no notifications)
- Token-specific filters
- Wallet-specific filters
- Digest vs immediate delivery
