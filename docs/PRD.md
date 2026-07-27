# Product Requirements Document (PRD)

## Overview

This document defines the product requirements for the Memecoin Intelligence Terminal across all surfaces.

## User Personas

### Alpha Hunter
- Experienced Solana trader
- Looks for early-stage opportunities before they pump
- Needs real-time alerts with explainable confidence
- Trades through the web terminal or Telegram bot

### Research Analyst
- Studies wallet behavior patterns and token launch dynamics
- Needs historical data exploration and backtesting tools
- Builds and tests strategies before deploying them
- Uses the web application primarily

### Portfolio Manager
- Manages multiple positions across memecoins
- Needs position monitoring with take-profit/stop-loss automation
- Tracks PnL and risk exposure
- Uses both web and Telegram interfaces

## Core Workflows

### 1. Signal Discovery
```
Token event detected
-> Normalize and enrich
-> Calculate token risk factors
-> Identify qualified wallets involved
-> Calculate signal score with explainable factors
-> Match against active strategies
-> Generate alert if threshold met
-> Deliver through configured channels
```

### 2. Token Research
```
User enters token address or clicks from alert
-> Display token identity, market data, launch info
-> Show intelligence score with factor breakdown
-> Display risk assessment
-> Show qualified wallet activity
-> Provide timeline of key events
-> Offer trading action (if terminal enabled)
```

### 3. Wallet Analysis
```
User searches wallet address
-> Display wallet identity and labels
-> Show performance metrics (PnL, win rate, avg hold)
-> Display recent trades and positions
-> Show cluster membership and relationships
-> Show cohort membership and qualification status
-> Offer backtesting and monitoring actions
```

### 4. Strategy Configuration
```
User creates or edits strategy
-> Define entry conditions (wallet count, score threshold, token filters)
-> Define exit conditions (take-profit, stop-loss, time limits)
-> Configure alert delivery channels
-> Backtest against historical data
-> Activate strategy
```

## Functional Requirements

### FR-1: Token Intelligence
- System shall ingest token creation events from Solana
- System shall calculate token risk scores with versioned rulesets
- System shall store raw events with provider provenance
- System shall derive intelligence from normalized facts

### FR-2: Wallet Intelligence
- System shall track qualified wallet performance
- System shall classify wallets (bot, insider, bundler, farm, legitimate)
- System shall calculate wallet scores with versioned rulesets
- System shall detect wallet clusters and funding relationships

### FR-3: Signal Generation
- System shall evaluate strategies against token events
- System shall generate explainable signal scores
- System shall support configurable alert thresholds
- System shall prevent duplicate alerts for the same event

### FR-4: Alert Delivery
- System shall deliver alerts through Telegram
- System shall deliver alerts through Discord (future)
- System shall deliver alerts through web push (future)
- System shall include deep links to web application
- System shall support notification preferences per user

### FR-5: Trading Terminal
- System shall connect to non-custodial wallets
- System shall retrieve swap quotes from Jupiter
- System shall simulate transactions before submission
- System shall never store private keys
- System shall require explicit user signing for all transactions
- System shall track trade outcomes for scoring feedback

### FR-6: Data Freshness
- System shall display data age for all presented information
- System shall indicate stale data clearly
- System shall prioritize recent data in scoring calculations

## Non-Functional Requirements

### NFR-1: Performance
- Scanner page shall load within 2 seconds
- API responses shall complete within 500ms for cached data
- Ingestion pipeline shall process events within 5 seconds of detection

### NFR-2: Reliability
- System shall handle provider outages gracefully
- Background jobs shall retry with exponential backoff
- System shall be idempotent for all ingestion operations

### NFR-3: Security
- No private keys shall be stored in the database
- No secrets shall be exposed to client-side code
- All external inputs shall be validated
- Development-only features shall be disabled in production

### NFR-4: Accessibility
- All pages shall meet WCAG 2.2 AA standards
- All interactive elements shall be keyboard accessible
- All data tables shall have proper headers and ARIA labels
- Color shall not be the sole indicator of state

### NFR-5: Scalability
- Architecture shall support horizontal scaling of workers
- Database queries shall be optimized for read-heavy workloads
- Caching layer shall reduce database load for hot data

## Release Phases

### Phase 1: Foundation (Completed)
- Monorepo structure
- Database schema
- Vertical slice (dev event -> score -> alert -> display)
- Basic web UI
- Telegram bot foundation

### Phase 2: Live Data (Completed)
- Real Solana RPC integration
- Token discovery pipeline
- Wallet qualification system
- Full scoring engine

### Phase 3: Trading (Next)
- Jupiter integration
- Non-custodial wallet connection
- Simulated trading
- Trade outcome tracking

### Phase 4: Advanced Intelligence
- Wallet clustering
- Historical backtesting
- Strategy builder
- Graph explorer
