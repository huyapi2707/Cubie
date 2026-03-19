import { z } from "zod";

// ─── Client → Server Messages ────────────────────────────────────────────────

export const StartMessageSchema = z.object({
  type: z.literal("start"),
  sourceLanguage: z.string().min(2).max(10),
  targetLanguage: z.string().min(2).max(10),
  ttsGender: z.enum(["male", "female", "neutral"]).optional(),
});

export const StopMessageSchema = z.object({
  type: z.literal("stop"),
});

export const PingMessageSchema = z.object({
  type: z.literal("ping"),
});

export const ConfigUpdateMessageSchema = z.object({
  type: z.literal("config"),
  sourceLanguage: z.string().min(2).max(10).optional(),
  targetLanguage: z.string().min(2).max(10).optional(),
  ttsGender: z.enum(["male", "female", "neutral"]).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  StartMessageSchema,
  StopMessageSchema,
  PingMessageSchema,
  ConfigUpdateMessageSchema,
]);

export type StartMessage = z.infer<typeof StartMessageSchema>;
export type StopMessage = z.infer<typeof StopMessageSchema>;
export type PingMessage = z.infer<typeof PingMessageSchema>;
export type ConfigUpdateMessage = z.infer<typeof ConfigUpdateMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ─── Server → Client Messages ────────────────────────────────────────────────

export interface TranscriptMessage {
  type: "transcript";
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface TranslationMessage {
  type: "translation";
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  timestamp: number;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
  timestamp: number;
}

export interface SessionCreatedMessage {
  type: "session_created";
  sessionId: string;
  timestamp: number;
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
}

export interface SessionEndedMessage {
  type: "session_ended";
  reason: string;
  timestamp: number;
}

export type ServerMessage =
  | TranscriptMessage
  | TranslationMessage
  | ErrorMessage
  | SessionCreatedMessage
  | PongMessage
  | SessionEndedMessage;
