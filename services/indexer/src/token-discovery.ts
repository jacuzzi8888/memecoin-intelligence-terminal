import { Connection, PublicKey } from "@solana/web3.js";
import { logger } from "@memecoin/logger";
import type { TokenEvent } from "@memecoin/solana";

const log = logger("token-discovery");

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6wpFLc7DbLZ4K3e3oV261W");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

export interface TokenDiscoveryConfig {
  rpcUrl: string;
  pollIntervalMs?: number;
  lookbackSlots?: number;
}

export class TokenDiscoveryService {
  private connection: Connection;
  private pollIntervalMs: number;
  private lookbackSlots: number;
  private lastProcessedSlot: number = 0;
  private running: boolean = false;

  constructor(config: TokenDiscoveryConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.pollIntervalMs = config.pollIntervalMs || 10_000;
    this.lookbackSlots = config.lookbackSlots || 100;
    log.info({ rpcUrl: config.rpcUrl }, "Token discovery service initialized");
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    log.info("Token discovery service started");

    try {
      const currentSlot = await this.connection.getSlot();
      this.lastProcessedSlot = currentSlot - this.lookbackSlots;
      log.info({ startSlot: this.lastProcessedSlot }, "Starting from slot");
    } catch (err) {
      log.error({ error: err }, "Failed to get initial slot");
    }

    this.poll();
  }

  stop(): void {
    this.running = false;
    log.info("Token discovery service stopped");
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const events = await this.discoverNewTokens();
        if (events.length > 0) {
          log.info({ count: events.length, lastSlot: this.lastProcessedSlot }, "Discovered new tokens");
          for (const event of events) {
            log.info(
              { token: event.tokenAddress, deployer: event.deployer, slot: event.slot },
              "New token launch detected",
            );
          }
        }
      } catch (err) {
        log.error({ error: err }, "Error during token discovery poll");
      }

      await this.sleep(this.pollIntervalMs);
    }
  }

  async discoverNewTokens(): Promise<TokenEvent[]> {
    try {
      const currentSlot = await this.connection.getSlot();
      const fromSlot = Math.max(this.lastProcessedSlot, currentSlot - 500);

      if (fromSlot >= currentSlot) {
        return [];
      }

      const signatures = await this.connection.getSignaturesForAddress(
        TOKEN_PROGRAM_ID,
        { limit: 100 },
      );

      const events: TokenEvent[] = [];
      const processedSignatures = new Set<string>();

      for (const sigInfo of signatures) {
        if (sigInfo.slot <= this.lastProcessedSlot) continue;
        if (processedSignatures.has(sigInfo.signature)) continue;

        try {
          const tx = await this.connection.getTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || tx.meta?.err) continue;

          const tokenEvents = this.extractTokenEvents(tx, sigInfo.signature);
          events.push(...tokenEvents);
          processedSignatures.add(sigInfo.signature);
        } catch (err) {
          log.debug({ error: err, signature: sigInfo.signature }, "Failed to process transaction");
        }
      }

      if (currentSlot > this.lastProcessedSlot) {
        this.lastProcessedSlot = currentSlot;
      }

      return events;
    } catch (err) {
      log.error({ error: err }, "Failed to discover new tokens");
      return [];
    }
  }

  private extractTokenEvents(tx: any, signature: string): TokenEvent[] {
    const events: TokenEvent[] = [];

    const instructions = tx.transaction.message.compiledInstructions || [];
    const accountKeys = tx.transaction.message.staticAccountKeys || [];

    for (const ix of instructions) {
      const programId = accountKeys[ix.programIdIndex]?.toString();

      if (programId === TOKEN_PROGRAM_ID.toString() || programId === TOKEN_2022_PROGRAM_ID.toString()) {
        const data = Buffer.from(ix.data);
        if (data.length >= 1) {
          const instructionType = data[0];

          if (instructionType === 0) {
            const mintIndex = ix.accountKeyIndexes[0];
            const mintAuthorityIndex = ix.accountKeyIndexes[2];

            if (mintIndex !== undefined) {
              const mintAddress = accountKeys[mintIndex]?.toString();
              const authorityAddress = mintAuthorityIndex !== undefined
                ? accountKeys[mintAuthorityIndex]?.toString()
                : null;

              if (mintAddress) {
                events.push({
                  type: "token_launch",
                  tokenAddress: mintAddress,
                  deployer: authorityAddress || "",
                  timestamp: tx.blockTime || Math.floor(Date.now() / 1000),
                  slot: tx.slot,
                  signature,
                  metadata: {
                    instructionType: "InitializeMint",
                    decimals: data.length >= 5 ? data[4] : 9,
                  },
                });
              }
            }
          }
        }
      }
    }

    return events;
  }

  async getTokenInfo(mintAddress: string): Promise<{
    address: string;
    decimals: number;
    supply: string;
    mintAuthority: string | null;
    freezeAuthority: string | null;
  } | null> {
    try {
      const mint = new PublicKey(mintAddress);
      const info = await this.connection.getAccountInfo(mint);
      if (!info) return null;

      const data = info.data;
      if (data.length < 82) return null;

      const mintAuthorityOption = data.readUInt32LE(0);
      const mintAuthority = mintAuthorityOption === 1
        ? new PublicKey(data.slice(4, 36)).toString()
        : null;

      const supply = data.readBigUInt64LE(36).toString();
      const decimals = data[44]!;
      const freezeAuthorityOption = data.readUInt32LE(46);
      const freezeAuthority = freezeAuthorityOption === 1
        ? new PublicKey(data.slice(50, 82)).toString()
        : null;

      return {
        address: mintAddress,
        decimals,
        supply,
        mintAuthority,
        freezeAuthority,
      };
    } catch (err) {
      log.error({ error: err, mintAddress }, "Failed to get token info");
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
