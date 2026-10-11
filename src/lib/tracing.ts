import { AsyncLocalStorage } from "node:async_hooks";
import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { GoogleAuth } from "google-auth-library";
import { withDeadline } from "./async";

type StepType = "chain" | "llm" | "tool";
type TraceOptions = {
  processInputs?: (inputs: any) => Record<string, unknown>;
  processOutputs?: (outputs: any) => Record<string, unknown>;
  /** Extra span attributes, e.g. model name and token counts. */
  attributes?: (input: any, output: any) => Attributes;
};

const MAX_ATTRIBUTE_LENGTH = 20000;
const current = new AsyncLocalStorage<Span>();
let provider: BasicTracerProvider | undefined;
let testExporter: SpanExporter | undefined;

/** Tracing is opt-in: without CLOUD_TRACE=true no spans are created. */
export function tracingEnabled() {
  return process.env.CLOUD_TRACE === "true";
}

/** Replace the Cloud Trace exporter in tests. */
export function setSpanExporter(exporter: SpanExporter | undefined) {
  testExporter = exporter;
  provider = undefined;
}

/** Cloud Trace through the Telemetry API (OTLP), authenticated with ADC. */
function cloudTraceExporter(): SpanExporter {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const exporter = new OTLPTraceExporter({
    url: "https://telemetry.googleapis.com/v1/traces",
    headers: async () => ({
      Authorization: `Bearer ${await auth.getAccessToken()}`,
    }),
  });
  return {
    // Export failures must never break a request; report them once per batch.
    export: (spans, done) =>
      exporter.export(spans, (result) => {
        if (result.code !== ExportResultCode.SUCCESS)
          logEvent("WARNING", "cloud_trace_export_failed", {
            reason: result.error?.message.slice(0, 200),
          });
        done(result);
      }),
    shutdown: () => exporter.shutdown(),
    forceFlush: () => exporter.forceFlush(),
  };
}

// The provider is not registered globally, so Next.js's own spans are not exported.
function tracer() {
  provider ??= new BasicTracerProvider({
    resource: resourceFromAttributes({
      "service.name": process.env.K_SERVICE || "breadberry",
      "gcp.project_id": process.env.GOOGLE_CLOUD_PROJECT ?? "",
    }),
    spanProcessors: [
      new BatchSpanProcessor(testExporter ?? cloudTraceExporter()),
    ],
  });
  return provider.getTracer("breadberry");
}

function text(value: unknown) {
  try {
    return (JSON.stringify(value) ?? "").slice(0, MAX_ATTRIBUTE_LENGTH);
  } catch {
    return "[unserializable]";
  }
}

/**
 * Record a step as a span. Never pass secrets as arguments: arguments and
 * return values are stored in Cloud Trace unless processInputs /
 * processOutputs replace them.
 */
export function traced<Args extends unknown[], Result>(
  name: string,
  stepType: StepType,
  work: (...args: Args) => Promise<Result>,
  options: TraceOptions = {},
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    if (!tracingEnabled()) return work(...args);
    const parent = current.getStore();
    const span = tracer().startSpan(
      name,
      { attributes: { "breadberry.step.type": stepType } },
      parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT,
    );
    const input = args.length === 1 ? args[0] : args;
    span.setAttribute(
      "input",
      text(options.processInputs ? options.processInputs(input) : input),
    );
    try {
      const output = await current.run(span, () => work(...args));
      span.setAttribute(
        "output",
        text(options.processOutputs ? options.processOutputs(output) : output),
      );
      if (options.attributes)
        span.setAttributes(options.attributes(input, output));
      return output;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message.slice(0, 300) : "",
      });
      throw error;
    } finally {
      span.end();
    }
  };
}

/** Cloud Run throttles CPU after the response, so export pending spans first. */
export async function flushTraces() {
  if (!provider) return;
  try {
    await withDeadline(() => provider!.forceFlush(), 3000);
  } catch {
    logEvent("WARNING", "cloud_trace_flush_failed");
  }
}

/** One JSON line per event; Cloud Logging parses severity and links the trace. */
export function logEvent(
  severity: "INFO" | "WARNING" | "ERROR",
  event: string,
  fields: Record<string, unknown> = {},
) {
  const context = current.getStore()?.spanContext();
  console.log(
    JSON.stringify({
      severity,
      message: event,
      ...fields,
      ...(context && {
        "logging.googleapis.com/trace": `projects/${process.env.GOOGLE_CLOUD_PROJECT}/traces/${context.traceId}`,
        "logging.googleapis.com/spanId": context.spanId,
      }),
    }),
  );
}
