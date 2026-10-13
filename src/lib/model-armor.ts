import { GoogleAuth } from "google-auth-library";
import { ServiceError } from "./ai";
import { withDeadline } from "./async";
import { logEvent, traced } from "./tracing";

export type Screening = {
  status: "passed" | "blocked" | "flagged" | "unavailable" | "disabled";
  filters: string[];
};
type Target = "prompt" | "response";
type TokenProvider = () => Promise<string | null | undefined>;

let auth: GoogleAuth | undefined;
const accessToken: TokenProvider = () =>
  (auth ??= new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  })).getAccessToken();

/** Model Armor is opt-in: screening runs only when a template is configured. */
function endpoint(target: Target) {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const template = process.env.MODEL_ARMOR_TEMPLATE;
  const location = process.env.MODEL_ARMOR_LOCATION || "asia-northeast1";
  if (!project || !template) return undefined;
  if (![project, template, location].every((v) => /^[a-z0-9-]+$/.test(v)))
    throw new Error("Invalid Model Armor configuration");
  return `https://modelarmor.${location}.rep.googleapis.com/v1/projects/${project}/locations/${location}/templates/${template}:${target === "prompt" ? "sanitizeUserPrompt" : "sanitizeModelResponse"}`;
}

function hasMatch(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, v]) =>
    key === "matchState" ? v === "MATCH_FOUND" : hasMatch(v),
  );
}

const sanitize = traced(
  "Model Armor",
  "tool",
  async (input: {
    target: Target;
    text: string;
    getToken: TokenProvider;
  }): Promise<Screening> => {
    try {
      const url = endpoint(input.target);
      if (!url) return { status: "disabled", filters: [] };
      const data = await withDeadline(async (signal) => {
        const response = await fetch(url, {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await input.getToken()}`,
          },
          body: JSON.stringify(
            input.target === "prompt"
              ? { userPromptData: { text: input.text } }
              : { modelResponseData: { text: input.text } },
          ),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      }, 8000);
      const result = data?.sanitizationResult;
      if (result?.filterMatchState === "NO_MATCH_FOUND")
        return { status: "passed", filters: [] };
      if (result?.filterMatchState !== "MATCH_FOUND")
        throw new Error("Unexpected Model Armor response");
      const filters = Object.entries(result.filterResults ?? {})
        .filter(([, value]) => hasMatch(value))
        .map(([key]) => key);
      const status =
        process.env.MODEL_ARMOR_MODE === "inspect" ? "flagged" : "blocked";
      logEvent("WARNING", "model_armor_match", {
        target: input.target,
        status,
        filters,
      });
      return { status, filters };
    } catch (error) {
      // Fail open: schema and net checks still guard the result.
      logEvent("WARNING", "model_armor_unavailable", {
        target: input.target,
        reason:
          error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });
      return { status: "unavailable", filters: [] };
    }
  },
  { processInputs: ({ target, text }) => ({ target, text }) },
);

/** Reject requests that the Model Armor template flags, such as prompt injection. */
export async function screenPrompt(text: string, getToken = accessToken) {
  const screening = await sanitize({ target: "prompt", text, getToken });
  if (screening.status === "blocked")
    throw new ServiceError(
      "入力が安全性検査で拒否されました。電子工作の依頼として書き直してください。",
      400,
    );
  return screening;
}

/** Reject generated text that Model Armor flags before it is saved or shown. */
export async function screenResponse(text: string, getToken = accessToken) {
  const screening = await sanitize({ target: "response", text, getToken });
  if (screening.status === "blocked")
    throw new ServiceError(
      "生成した設計が安全性検査を通過しませんでした。要件を変えて再試行してください。",
      422,
    );
  return screening;
}
