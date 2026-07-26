import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type {
  TransactionData,
  AccountInfo,
  ProgramAccount,
  ProviderHealth,
} from "../types.js";
import type { IBlockchainDataProvider } from "../interfaces.js";
import { logger } from "@memecoin/logger";

const log = logger("solana-rpc-provider");

const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6wpFLc7DbLZ4K3e3oV261W";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const RAYDIUM_CPMM = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";

export class SolanaRpcProvider implements IBlockchainDataProvider {
  readonly name = "solana-rpc";
  private connection: Connection;

  constructor(rpcUrl?: string) {
    this.connection = new Connection(
      rpcUrl || process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed",
    );
    log.info({ rpcUrl: this.connection.rpcEndpoint }, "Solana RPC provider initialized");
  }

  async getTransaction(signature: string): Promise<TransactionData | null> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return null;

      const instructions = tx.transaction.message.compiledInstructions.map((ix) => ({
        programId: tx.transaction.message.staticAccountKeys[ix.programIdIndex]?.toString() || "",
        accounts: ix.accountKeyIndexes.map((idx) =>
          tx.transaction.message.staticAccountKeys[idx]?.toString() || "",
        ),
        data: Buffer.from(ix.data).toString("base64"),
      }));

      const tokenBalances = (tx.meta?.postTokenBalances || []).map((tb) => ({
        accountIndex: tb.accountIndex,
        mint: tb.mint,
        owner: tb.owner || "",
        amount: tb.uiTokenAmount.amount,
        decimals: tb.uiTokenAmount.decimals,
      }));

      return {
        signature: tx.transaction.signatures[0]!,
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        fee: tx.meta?.fee || 0,
        status: tx.meta?.err ? "failed" : "confirmed",
        instructions,
        tokenBalances,
      };
    } catch (err) {
      log.error({ error: err, signature }, "Failed to get transaction");
      return null;
    }
  }

  async getAccountInfo(address: string): Promise<AccountInfo | null> {
    try {
      const pubkey = new PublicKey(address);
      const info = await this.connection.getAccountInfo(pubkey);
      if (!info) return null;

      return {
        address: info.owner.toString(),
        lamports: info.lamports,
        owner: info.owner.toString(),
        executable: info.executable,
        rentEpoch: Number(info.rentEpoch),
        data: info.data,
      };
    } catch (err) {
      log.error({ error: err, address }, "Failed to get account info");
      return null;
    }
  }

  async getMultipleAccounts(addresses: string[]): Promise<(AccountInfo | null)[]> {
    try {
      const pubkeys = addresses.map((a) => new PublicKey(a));
      const result = await this.connection.getMultipleAccountsInfo(pubkeys);
      return result.map((info, i) => {
        if (!info) return null;
        return {
          address: addresses[i]!,
          lamports: info.lamports,
          owner: info.owner.toString(),
          executable: info.executable,
          rentEpoch: Number(info.rentEpoch),
          data: info.data,
        };
      });
    } catch (err) {
      log.error({ error: err }, "Failed to get multiple accounts");
      return addresses.map(() => null);
    }
  }

  async getProgramAccounts(
    programId: string,
    filters?: { memcmp?: { offset: number; bytes: string } }[],
  ): Promise<ProgramAccount[]> {
    try {
      const pubkey = new PublicKey(programId);
      const accounts = await this.connection.getProgramAccounts(pubkey, {
        filters: filters as any,
      });
      return accounts.map((a) => ({
        pubkey: a.pubkey.toString(),
        account: {
          address: a.pubkey.toString(),
          lamports: a.account.lamports,
          owner: a.account.owner.toString(),
          executable: a.account.executable,
          rentEpoch: Number(a.account.rentEpoch),
          data: a.account.data,
        },
      }));
    } catch (err) {
      log.error({ error: err, programId }, "Failed to get program accounts");
      return [];
    }
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const result = await this.connection.getLatestBlockhash();
    return {
      blockhash: result.blockhash,
      lastValidBlockHeight: result.lastValidBlockHeight,
    };
  }

  async health(): Promise<ProviderHealth> {
    try {
      const start = Date.now();
      await this.connection.getSlot();
      return {
        provider: this.name,
        healthy: true,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        provider: this.name,
        healthy: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getRpcUrl(): string {
    return this.connection.rpcEndpoint;
  }
}
