"use client";
import { useEffect, useRef, useState } from "react";
import {
  Cpu,
  Download,
  LoaderCircle,
  Sparkles,
  Unplug,
  Usb,
  X,
} from "lucide-react";
import { boards, validateCircuit, type Circuit } from "@/lib/circuit";
import { responseError } from "@/lib/api-error";
import { firmwareAnalysisSchema, type FirmwareAnalysis } from "@/lib/firmware";
import {
  MicroPythonSerial,
  serialApi,
  serialUnsupported,
  stageLabels,
  type BuildStage,
  type SerialApi,
  type SerialPortLike,
} from "@/lib/serial";
import {
  PICO_USB_VENDOR_ID,
  directoryPicker,
  flashMicroPython,
  flashStageLabels,
  micropythonVersion,
  picoFirmware,
  type FlashStage,
} from "@/lib/pico-flash";
import { usePreferences } from "./preferences";

type Failure = {
  circuit: Circuit;
  stage: BuildStage | "feedback";
  log: string;
  feedback?: string;
};
const MAX_AUTO_REPAIRS = 3;

/** Resolves with a newly attached, already-authorized Pico serial port, if one appears. */
async function waitForPico(
  api: SerialApi,
  known: Set<SerialPortLike>,
  signal: AbortSignal,
  timeout = 20000,
) {
  const deadline = Date.now() + timeout;
  while (api.getPorts && !signal.aborted && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const port = (await api.getPorts().catch(() => [])).find(
      (port) =>
        !known.has(port) && port.getInfo?.().usbVendorId === PICO_USB_VENDOR_ID,
    );
    if (port && !signal.aborted) {
      // Give MicroPython a moment to finish booting before interrupting it.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return signal.aborted ? undefined : port;
    }
  }
}
export default function SerialBuild({
  circuit,
  prepareSession,
  onFirmware,
  onBuilt,
  onClose,
}: {
  circuit: Circuit;
  prepareSession: () => Promise<void>;
  onFirmware: (source: string) => void;
  /** Called once the code has compiled on the board and main.py is saved. */
  onBuilt?: () => void;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const task = useRef<AbortController | null>(null);
  const analysisTask = useRef<AbortController | null>(null);
  const waiting = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const logs = useRef("");
  const latestCircuit = useRef(circuit);
  latestCircuit.current = circuit;
  const lastPort = useRef<SerialPortLike | undefined>(undefined);
  const buildFinished = useRef<Promise<void>>(Promise.resolve());
  const lastStage = useRef<BuildStage | null>(null);
  const attemptedSources = useRef(new Set<string>());
  const [repairMode, setRepairMode] = useState<"confirm" | "auto">("confirm");
  const mode = useRef(repairMode);
  mode.current = repairMode;
  const [repairCount, setRepairCount] = useState(0);
  const [repairNotice, setRepairNotice] = useState("");
  const [feedback, setFeedback] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const feedbackPending = useRef(false);
  const [log, setLog] = useState("");
  const [stage, setStage] = useState<BuildStage | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [analysis, setAnalysis] = useState<FirmwareAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [supported, setSupported] = useState(false);
  const [canFlash, setCanFlash] = useState(false);
  const [flashStage, setFlashStage] = useState<FlashStage | null>(null);
  const unsupported = serialUnsupported(circuit);
  useEffect(() => {
    mounted.current = true;
    setSupported(Boolean(serialApi()));
    setCanFlash(Boolean(directoryPicker()));
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      task.current?.abort();
      analysisTask.current?.abort();
      waiting.current?.abort();
    };
  }, []);
  function append(text: string) {
    logs.current = (logs.current + text).slice(-16000);
    if (mounted.current) setLog(logs.current);
  }
  async function analyze(error: Failure, attempt = 0, port?: SerialPortLike) {
    if (analysisTask.current || task.current || !mounted.current) return;
    const controller = new AbortController();
    analysisTask.current = controller;
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysis(null);
    setFailure(error);
    setRepairNotice("");
    let correction: string | undefined;
    try {
      await prepareSession();
      controller.signal.throwIfAborted();
      const response = await fetch("/api/firmware/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...error, locale }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(90000),
        ]),
      });
      if (!response.ok)
        throw await responseError(
          response,
          "AIによるエラー解析に失敗しました。",
        );
      const result = firmwareAnalysisSchema.parse(await response.json());
      if (!controller.signal.aborted && mounted.current) {
        if (
          JSON.stringify(latestCircuit.current) !==
          JSON.stringify(error.circuit)
        ) {
          setAnalysisError(
            t(
              "解析中にコードまたは回路が変更されました。もう一度解析してください。",
            ),
          );
          return;
        }
        if (
          !result.firmware.trim() ||
          result.firmware.trim() === error.circuit.firmware.trim()
        )
          result.firmware = "";
        setAnalysis(result);
        if (result.firmware && mode.current === "auto") {
          if (
            attempt >= MAX_AUTO_REPAIRS ||
            attemptedSources.current.has(result.firmware.trim())
          ) {
            setRepairNotice(
              t("自動修復を停止しました。修正案とログを確認してください。"),
            );
          } else {
            correction = result.firmware;
          }
        } else if (!result.firmware) {
          setRepairNotice(
            t("コードの変更案はありません。AIの対処方法を確認してください。"),
          );
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && mounted.current)
        setAnalysisError(
          error instanceof Error
            ? error.message
            : t("AIによるエラー解析に失敗しました。"),
        );
    } finally {
      analysisTask.current = null;
      if (mounted.current) setAnalyzing(false);
    }
    if (
      correction &&
      mounted.current &&
      !controller.signal.aborted &&
      mode.current === "auto"
    ) {
      setRepairCount(attempt + 1);
      if (port) {
        await run(correction, true, port, attempt + 1, error.feedback);
      } else {
        // Never open the browser's port picker after an asynchronous AI request.
        onFirmware(correction);
        setAnalysis(null);
        setRepairNotice(
          t("修正コードを反映しました。接続してビルド・実行してください。"),
        );
      }
    }
  }
  async function run(
    source = circuit.firmware,
    apply = false,
    known?: SerialPortLike,
    attempt = 0,
    feedbackContext?: string,
  ) {
    // requestPort must run in the original click handler, before network awaits.
    const api = serialApi();
    if (!api || task.current || analysisTask.current) return;
    waiting.current?.abort();
    const snapshot = { ...latestCircuit.current, firmware: source };
    try {
      const unavailable = serialUnsupported(snapshot);
      if (unavailable) throw new Error(t(unavailable));
      validateCircuit(snapshot);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t("回路データを確認してください。"),
      );
      return;
    }
    const controller = new AbortController();
    task.current = controller;
    let finishBuild!: () => void;
    buildFinished.current = new Promise<void>((resolve) => {
      finishBuild = resolve;
    });
    if (attempt === 0) {
      attemptedSources.current.clear();
      setRepairCount(0);
    }
    if (!known) lastPort.current = undefined;
    attemptedSources.current.add(source.trim());
    setRepairNotice("");
    setActive(true);
    setFailure(null);
    setAnalysis(null);
    setAnalysisError("");
    setStatus("");
    logs.current = "";
    setLog("");
    let currentStage: BuildStage = "connecting";
    lastStage.current = currentStage;
    setStage(currentStage);
    let connection: MicroPythonSerial | undefined;
    let failed: Failure | undefined;
    try {
      const port = known ?? (await api.requestPort());
      lastPort.current = port;
      controller.signal.throwIfAborted();
      if (apply) onFirmware(source);
      connection = new MicroPythonSerial(port, controller.signal);
      await connection.open();
      await connection.deploy(
        snapshot,
        (next) => {
          currentStage = next;
          lastStage.current = next;
          if (mounted.current) setStage(next);
          append(`[${t(stageLabels[next])}]\n`);
          // "running" follows a successful compile and save; the program may never exit.
          if (next === "running") onBuilt?.();
        },
        append,
      );
      if (mounted.current)
        setStatus(t("ビルド・保存・プログラムの実行が完了しました。"));
    } catch (error) {
      if (controller.signal.aborted) {
        if (mounted.current)
          setStatus(
            t(
              "接続を終了しました。ボード上のプログラムは停止しない場合があります。",
            ),
          );
      } else if (
        error instanceof DOMException &&
        error.name === "NotFoundError"
      ) {
        if (mounted.current) setStatus(t("接続先の選択をキャンセルしました。"));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        append(`\n${t("エラー")}: ${t(message)}\n`);
        failed = {
          circuit: snapshot,
          stage: currentStage,
          log: logs.current,
          feedback: feedbackContext,
        };
        if (mounted.current) {
          setFailure(failed);
          setStatus(t("ビルドまたは実行に失敗しました。"));
        }
      }
    } finally {
      await connection?.close();
      task.current = null;
      if (mounted.current) {
        setActive(false);
        setStage(null);
      }
      finishBuild();
    }
    if (
      failed &&
      autoAnalyze &&
      mounted.current &&
      !controller.signal.aborted &&
      !feedbackPending.current
    )
      await analyze(failed, attempt, lastPort.current);
  }
  async function submitFeedback() {
    if (!feedback.trim() || analysisTask.current || feedbackPending.current)
      return;
    feedbackPending.current = true;
    waiting.current?.abort();
    setSendingFeedback(true);
    const evidence: Failure = {
      circuit: latestCircuit.current,
      stage: lastStage.current ?? "feedback",
      log: logs.current,
      feedback: feedback.trim(),
    };
    try {
      // Stop monitoring and release the port before an approved or automatic rebuild.
      task.current?.abort();
      await buildFinished.current;
      if (!mounted.current) return;
    } finally {
      feedbackPending.current = false;
      if (mounted.current) setSendingFeedback(false);
    }
    if (!mounted.current) return;
    attemptedSources.current = new Set([evidence.circuit.firmware.trim()]);
    setRepairCount(0);
    await analyze(evidence, 0, lastPort.current);
  }
  function applyCorrection() {
    if (!analysis?.firmware || !failure) return;
    if (
      JSON.stringify(latestCircuit.current) !== JSON.stringify(failure.circuit)
    ) {
      setAnalysisError(
        t(
          "解析中にコードまたは回路が変更されました。もう一度解析してください。",
        ),
      );
      return;
    }
    void run(analysis.firmware, true, undefined, 0, failure.feedback);
  }
  async function installMicroPython() {
    // showDirectoryPicker needs the click's user activation, so it runs first.
    const picker = directoryPicker();
    const api = serialApi();
    if (!picker || task.current || analysisTask.current) return;
    waiting.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    setActive(true);
    setFailure(null);
    setAnalysis(null);
    setAnalysisError("");
    setStatus("");
    logs.current = "";
    setLog("");
    let flashed = false;
    let known = new Set<SerialPortLike>();
    try {
      const drive = await picker({ id: "breadberry-pico", mode: "readwrite" });
      // Ports that already exist belong to other boards, never the rebooting Pico.
      known = new Set(await api?.getPorts?.().catch(() => []));
      const bootloader = await flashMicroPython(
        drive,
        controller.signal,
        (next) => {
          if (mounted.current) setFlashStage(next);
          append(`[${t(flashStageLabels[next])}]\n`);
        },
      );
      append(
        `MicroPython ${micropythonVersion} → ${picoFirmware[bootloader].name}\n`,
      );
      flashed = true;
    } catch (error) {
      if (controller.signal.aborted) {
        if (mounted.current) setStatus(t("書き込みを中止しました。"));
      } else if (error instanceof DOMException && error.name === "AbortError") {
        if (mounted.current)
          setStatus(t("ドライブの選択をキャンセルしました。"));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        append(`\n${t("エラー")}: ${t(message)}\n`);
        if (mounted.current)
          setStatus(t("MicroPythonの書き込みに失敗しました。"));
      }
    } finally {
      task.current = null;
      if (mounted.current) {
        setActive(false);
        setFlashStage(null);
      }
    }
    if (!flashed || !mounted.current) return;
    setStatus(
      t(
        "MicroPythonを書き込みました。Picoの再起動後に「接続してビルド・実行」を押し、Picoのポートを選択してください。",
      ),
    );
    if (!api || unsupported) return;
    // A port authorized earlier reappears after reboot, so the build can continue unattended.
    const wait = new AbortController();
    waiting.current = wait;
    const port = await waitForPico(api, known, wait.signal);
    if (waiting.current === wait) waiting.current = null;
    if (port && mounted.current) await run(circuit.firmware, false, port);
  }
  function close() {
    mounted.current = false;
    task.current?.abort();
    analysisTask.current?.abort();
    waiting.current?.abort();
    dialog.current?.close();
    onClose();
  }
  function downloadLog() {
    const url = URL.createObjectURL(
      new Blob([log], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "breadberry-build.log";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <dialog
      ref={dialog}
      className="serial-dialog"
      aria-labelledby="serial-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">USB · WEB SERIAL</span>
          <h2 id="serial-title">{t("自動ビルド・実行")}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label={t("閉じる")}
        >
          <X size={20} />
        </button>
      </header>
      <p>
        {boards[circuit.board].name} ·{" "}
        {circuit.firmwareLanguage === "python" ? "main.py" : "sketch.ino"}
      </p>
      <p>
        {t(
          "ESP32／PicoをUSBで接続し、接続先を選ぶと、転送・ビルド・保存・実行を自動で行います。ESP32はMicroPython導入済みのものを使ってください。PicoはMicroPythonが入っていなくても下から導入できます。",
        )}
      </p>
      <p className="serial-note">
        {t(
          "現在のプログラムを中断し、main.pyを上書きします。元のファイルはmain.py.breadberry.bakに保存します。必要な外部ドライバーは事前に導入してください。",
        )}
      </p>
      {!supported && (
        <p role="alert">
          {t(
            "Web Serialに対応したPC版Chrome／Edgeで、HTTPSまたはlocalhostから開いてください。",
          )}
        </p>
      )}
      {unsupported && <p role="alert">{t(unsupported)}</p>}
      {circuit.board === "pico" && (
        <section className="serial-flash">
          <h3>
            <Cpu size={18} />
            {t("MicroPythonが入っていないPico")}
          </h3>
          <p className="serial-note">
            {t(
              "新品のPicoはそのままUSB接続、書き込み済みのPicoはBOOTSELボタンを押しながら接続すると、RPI-RP2（Pico 2はRP2350）ドライブが現れます。「MicroPythonを書き込む」でそのドライブを選ぶと、MicroPython {0}を書き込みます。",
              [micropythonVersion],
            )}
          </p>
          <div className="serial-actions">
            <button
              disabled={!canFlash || active || analyzing || sendingFeedback}
              onClick={() => void installMicroPython()}
            >
              <Cpu size={16} />
              {t("MicroPythonを書き込む")}
            </button>
            {Object.entries(picoFirmware).map(([id, firmware]) => (
              <a
                key={id}
                className="serial-download"
                href={firmware.url}
                download
              >
                <Download size={16} />
                {t("{0}用UF2", [firmware.name])}
              </a>
            ))}
          </div>
          {!canFlash && (
            <p className="serial-note">
              {t(
                "このブラウザはドライブへの直接書き込みに対応していません。UF2をダウンロードし、RPI-RP2（RP2350）ドライブへドラッグしてください。",
              )}
            </p>
          )}
        </section>
      )}
      <label className="serial-option">
        <input
          type="checkbox"
          checked={autoAnalyze}
          disabled={active || analyzing}
          onChange={(event) => setAutoAnalyze(event.target.checked)}
        />
        {t("失敗したらAIで自動解析する（コード・回路・ログを送信）")}
      </label>
      <label className="serial-option">
        {t("AIによるコード変更")}
        <select
          aria-label={t("AIによるコード変更")}
          value={repairMode}
          onChange={(event) =>
            setRepairMode(event.target.value as "confirm" | "auto")
          }
        >
          <option value="confirm">{t("変更前に確認する")}</option>
          <option value="auto">{t("自動で修復する")}</option>
        </select>
      </label>
      <p className="serial-note">
        {t(
          "自動修復はコードを変更し、接続済みのボードで再ビルド・実行します。1回のビルドまたはフィードバックにつき最大{0}回です。",
          [MAX_AUTO_REPAIRS],
        )}
      </p>
      {repairCount > 0 && (
        <p className="serial-note">
          {t("自動修復: {0}/{1}回", [repairCount, MAX_AUTO_REPAIRS])}
        </p>
      )}
      <div className="serial-actions">
        <button
          className="serial-primary"
          disabled={
            !supported ||
            Boolean(unsupported) ||
            active ||
            analyzing ||
            sendingFeedback
          }
          onClick={() => void run()}
        >
          <Usb size={16} />
          {t("接続してビルド・実行")}
        </button>
        {active && (
          <button onClick={() => task.current?.abort()}>
            <Unplug size={16} />
            {t("切断")}
          </button>
        )}
        <button disabled={!log} onClick={downloadLog}>
          <Download size={16} />
          {t("ログを保存")}
        </button>
      </div>
      <p role="status" className="serial-status">
        {active && <LoaderCircle size={16} className="spin" />}
        {flashStage
          ? t(flashStageLabels[flashStage])
          : stage
            ? t(stageLabels[stage])
            : status || t("接続待ち")}
      </p>
      {stage === "running" && (
        <p className="serial-note">
          {t(
            "ビルド・保存済みです。実行ログを監視しています。切断してもボードは動作を続ける場合があります。",
          )}
        </p>
      )}
      <pre
        className="serial-log"
        aria-label={t("ビルド・実行ログ")}
        tabIndex={0}
      >
        {log || t("ここにビルド結果と実行ログが表示されます。")}
      </pre>
      <form
        className="serial-feedback"
        onSubmit={(event) => {
          event.preventDefault();
          void submitFeedback();
        }}
      >
        <label htmlFor="firmware-feedback">{t("動作のフィードバック")}</label>
        <textarea
          id="firmware-feedback"
          value={feedback}
          maxLength={4000}
          rows={3}
          disabled={analyzing || sendingFeedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder={t(
            "例: ビルドは成功しましたが、LEDの点滅が速すぎます。1秒間隔にしてください。",
          )}
        />
        <p className="serial-note">
          {t(
            "コード・回路・ログと一緒にAIへ送信します。実行ログの監視中でも送信できます。",
          )}
        </p>
        <button
          type="submit"
          disabled={
            !feedback.trim() ||
            Boolean(unsupported) ||
            analyzing ||
            sendingFeedback ||
            (active && stage !== "running")
          }
        >
          <Sparkles size={16} />
          {t("フィードバックから修正案を作成")}
        </button>
      </form>
      {repairNotice && <p role="status">{repairNotice}</p>}
      {failure && (
        <section className="serial-analysis">
          <h3>
            <Sparkles size={18} />
            {t("AIによるファームウェア修復")}
          </h3>
          <button
            disabled={analyzing || active}
            onClick={() => void analyze(failure, repairCount, lastPort.current)}
          >
            {analyzing ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            {t(analyzing ? "修正案を作成中" : "AIで再解析")}
          </button>
          {analyzing && (
            <button onClick={() => analysisTask.current?.abort()}>
              {t("解析を中止")}
            </button>
          )}
          {analysisError && <p role="alert">{t(analysisError)}</p>}
          {analysis && (
            <>
              <p className="serial-cause">{analysis.cause}</p>
              <ol>
                {analysis.steps.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
              {analysis.firmware && (
                <>
                  <p>{t("この修正コードを反映してよいですか？")}</p>
                  <details>
                    <summary>{t("修正コードを確認")}</summary>
                    <pre className="serial-log">
                      <code>{analysis.firmware}</code>
                    </pre>
                  </details>
                  <button
                    className="serial-primary"
                    disabled={
                      !supported ||
                      Boolean(unsupported) ||
                      active ||
                      analyzing ||
                      sendingFeedback
                    }
                    onClick={applyCorrection}
                  >
                    {t("修正を反映して再ビルド・実行")}
                  </button>
                  <button
                    disabled={active || analyzing}
                    onClick={() => setAnalysis(null)}
                  >
                    {t("変更しない")}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}
    </dialog>
  );
}
