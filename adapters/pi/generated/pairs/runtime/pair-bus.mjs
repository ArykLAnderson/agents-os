import { EventEmitter } from "node:events";
import net from "node:net";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function writeFrame(socket, message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

function frameReader(onMessage) {
  let buffer = Buffer.alloc(0);
  return (data) => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 4) {
      const length = buffer.readUInt32BE(0);
      if (buffer.length < 4 + length) break;
      const payload = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);
      onMessage(JSON.parse(payload.toString("utf8")));
    }
  };
}

export const transportCapabilities = {
  piIntercom: {
    turnBoundaryEvents: true,
    messageInjection: "extension-only",
    agentIdentity: true,
    artifactRefs: true,
    notes: "Pi intercom is viable as a push bus inside a Pi extension that can observe turn_start/turn_end and call pi.sendMessage for tagged injection. The standalone intercom tool is session-to-session messaging, not general driver-turn observation by itself.",
  },
  localSocket: {
    turnBoundaryEvents: true,
    messageInjection: true,
    agentIdentity: true,
    artifactRefs: true,
    notes: "Local socket fallback can push runtime-derived events and advisor decisions without filesystem polling; Pi extension glue is still needed for real driver injection.",
  },
};

export class InMemoryPairBus extends EventEmitter {
  publish(channel, payload) {
    queueMicrotask(() => this.emit(channel, payload));
  }

  subscribe(channel, handler) {
    this.on(channel, handler);
    return () => this.off(channel, handler);
  }
}

export class LocalSocketPairBusServer extends EventEmitter {
  constructor({ socketPath = path.join(mkdtempSync(path.join(os.tmpdir(), "pair-bus-")), "bus.sock") } = {}) {
    super();
    this.socketPath = socketPath;
    this.clients = new Set();
    this.server = net.createServer((socket) => {
      this.clients.add(socket);
      socket.on("data", frameReader((message) => {
        this.emit(message.channel, message.payload);
        for (const client of this.clients) {
          if (client !== socket && !client.destroyed) writeFrame(client, message);
        }
      }));
      socket.on("close", () => this.clients.delete(socket));
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.socketPath, () => {
        this.server.off("error", reject);
        resolve(this.socketPath);
      });
    });
  }

  stop() {
    for (const client of this.clients) client.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

export class LocalSocketPairBusClient extends EventEmitter {
  constructor({ socketPath }) {
    super();
    this.socketPath = socketPath;
    this.socket = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.socketPath);
      this.socket = socket;
      socket.once("connect", resolve);
      socket.once("error", reject);
      socket.on("data", frameReader((message) => this.emit(message.channel, message.payload)));
    });
  }

  publish(channel, payload) {
    if (!this.socket || this.socket.destroyed) throw new Error("Pair bus client is not connected");
    writeFrame(this.socket, { channel, payload });
  }

  subscribe(channel, handler) {
    this.on(channel, handler);
    return () => this.off(channel, handler);
  }

  disconnect() {
    this.socket?.end();
  }
}
