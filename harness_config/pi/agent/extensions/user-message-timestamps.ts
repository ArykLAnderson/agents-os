import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export default function userMessageTimestamps(pi: ExtensionAPI): void {
  pi.on("context", (event) => ({
    messages: event.messages.map((message) => {
      if (message.role !== "user" || !message.timestamp) return message;

      const timestamp = `[Sent at ${formatTimestamp(message.timestamp)}]`;
      const content =
        typeof message.content === "string"
          ? `${message.content}\n\n${timestamp}`
          : [...message.content, { type: "text" as const, text: timestamp }];

      return { ...message, content };
    }),
  }));
}
