import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeliusStreamProvider } from "../helius-stream";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  sent: string[] = [];
  readyState = 0;
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({});
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  emitClose() {
    this.close();
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  parsedMessages() {
    return this.sent.map((payload) => JSON.parse(payload) as Record<string, unknown>);
  }
}

describe("HeliusStreamProvider", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("tracks remote subscription ids and unsubscribes them cleanly", async () => {
    const provider = new HeliusStreamProvider({ apiKey: "test-key", wsUrl: "ws://test" });

    const subscriptionPromise = provider.subscribe({ accounts: ["wallet-1"] });
    const socket = FakeWebSocket.instances[0]!;
    socket.open();

    const subscription = await subscriptionPromise;
    const subscribeMessage = socket.parsedMessages()[0]!;
    socket.emitMessage({ jsonrpc: "2.0", id: subscribeMessage.id, result: 42 });

    const iterator = subscription[Symbol.asyncIterator]();
    const nextEvent = iterator.next();

    socket.emitMessage({
      jsonrpc: "2.0",
      method: "transactionNotification",
      params: {
        subscription: 42,
        result: {
          signature: "sig-1",
          slot: 123,
          timestamp: 456,
        },
      },
    });

    await expect(nextEvent).resolves.toEqual({
      value: {
        type: "transaction",
        signature: "sig-1",
        slot: 123,
        timestamp: 456,
        data: {
          signature: "sig-1",
          slot: 123,
          timestamp: 456,
        },
      },
      done: false,
    });

    await subscription.unsubscribe();

    const lastMessage = socket.parsedMessages().at(-1)!;
    expect(lastMessage.method).toBe("transactionUnsubscribe");
    expect(lastMessage.params).toEqual([42]);

    provider.disconnect();
  });

  it("resubscribes active filters after reconnecting", async () => {
    vi.useFakeTimers();

    const provider = new HeliusStreamProvider({ apiKey: "test-key", wsUrl: "ws://test" });

    const subscriptionPromise = provider.subscribe({ accounts: ["wallet-1"], programs: ["program-1"] });
    const firstSocket = FakeWebSocket.instances[0]!;
    firstSocket.open();
    const subscription = await subscriptionPromise;

    expect(firstSocket.parsedMessages().filter((message) => message.method === "transactionSubscribe")).toHaveLength(2);

    firstSocket.emitClose();
    await vi.advanceTimersByTimeAsync(2000);

    const secondSocket = FakeWebSocket.instances[1]!;
    secondSocket.open();
    await Promise.resolve();

    expect(secondSocket.parsedMessages().filter((message) => message.method === "transactionSubscribe")).toHaveLength(2);

    await subscription.unsubscribe();
    provider.disconnect();
  });
});
