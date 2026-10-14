import type { Circuit } from "./circuit";

// Local structural types keep the optional Web Serial API out of the global DOM types.
export interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
export interface SerialApi {
  requestPort(): Promise<SerialPortLike>;
}
export type BuildStage =
  "connecting" | "checking" | "uploading" | "compiling" | "saving" | "running";
export const stageLabels: Record<BuildStage, string> = {
  connecting: "ボードに接続中",
  checking: "実行環境を確認中",
  uploading: "コードを転送中",
  compiling: "ボード上でビルド中",
  saving: "main.pyを保存中",
  running: "実行中・ログを受信中",
};
export function serialApi(): SerialApi | undefined {
  if (typeof navigator === "undefined" || !globalThis.isSecureContext) return;
  return (navigator as Navigator & { serial?: SerialApi }).serial;
}
export function serialUnsupported(circuit: Circuit): string | undefined {
  if (circuit.board === "raspberry-pi")
    return "Raspberry Pi OSのコードはUSBシリアルから直接ビルドできません。ESP32またはPicoを選択してください。";
  if (circuit.firmwareLanguage !== "python")
    return "この機能はMicroPython専用です。C++はコードをダウンロードして対応する開発環境でビルドしてください。";
  if (
    !circuit.firmware
      .split("\n")
      .some((line) => line.trim() && !line.trim().startsWith("#"))
  )
    return "この回路には実行するコードがありません。";
  if (circuit.firmware.length > 12000)
    return "コードが長すぎます。12000文字以内にしてください。";
}

/** A single read pump handles fragmented UTF-8, deadlines, unplugging and cancellation. */
export class MicroPythonSerial {
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  private pump: Promise<void> | undefined;
  private pending = "";
  private failure: Error | undefined;
  private wake: (() => void) | undefined;
  private opened = false;
  private closing: Promise<void> | undefined;
  private readonly onAbort = () => {
    void this.close();
  };
  constructor(
    private port: SerialPortLike,
    private signal: AbortSignal,
  ) {}

  async open() {
    this.signal.throwIfAborted();
    await this.port.open({ baudRate: 115200 });
    this.opened = true;
    if (this.signal.aborted) {
      await this.close();
      this.signal.throwIfAborted();
    }
    if (!this.port.readable || !this.port.writable) {
      await this.close();
      throw new Error("シリアルポートを開けませんでした。");
    }
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    const reader = this.reader;
    this.pump = (async () => {
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) throw new Error("ボードとの接続が切れました。");
          this.pending += decoder.decode(value, { stream: true });
          if (this.pending.length > 65536)
            throw new Error("受信ログが多すぎます。出力頻度を下げてください。");
          this.wake?.();
        }
      } catch (error) {
        this.failure =
          error instanceof Error ? error : new Error(String(error));
        this.wake?.();
      } finally {
        reader.releaseLock();
      }
    })();
    this.signal.addEventListener("abort", this.onAbort, { once: true });
  }
  private async changed(timeout: number) {
    this.signal.throwIfAborted();
    if (this.failure) throw this.failure;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.wake = undefined;
        reject(
          new Error(
            "ボードの応答がタイムアウトしました。MicroPythonの導入と接続を確認してください。",
          ),
        );
      }, timeout);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
    });
    this.signal.throwIfAborted();
    if (this.failure) throw this.failure;
  }
  async write(value: string | Uint8Array) {
    this.signal.throwIfAborted();
    if (!this.writer) throw new Error("シリアルポートが接続されていません。");
    await this.writer.write(
      typeof value === "string" ? new TextEncoder().encode(value) : value,
    );
  }
  private async until(delimiter: string, timeout = 10000): Promise<string> {
    const deadline = Date.now() + timeout;
    while (true) {
      this.signal.throwIfAborted();
      const index = this.pending.indexOf(delimiter);
      if (index >= 0) {
        const result = this.pending.slice(0, index);
        this.pending = this.pending.slice(index + delimiter.length);
        return result;
      }
      await this.changed(Math.max(1, deadline - Date.now()));
    }
  }
  async enter() {
    // Interrupt the running application, then enter raw REPL (never a Linux shell).
    await this.write("\r\x03\x03\x01");
    await this.until("raw REPL; CTRL-B to exit\r\n>");
  }
  private async submit(source: string) {
    const bytes = new TextEncoder().encode(source);
    // Conservative raw-REPL fallback pacing. Individual upload commands are small.
    for (let start = 0; start < bytes.length; start += 128) {
      await this.write(bytes.slice(start, start + 128));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await this.write("\x04");
    const acknowledgment = await this.until("OK");
    if (acknowledgment.trim())
      throw new Error("MicroPythonから予期しない応答が返されました。");
  }
  async execute(source: string): Promise<string> {
    await this.submit(source);
    const stdout = await this.until("\x04");
    const stderr = await this.until("\x04");
    await this.until(">");
    if (stderr.trim()) throw new Error(stderr.trim());
    return stdout;
  }
  async deploy(
    circuit: Circuit,
    onStage: (stage: BuildStage) => void,
    onLog: (text: string) => void,
  ) {
    const unsupported = serialUnsupported(circuit);
    if (unsupported) throw new Error(unsupported);
    onStage("checking");
    await this.enter();
    const identity = await this.execute(
      "import sys\nprint(sys.implementation.name + ':' + sys.platform)",
    );
    const expected =
      circuit.board === "esp32" ? "micropython:esp32" : "micropython:rp2";
    if (identity.trim() !== expected)
      throw new Error(
        "選択した基板と接続先の実行環境が一致しません。MicroPythonと基板を確認してください。",
      );
    onLog(identity.trim() + "\n");
    onStage("uploading");
    await this.execute("__bb_file = open('.breadberry-main.tmp', 'wb')");
    const source = new TextEncoder().encode(circuit.firmware);
    try {
      for (let i = 0; i < source.length; i += 256) {
        const hex = Array.from(source.slice(i, i + 256), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        await this.execute(
          `import binascii\n__bb_file.write(binascii.unhexlify('${hex}'))`,
        );
      }
    } finally {
      if (!this.signal.aborted && !this.failure)
        await this.execute("__bb_file.close()");
    }
    onStage("compiling");
    // Compile without running imports or activating GPIOs. main.py is untouched on errors.
    await this.execute(
      "with open('.breadberry-main.tmp') as __bb_file:\n __bb_source = __bb_file.read()\n__bb_code = compile(__bb_source, 'main.py', 'exec')\ndel __bb_code, __bb_source",
    );
    onStage("saving");
    await this.execute(
      "import os\n__bb_backup = 'main.py' in os.listdir()\nif __bb_backup:\n if 'main.py.breadberry.bak' in os.listdir():\n  os.remove('main.py.breadberry.bak')\n os.rename('main.py', 'main.py.breadberry.bak')\ntry:\n os.rename('.breadberry-main.tmp', 'main.py')\nexcept:\n if __bb_backup:\n  os.rename('main.py.breadberry.bak', 'main.py')\n raise",
    );
    await this.submit(
      "with open('main.py') as __bb_file:\n __bb_source = __bb_file.read()\nexec(compile(__bb_source, 'main.py', 'exec'), {'__name__': '__main__'})",
    );
    onStage("running");
    // Raw REPL frames separate ordinary stdout from actual exceptions. Infinite-loop
    // programs remain monitored until disconnect; a quiet program is not a timeout.
    let stderr = false;
    let errorText = "";
    while (true) {
      this.signal.throwIfAborted();
      if (!this.pending) {
        await this.changed(2147483647);
        continue;
      }
      const delimiter = this.pending.indexOf("\x04");
      const chunk =
        delimiter < 0 ? this.pending : this.pending.slice(0, delimiter);
      this.pending = delimiter < 0 ? "" : this.pending.slice(delimiter + 1);
      if (stderr) errorText = (errorText + chunk).slice(-16000);
      else if (chunk) onLog(chunk);
      if (delimiter >= 0) {
        if (stderr) {
          await this.until(">");
          if (errorText.trim()) throw new Error(errorText.trim());
          return;
        }
        stderr = true;
      }
    }
  }
  close(): Promise<void> {
    return (this.closing ??= (async () => {
      this.signal.removeEventListener("abort", this.onAbort);
      this.failure ??= new Error("ボードとの接続を終了しました。");
      this.wake?.();
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        await this.pump;
      }
      this.writer?.releaseLock();
      this.writer = undefined;
      if (this.opened) {
        await this.port.close().catch(() => {});
        this.opened = false;
      }
    })());
  }
}
