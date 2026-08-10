import type { StreamConfig, StreamEvent, ProviderHealth } from "../types.js";
import type { ITransactionStreamProvider, StreamSubscription } from "../interfaces.js";
import { logger } from "@memecoin/logger";

const log = logger("helius-stream");
const DEFAULT_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

interface HeliusStreamConfig {
  apiKey: string;
  wsUrl?: string;
}

type SubscriptionCallback = (event: StreamEvent) => void;

interface LocalSubscription {
  callback: SubscriptionCallback;
  filters: string[];
  remoteSubscriptionIds: Set<number>;
  close: () => Promise<void>;
}

interface PendingSubscribeRequest {
  subscriptionId: string;
}

export class HeliusStreamProvider implements ITransactionStreamProvider {
  readonly name = "helius-stream";
  private apiKey: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, LocalSubscription>();
  private remoteSubscriptionOwners = new Map<number, string>();
  private pendingSubscribeRequests = new Map<string, PendingSubscribeRequest>();
  private connected = false;
  private reconnectAttempts = 0;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: HeliusStreamConfig) {
    this.apiKey = config.apiKey;
    this.wsUrl = config.wsUrl || `wss://atlas-mainnet.helius-rpc.com/?api-key=${this.apiKey}`;
    log.info("Helius stream provider initialized");
  }

  async subscribe(config: StreamConfig): Promise<StreamSubscription> {
    const subscriptionId = crypto.randomUUID();
    const filters = [...(config.accounts || []), ...(config.programs || [])];
    if (filters.length === 0) {
      filters.push(DEFAULT_TOKEN_PROGRAM);
    }

    const queue: StreamEvent[] = [];
    let resolveNext: ((value: IteratorResult<StreamEvent>) => void) | null = null;
    let closed = false;

    const flush = (result: IteratorResult<StreamEvent>) => {
      if (!resolveNext) return false;
      const pending = resolveNext;
      resolveNext = null;
      pending(result);
      return true;
    };

    const callback = (event: StreamEvent) => {
      if (!flush({ value: event, done: false })) {
        queue.push(event);
      }
    };

    const close = async () => {
      if (closed) return;
      closed = true;
      await this.unsubscribe(subscriptionId);
      flush({ value: undefined as never, done: true });
    };

    this.subscriptions.set(subscriptionId, {
      callback,
      filters,
      remoteSubscriptionIds: new Set<number>(),
      close,
    });

    // Keep the local subscription alive while the provider reconnects. The
    // socket's onopen handler resubscribes all active filters once available.
    void this.ensureConnected().catch(() => undefined);

    return {
      subscriptionId,
      unsubscribe: close,
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (queue.length > 0) {
            return { value: queue.shift()!, done: false };
          }

          if (closed) {
            return { value: undefined as never, done: true };
          }

          return await new Promise<IteratorResult<StreamEvent>>((resolve) => {
            resolveNext = resolve;
          });
        },
        return: async () => {
          await close();
          return { value: undefined as never, done: true };
        },
      }),
    };
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    this.subscriptions.delete(subscriptionId);

    for (const remoteSubscriptionId of subscription.remoteSubscriptionIds) {
      this.remoteSubscriptionOwners.delete(remoteSubscriptionId);
      this.sendJsonRpc("transactionUnsubscribe", [remoteSubscriptionId]);
    }

    for (const [requestId, pending] of this.pendingSubscribeRequests.entries()) {
      if (pending.subscriptionId === subscriptionId) {
        this.pendingSubscribeRequests.delete(requestId);
      }
    }

    if (this.subscriptions.size === 0 && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    log.info({ subscriptionId }, "Unsubscribed from stream");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async health(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      healthy: this.connected,
      error: this.connected ? undefined : "WebSocket not connected",
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.connectPromise = null;
    this.pendingSubscribeRequests.clear();
    this.remoteSubscriptionOwners.clear();

    for (const subscription of this.subscriptions.values()) {
      subscription.remoteSubscriptionIds.clear();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.ws) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      this.ws = socket;

      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        try {
          socket.close();
        } catch {
          // Best effort.
        }
        reject(new Error("Connection timeout"));
      }, 10000);

      socket.onopen = () => {
        clearTimeout(timeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.connectPromise = null;
        settled = true;
        log.info("Helius WebSocket connected");

        for (const [subscriptionId, subscription] of this.subscriptions.entries()) {
          subscription.remoteSubscriptionIds.clear();
          this.subscribeFilters(subscriptionId, subscription.filters);
        }

        resolve();
      };

      socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      socket.onerror = (err) => {
        clearTimeout(timeout);
        this.connected = false;

        if (!settled) {
          settled = true;
          this.connectPromise = null;
          reject(this.normalizeSocketError(err));
          return;
        }

        log.error({ error: this.normalizeSocketError(err) }, "Helius WebSocket error");
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        this.connected = false;
        this.ws = null;
        this.connectPromise = null;
        this.pendingSubscribeRequests.clear();

        for (const subscription of this.subscriptions.values()) {
          subscription.remoteSubscriptionIds.clear();
        }
        this.remoteSubscriptionOwners.clear();

        log.info("Helius WebSocket disconnected");

        if (this.subscriptions.size === 0) return;

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        log.info({ attempt: this.reconnectAttempts, delay }, "Attempting reconnect...");

        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.ensureConnected();
        }, delay);
      };
    });

    try {
      await this.connectPromise;
    } catch (err) {
      log.error({ error: err }, "Failed to connect to Helius WebSocket");
      throw err;
    }
  }

  private subscribeFilters(subscriptionId: string, filters: string[]): void {
    for (const filter of filters) {
      const requestId = crypto.randomUUID();
      this.pendingSubscribeRequests.set(requestId, { subscriptionId });
      this.sendJsonRpc("transactionSubscribe", [
        { accountInclude: [filter] },
        { encoding: "jsonParsed", transactionDetails: "full", showRewards: false },
      ], requestId);
    }
  }

  private handleMessage(rawData: unknown): void {
    try {
      const payload = typeof rawData === "string"
        ? rawData
        : rawData instanceof ArrayBuffer
          ? Buffer.from(rawData).toString("utf8")
          : String(rawData);

      const data = JSON.parse(payload) as Record<string, any>;

      if (typeof data.id !== "undefined" && typeof data.result === "number") {
        const requestId = String(data.id);
        const pending = this.pendingSubscribeRequests.get(requestId);
        if (!pending) return;

        this.pendingSubscribeRequests.delete(requestId);

        const subscription = this.subscriptions.get(pending.subscriptionId);
        if (!subscription) return;

        subscription.remoteSubscriptionIds.add(data.result);
        this.remoteSubscriptionOwners.set(data.result, pending.subscriptionId);
        return;
      }

      if (data.method !== "transactionNotification") return;

      const tx = data.params?.result;
      if (!tx) return;

      const remoteSubscriptionId = data.params?.subscription;
      const localSubscriptionId = typeof remoteSubscriptionId === "number"
        ? this.remoteSubscriptionOwners.get(remoteSubscriptionId)
        : undefined;

      const streamEvent: StreamEvent = {
        type: "transaction",
        signature: tx.signature || "",
        slot: tx.slot || 0,
        timestamp: tx.timestamp || Math.floor(Date.now() / 1000),
        data: tx,
      };

      if (localSubscriptionId) {
        this.subscriptions.get(localSubscriptionId)?.callback(streamEvent);
        return;
      }

      for (const subscription of this.subscriptions.values()) {
        subscription.callback(streamEvent);
      }
    } catch (err) {
      log.error({ error: err }, "Failed to parse WebSocket message");
    }
  }

  private sendJsonRpc(method: string, params: unknown[], id = crypto.randomUUID()): void {
    if (!this.ws || !this.connected) return;

    this.ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }));
  }

  private normalizeSocketError(err: unknown): Error {
    if (err instanceof Error) return err;
    return new Error(typeof err === "string" ? err : "WebSocket error");
  }
}
