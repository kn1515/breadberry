import { z } from "zod";
import { circuitSchema } from "./circuit";

export const firmwareAnalysisRequest = z.object({
  circuit: circuitSchema,
  stage: z.enum([
    "connecting",
    "checking",
    "uploading",
    "compiling",
    "saving",
    "running",
  ]),
  log: z.string().min(1).max(16000),
  locale: z.enum(["ja", "en"]).default("ja"),
});
export const firmwareAnalysisSchema = z.object({
  cause: z.string().min(1).max(2000),
  steps: z.array(z.string().min(1).max(500)).min(1).max(6),
  // Empty when changing code cannot fix the reported problem.
  firmware: z.string().max(12000),
});
export type FirmwareAnalysis = z.infer<typeof firmwareAnalysisSchema>;
