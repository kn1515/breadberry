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
