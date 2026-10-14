import { z } from "zod";
import { circuitSchema } from "./circuit";

export const firmwareAnalysisRequest = z
  .object({
    circuit: circuitSchema,
    stage: z.enum([
      "connecting",
      "checking",
      "uploading",
      "compiling",
      "saving",
      "running",
      "feedback",
    ]),
    log: z.string().max(16000).default(""),
    feedback: z.string().trim().max(4000).default(""),
    locale: z.enum(["ja", "en"]).default("ja"),
  })
  .refine((input) => Boolean(input.log.trim() || input.feedback), {
    message: "Build logs or user feedback are required",
    path: ["feedback"],
  });
export const firmwareAnalysisSchema = z.object({
  cause: z.string().min(1).max(2000),
  steps: z.array(z.string().min(1).max(500)).min(1).max(6),
  // Empty when changing code cannot fix the reported problem.
  firmware: z.string().max(12000),
});
export type FirmwareAnalysis = z.infer<typeof firmwareAnalysisSchema>;
