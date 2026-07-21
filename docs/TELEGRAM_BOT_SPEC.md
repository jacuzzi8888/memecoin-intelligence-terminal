# Telegram Bot Specification

## Overview

Telegram is the primary mobile interface for alerts, scanning, and quick trading actions. Built with grammY framework.

## Bot Commands

### User Commands

| Command | Description | Phase |
|---------|-------------|-------|
| `/start` | Welcome, link account | 1 |
| `/help` | Show available commands | 1 |
| `/status` | System health and data freshness | 1 |
| `/alerts` | Recent alerts with deep links | 1 |
| `/scan <address>` | Token intelligence for address | 1 |
| `/wallet <address>` | Wallet analysis | 2 |
| `/watchlist` | Show watchlist | 2 |
| `/watch add <address>` | Add to watchlist | 2 |
| `/watch remove <address>` | Remove from watchlist | 2 |
| `/settings` | Notification preferences | 2 |
| `/buy <token> <amount>` | Buy token (simulated in phase 2) | 3 |
| `/sell <token> <amount>` | Sell token | 3 |
| `/positions` | Current positions | 3 |
| `/pnl` | Profit/loss summary | 3 |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/admin status` | Detailed system status |
| `/admin users` | User count and stats |
| `/admin queues` | Queue health |
| `/admin broadcast` | Send system message |

## Alert Formatting

### Alert Message Structure
```
🔔 NEW SIGNAL [Priority]

📊 Token: $SYMBOL
📍 Address: <shortened>...<shortened>
💰 Market Cap: $X
💧 Liquidity: $X
📈 Volume (1h): $X
👥 Holders: X
🏆 Qualified Wallets: X

⭐ Signal Score: XX/100
📊 Confidence: X.XX

✅ Positive Factors:
• Factor 1
• Factor 2

⚠️ Risk Factors:
• Factor 1
• Factor 2

🔗 Web: <deep link>
🕐 Age: X minutes
```

### Deep Links
- Web app: `https://app.example.com/tokens/<address>`
- Telegram deep link: Links back to web app for detailed analysis
- Future: In-app keyboard buttons for quick actions

## User Account Linking

### Flow
1. User sends `/start` in Telegram
2. Bot generates unique linking code
3. User enters code in web app
4. Web app links Telegram chat ID to user account
5. User receives confirmation in Telegram

### Data Model
- `telegram_users` table maps chat_id → user_id
- Supports multiple Telegram accounts per user (future)
- Tracks linking timestamp and status

## Notification Delivery

### Priority-Based Delivery
| Priority | Delivery |
|----------|----------|
| Critical | Immediate push, sound enabled |
| High | Immediate push |
| Medium | Batched (every 5 min) |
| Low | Digest (hourly) |

### Rate Limiting
- Maximum 10 alerts per minute per user
- Excess alerts are queued and batched
- User can configure quiet hours

## Implementation Phases

### Phase 1 (Current)
- `/start`, `/help`, `/status`, `/alerts`, `/scan` commands
- Alert formatting (logged to structured output)
- Deep link generation
- No actual Telegram delivery (credentials optional)
- Development mode: alerts logged, not sent

### Phase 2
- Full Telegram delivery
- Account linking
- Watchlist commands
- Settings management
- Notification preferences

### Phase 3
- Trading commands (simulated)
- Position tracking
- PnL reporting
- Quick buy/sell actions
