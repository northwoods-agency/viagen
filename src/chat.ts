import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import type { ViteDevServer } from "vite";
import {
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { LogBuffer } from "./logger";
import { refreshAccessToken } from "./oauth";
import { AsyncQueue } from "./async-queue";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export const DEFAULT_SYSTEM_PROMPT = `
  You are embedded in a Vite dev server as the "viagen" plugin.
  Your job is to help build and modify the app. Files you edit will trigger Vite HMR automatically.
  You can read .viagen/server.log to check recent Vite dev server output (compile errors, HMR updates, warnings).
  Be concise.
`;

export interface ChatEvent {
  type: "text" | "tool_use" | "tool_result" | "error" | "done";
  text?: string;
  name?: string;
  input?: unknown;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

interface ChatSessionOpts {
  env: Record<string, string>;
  projectRoot: string;
  logBuffer: LogBuffer;
  model: string;
  systemPrompt?: string;
}

/**
 * Shared chat session — uses the Claude Agent SDK streaming input mode
 * to maintain a persistent agent process across messages.
 */
export class ChatSession {
  private sessionId: string | undefined;
  private chatLogPath: string;
  private opts: ChatSessionOpts;

  // SDK query lifecycle
  private activeQuery: Query | null = null;
  private messageQueue: AsyncQueue<SDKUserMessage> | null = null;
  private queryConsumerRunning = false;

  // Event routing — connects SDK events to the current SSE response
  private currentEventSink: ((event: ChatEvent) => void) | null = null;
  private currentDoneResolve: (() => void) | null = null;

  // Track auth token to detect refresh requiring query recreation
  private lastUsedToken: string | undefined;

  constructor(opts: ChatSessionOpts) {
    this.opts = opts;
    this.chatLogPath = join(opts.projectRoot, ".viagen", "chat.log");
  }

  reset() {
    this.sessionId = undefined;
    this.destroyQuery();
  }

  destroy() {
    this.destroyQuery();
  }

  getHistory(): Array<Record<string, unknown>> {
    try {
      const raw = readFileSync(this.chatLogPath, "utf-8");
      const entries: Array<Record<string, unknown>> = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // skip malformed lines
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  private chatLog(entry: Record<string, unknown>) {
    try {
      appendFileSync(
        this.chatLogPath,
        JSON.stringify({ ...entry, timestamp: Date.now() }) + "\n",
      );
    } catch {
      // best-effort
    }
  }

  async refreshTokenIfNeeded(): Promise<string | null> {
    const hasOAuthToken = !!this.opts.env["CLAUDE_ACCESS_TOKEN"];
    if (hasOAuthToken && this.opts.env["CLAUDE_TOKEN_EXPIRES"]) {
      const expires = parseInt(this.opts.env["CLAUDE_TOKEN_EXPIRES"], 10);
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > expires - 300) {
        const tokens = await refreshAccessToken(
          this.opts.env["CLAUDE_REFRESH_TOKEN"],
        );
        this.opts.env["CLAUDE_ACCESS_TOKEN"] = tokens.access_token;
        this.opts.env["CLAUDE_REFRESH_TOKEN"] = tokens.refresh_token;
        this.opts.env["CLAUDE_TOKEN_EXPIRES"] = String(
          nowSec + tokens.expires_in,
        );

        const envPath = join(this.opts.projectRoot, ".env");
        if (existsSync(envPath)) {
          let content = readFileSync(envPath, "utf-8");
          const replacements: Record<string, string> = {
            CLAUDE_ACCESS_TOKEN: tokens.access_token,
            CLAUDE_REFRESH_TOKEN: tokens.refresh_token,
            CLAUDE_TOKEN_EXPIRES: String(nowSec + tokens.expires_in),
          };
          for (const [key, val] of Object.entries(replacements)) {
            const re = new RegExp(`^${key}=.*$`, "m");
            if (re.test(content)) {
              content = content.replace(re, `${key}=${val}`);
            }
          }
          writeFileSync(envPath, content);
        }
      }
    }
    return null;
  }

  /**
   * Lazily create the SDK query on first use. Recreates if the auth token
   * changed (e.g. after OAuth refresh) or if the previous query ended.
   */
  private ensureQuery(): void {
    const currentToken =
      this.opts.env["CLAUDE_ACCESS_TOKEN"] ||
      this.opts.env["ANTHROPIC_API_KEY"];

    if (
      this.activeQuery &&
      this.queryConsumerRunning &&
      this.lastUsedToken === currentToken
    ) {
      return;
    }

    // Token changed or query not running — (re)create
    if (this.activeQuery) this.destroyQuery();

    this.lastUsedToken = currentToken;
    this.messageQueue = new AsyncQueue<SDKUserMessage>();

    // Build environment for the SDK
    const sdkEnv: Record<string, string | undefined> = {
      ...(process.env as Record<string, string>),
      CLAUDECODE: "",
    };

    const hasApiKey = !!this.opts.env["ANTHROPIC_API_KEY"];
    const hasOAuthToken = !!this.opts.env["CLAUDE_ACCESS_TOKEN"];
    if (hasApiKey) {
      sdkEnv["ANTHROPIC_API_KEY"] = this.opts.env["ANTHROPIC_API_KEY"];
    } else if (hasOAuthToken) {
      sdkEnv["CLAUDE_CODE_OAUTH_TOKEN"] =
        this.opts.env["CLAUDE_ACCESS_TOKEN"];
    }

    const systemPrompt = this.opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

    this.activeQuery = query({
      prompt: this.messageQueue,
      options: {
        model: this.opts.model,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: this.opts.projectRoot,
        env: sdkEnv,
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: systemPrompt,
        },
        includePartialMessages: true,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    });

    // Start the consumer loop
    this.queryConsumerRunning = true;
    this.consumeQuery().catch((err) => {
      this.queryConsumerRunning = false;
      if (this.currentEventSink) {
        this.currentEventSink({
          type: "error",
          text: err instanceof Error ? err.message : String(err),
        });
        this.currentEventSink({ type: "done" });
        this.currentDoneResolve?.();
        this.currentDoneResolve = null;
        this.currentEventSink = null;
      }
    });
  }

  /**
   * Long-running loop that drains messages from the SDK query
   * and routes them to the current event sink.
   */
  private async consumeQuery(): Promise<void> {
    if (!this.activeQuery) return;

    try {
      for await (const msg of this.activeQuery) {
        this.routeSDKMessage(msg);
      }
    } finally {
      this.queryConsumerRunning = false;
    }
  }

  /**
   * Map an SDK message to ChatEvent(s) and forward to the current event sink.
   */
  private routeSDKMessage(msg: SDKMessage): void {
    const sink = this.currentEventSink;

    switch (msg.type) {
      case "system": {
        // Capture session ID from init message
        if ("subtype" in msg && msg.subtype === "init" && msg.session_id) {
          this.sessionId = msg.session_id;
        }
        break;
      }

      case "stream_event": {
        // Partial streaming events — real-time text display
        if (!sink) break;
        const event = msg.event;
        if (
          event.type === "content_block_delta" &&
          "delta" in event &&
          event.delta.type === "text_delta" &&
          "text" in event.delta
        ) {
          sink({ type: "text", text: event.delta.text });
        }
        break;
      }

      case "assistant": {
        // Complete assistant message — extract tool_use blocks and log text
        if (!msg.message?.content) break;
        const content = msg.message.content;
        if (!Array.isArray(content)) break;
        for (const block of content) {
          if (block.type === "text" && block.text) {
            // Log full text to chat log (streaming already sent deltas to the sink)
            this.chatLog({
              role: "assistant",
              type: "text",
              text: block.text,
            });
          }
          if (block.type === "tool_use") {
            this.chatLog({
              role: "assistant",
              type: "tool_use",
              name: block.name,
              input: block.input,
            });
            sink?.({ type: "tool_use", name: block.name, input: block.input });
          }
        }
        break;
      }

      case "user": {
        // Tool results come through as user messages with tool_result content
        if (!sink) break;
        if (!msg.message?.content) break;
        const userContent = Array.isArray(msg.message.content)
          ? msg.message.content
          : [msg.message.content];
        for (const block of userContent) {
          if (
            typeof block === "object" &&
            "type" in block &&
            block.type === "tool_result"
          ) {
            const resultContent = "content" in block ? block.content : "";
            let text = "";
            if (typeof resultContent === "string") {
              text = resultContent;
            } else if (Array.isArray(resultContent)) {
              text = resultContent
                .filter(
                  (c): c is { type: "text"; text: string } =>
                    typeof c === "object" && c !== null && c.type === "text",
                )
                .map((c) => c.text)
                .join("");
            }
            if (text) {
              sink({ type: "tool_result", text });
            }
          }
        }
        break;
      }

      case "result": {
        // Completion — log result and signal done
        if (msg.subtype === "success" && "result" in msg && msg.result) {
          this.chatLog({
            role: "assistant",
            type: "result",
            text: msg.result,
          });
        }
        if (msg.subtype !== "success" && "errors" in msg) {
          for (const err of msg.errors) {
            sink?.({ type: "error", text: err });
          }
        }
        // Extract usage/cost from result
        const doneEvent: ChatEvent = { type: "done" };
        if ("total_cost_usd" in msg) {
          doneEvent.costUsd = msg.total_cost_usd as number;
        }
        if ("duration_ms" in msg) {
          doneEvent.durationMs = msg.duration_ms as number;
        }
        if ("usage" in msg && msg.usage) {
          const u = msg.usage as Record<string, number>;
          doneEvent.inputTokens = u.input_tokens ?? 0;
          doneEvent.outputTokens = u.output_tokens ?? 0;
        }
        sink?.(doneEvent);
        this.currentDoneResolve?.();
        this.currentDoneResolve = null;
        this.currentEventSink = null;
        break;
      }
    }
  }

  private destroyQuery(): void {
    if (this.messageQueue) {
      this.messageQueue.close();
      this.messageQueue = null;
    }
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
    this.queryConsumerRunning = false;
    this.currentEventSink = null;
    this.currentDoneResolve = null;
  }

  /**
   * Send a message to Claude. Calls `onEvent` for each streamed event.
   * Returns a promise that resolves when Claude is done, and a kill
   * function to abort the current turn.
   */
  sendMessage(
    message: string,
    onEvent: (event: ChatEvent) => void,
  ): { done: Promise<void>; kill: () => void } {
    this.chatLog({ role: "user", type: "message", text: message });

    // Include recent errors in the message (system prompt is set at query creation)
    let fullMessage = message;
    const recentErrors = this.opts.logBuffer.recentErrors();
    if (recentErrors.length > 0) {
      fullMessage += `\n\n[Dev server context — recent errors/warnings:\n${recentErrors.join("\n")}\n]`;
    }

    // Ensure the query is running
    this.ensureQuery();

    // Wire up event routing for this request
    const done = new Promise<void>((resolve) => {
      this.currentDoneResolve = resolve;
      this.currentEventSink = onEvent;
    });

    // Push the message into the async queue for the SDK
    this.messageQueue!.push({
      type: "user",
      session_id: this.sessionId ?? "",
      parent_tool_use_id: null,
      message: {
        role: "user",
        content: fullMessage,
      },
    });

    return {
      done,
      kill: () => {
        this.activeQuery?.interrupt().catch(() => {});
      },
    };
  }
}

export function registerChatRoutes(
  server: ViteDevServer,
  session: ChatSession,
  opts: { env: Record<string, string> },
) {
  server.middlewares.use("/via/chat/history", (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const since = parseInt(url.searchParams.get("since") || "0", 10);

    let entries = session.getHistory();
    if (since > 0) {
      entries = entries.filter(
        (e) => typeof e.timestamp === "number" && e.timestamp > since,
      );
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ entries }));
  });

  server.middlewares.use("/via/chat/reset", (_req, res) => {
    session.reset();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
  });

  server.middlewares.use("/via/chat", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const hasApiKey = !!opts.env["ANTHROPIC_API_KEY"];
    const hasOAuthToken = !!opts.env["CLAUDE_ACCESS_TOKEN"];

    if (!hasApiKey && !hasOAuthToken) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: "No Claude auth configured. Run `npx viagen setup`.",
        }),
      );
      return;
    }

    // Refresh OAuth token if needed
    if (hasOAuthToken) {
      try {
        await session.refreshTokenIfNeeded();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[viagen] OAuth token refresh failed: ${msg}`);
        res.statusCode = 500;
        res.end(
          JSON.stringify({ error: `OAuth token refresh failed: ${msg}` }),
        );
        return;
      }
    }

    let message: string;
    try {
      const body = JSON.parse(await readBody(req));
      message = body.message;
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (!message) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Missing "message" field' }));
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let done = false;
    const { kill } = session.sendMessage(message, (event) => {
      if (done) return;
      if (event.type === "done") {
        done = true;
        if (!res.writableEnded) {
          res.write("event: done\ndata: {}\n\n");
          res.end();
        }
        return;
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    req.on("close", () => {
      kill();
    });

    // Ensure response ends
    await done;
  });
}
