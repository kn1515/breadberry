import { z } from "zod";
import { boardSchema, draftCircuitSchema, type Circuit } from "./circuit";

export const MAX_MESSAGES = 100;
export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});
export type ChatMessage = z.infer<typeof messageSchema>;
export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  board: boardSchema,
  locale: z.enum(["ja", "en"]).default("ja"),
  context: z
    .object({
      circuit: draftCircuitSchema,
      messages: z.array(messageSchema).max(MAX_MESSAGES - 2),
    })
    .optional(),
});
export type CircuitContext = NonNullable<
  z.infer<typeof generateRequestSchema>["context"]
>;
/** Ask mode answers questions about the current circuit without changing it. */
export const askRequestSchema = z.object({
  prompt: generateRequestSchema.shape.prompt,
  locale: generateRequestSchema.shape.locale,
  context: generateRequestSchema.shape.context.unwrap(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;
export type ChatMode = "revise" | "new" | "ask";

export function appendExchange(
  messages: ChatMessage[],
  prompt: string,
  circuit: Circuit,
): ChatMessage[] {
  return [
    ...messages,
    { role: "user", content: prompt },
    {
      role: "assistant",
      content: `${circuit.title}\n\n${circuit.description}`,
    },
  ];
}

export function appendAnswer(
  messages: ChatMessage[],
  prompt: string,
  answer: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: "user", content: prompt },
    { role: "assistant", content: answer },
  ];
}
