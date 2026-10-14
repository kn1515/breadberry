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

type Failure = { circuit: Circuit; stage: BuildStage; log: string };

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
  async function analyze(error: Failure) {
    if (analysisTask.current) return;
    const controller = new AbortController();
    analysisTask.current = controller;
    setAnalyzing(true);
    setAnalysisError("");
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
      if (!controller.signal.aborted && mounted.current) setAnalysis(result);
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
  }
  async function run(
    source = circuit.firmware,
    apply = false,
    known?: SerialPortLike,
  ) {
    // requestPort must run in the original click handler, before network awaits.
    const api = serialApi();
    if (!api || task.current || analysisTask.current) return;
    waiting.current?.abort();
    const snapshot = { ...circuit, firmware: source };
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
    setActive(true);
    setFailure(null);
    setAnalysis(null);
    setAnalysisError("");
    setStatus("");
    logs.current = "";
    setLog("");
    let currentStage: BuildStage = "connecting";
    setStage(currentStage);
    let connection: MicroPythonSerial | undefined;
    let failed: Failure | undefined;
    try {
      const port = known ?? (await api.requestPort());
      controller.signal.throwIfAborted();
      if (apply) onFirmware(source);
      connection = new MicroPythonSerial(port, controller.signal);
      await connection.open();
      await connection.deploy(
        snapshot,
        (next) => {
          currentStage = next;
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
        failed = { circuit: snapshot, stage: currentStage, log: logs.current };
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
    }
    if (failed && autoAnalyze && mounted.current && !controller.signal.aborted)
      await analyze(failed);
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
              disabled={!canFlash || active || analyzing}
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
      <div className="serial-actions">
        <button
          className="serial-primary"
          disabled={!supported || Boolean(unsupported) || active || analyzing}
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
      {failure && (
        <section className="serial-analysis">
          <h3>
            <Sparkles size={18} />
            {t("AIエラー解析")}
          </h3>
          <button
            disabled={analyzing || active}
            onClick={() => void analyze(failure)}
          >
            {analyzing ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            {t(analyzing ? "エラーを解析中" : "AIでエラーを解析")}
          </button>
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
                  <details>
                    <summary>{t("修正コードを確認")}</summary>
                    <pre className="serial-log">
                      <code>{analysis.firmware}</code>
                    </pre>
                  </details>
                  <button
                    className="serial-primary"
                    disabled={active || analyzing}
                    onClick={() => void run(analysis.firmware, true)}
                  >
                    {t("修正を反映して再ビルド・実行")}
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
