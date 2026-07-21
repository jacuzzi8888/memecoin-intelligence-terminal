# Trading Terminal Specification

## Overview

Non-custodial trading terminal for executing swaps on Solana DEXes via Jupiter aggregator.

## Core Principles

1. **Never store private keys**: All signing happens in user's wallet
2. **Never execute without consent**: User must explicitly sign every transaction
3. **Simulate before submit**: All transactions are simulated first
4. **Track outcomes**: Every trade's result is recorded for strategy feedback

## Trading Flow

```
User selects token and amount
→ Retrieve quote from Jupiter
→ Display quote (price, slippage, fees)
→ User confirms parameters
→ Build swap transaction
→ Simulate transaction
→ Display simulation result
→ User signs in wallet
→ Submit transaction
→ Track confirmation
→ Record outcome
```

## Components

### Wallet Connection
- Solana Wallet Adapter
- Support Phantom, Solflare, Backpack, and others
- Display connected address and balance
- Support disconnect

### Quote Engine
- Jupiter V6 API integration
- Support for route selection (best price vs fewest hops)
- Slippage configuration
- Priority fee configuration
- Quote expiry handling

### Transaction Builder
- Build swap transactions from quotes
- Configure slippage tolerance (default 1%)
- Configure priority fees (default auto)
- Support for limit orders (future)

### Simulation
- Pre-submission simulation
- Display expected output vs actual
- Detect potential failures
- Show estimated fees

### Execution
- Submit signed transaction
- Track confirmation status
- Handle retries on failure
- Record final outcome

## Safety Measures

### Phase 1 (Current)
- Trading terminal is **read-only shell**
- No actual execution capability
- Quote retrieval is mocked
- Wallet connection is placeholder
- Clear "Execution Unavailable" messaging

### Phase 2
- Real Jupiter integration (devnet)
- Simulated trading with paper money
- Outcome tracking without real funds
- User can opt-in to testnet trading

### Phase 3
- Mainnet Jupiter integration
- Real trading with user-signed transactions
- Position tracking and PnL calculation
- Take-profit and stop-loss automation

## Order Types (Future)

### Market Order
- Execute immediately at best available price
- Configurable slippage tolerance

### Limit Order
- Set target price
- Order executes when price reached
- Uses Jupiter limit order protocol

### Recurring Order (DCA)
- Automatic periodic purchases
- Configurable amount and interval
- Uses Jupiter DCA protocol

## Transaction Records

Each trade records:
- Intent (what user wanted)
- Quote (what was offered)
- Simulation result (what was expected)
- Transaction signature (what happened)
- Final outcome (actual result)
- PnL calculation (when position closed)
