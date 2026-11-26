// The room's AI settings: shared by every AI feature in a room (Tarot readings today).
import { z } from 'zod';

const aiKey = z.string().trim().min(8).max(500);
/** Test and save the room owner's own OpenAI-compatible AI, used by every AI feature in the room. An omitted api_key keeps the saved one. */
export const roomAiSaveSchema = z
  .object({
    base_url: z.string().trim().min(1).max(300),
    model: z.string().trim().min(1).max(120),
    api_key: aiKey.optional(),
  })
  .strict();
export const roomAiEnableSchema = z.object({ enabled: z.boolean() }).strict();
/** Outcome of saving or switching the room's AI; failures change nothing. */
export interface RoomAiResult {
  ok: boolean;
  message: string;
  view?: RoomAiView;
}
/** What the owner sees of the room's AI: never the key, only its last characters. */
export interface RoomAiView {
  enabled: boolean;
  base_url: string;
  model: string;
  has_key: boolean;
  key_hint: string | null;
  updated_at: string | null;
}
