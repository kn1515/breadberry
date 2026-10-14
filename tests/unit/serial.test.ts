import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  MicroPythonSerial,
  serialUnsupported,
  type SerialPortLike,
  type BuildStage,
} from "../../src/lib/serial";

function board(
  options: {
    platform?: string;
    compileError?: boolean;
    runtimeError?: boolean;
    running?: boolean;
    unplug?: boolean;
  } = {},
) {
  let receive!: ReadableStreamDefaultController<Uint8Array>;
  let command = "";
  const commands: string[] = [];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let closed = false;
  let canceled = false;
  const send = (text: string) => {
    // Every byte is a distinct read, including multi-byte UTF-8 and frame delimiters.
    for (const byte of encoder.encode(text))
      receive.enqueue(Uint8Array.of(byte));
  };
  const port: SerialPortLike = {
    readable: new ReadableStream({
      start(c) {
        receive = c;
      },
      cancel() {
        canceled = true;
      },
    }),
    writable: new WritableStream({
      write(bytes) {
        const text = decoder.decode(bytes);
        if (text === "\r\x03\x03\x01") {
          if (options.unplug) {
            receive.error(new Error("unplugged"));
            return;
          }
          send("\r\nraw REPL; CTRL-B to exit\r\n>");
        } else if (text === "\x04") {
          commands.push(command);
          let stdout = "";
          let stderr = "";
          if (command.includes("sys.implementation"))
            stdout = `micropython:${options.platform ?? "esp32"}\r\n`;
          if (command.includes("__bb_code = compile") && options.compileError)
            stderr =
              "Traceback (most recent call last):\r\nSyntaxError: invalid syntax\r\n";
          if (command.includes("exec(compile")) {
            if (options.running) {
              command = "";
              send("OK稼働中\r\n");
              return;
            }
            if (options.runtimeError)
              stderr =
                "Traceback (most recent call last):\r\nImportError: no module named 'sensor'\r\n";
            else stdout = "日本語ログ\r\nTraceback is only printed text\r\n";
          }
          command = "";
          send(`OK${stdout}\x04${stderr}\x04>`);
        } else command += text;
      },
    }),
    async open() {},
    async close() {
      assert.equal(port.readable!.locked, false);
      assert.equal(port.writable!.locked, false);
      closed = true;
    },
  };
  return { port, commands, closed: () => closed, canceled: () => canceled };
}

test("build verifies board, uploads UTF-8, compiles before saving, monitors actual stderr, and releases locks", async () => {
  const mock = board();
  const connection = new MicroPythonSerial(
    mock.port,
    new AbortController().signal,
  );
  const circuit = {
    ...demoCircuit("esp32", "led"),
    firmware: "print('こんにちは')",
  };
  const stages: BuildStage[] = [];
  let log = "";
  try {
    await connection.open();
    await connection.deploy(
      circuit,
      (s) => stages.push(s),
      (s) => {
        log += s;
      },
    );
  } finally {
    await connection.close();
  }
  assert.deepEqual(stages, [
    "checking",
    "uploading",
    "compiling",
    "saving",
    "running",
  ]);
  assert.match(
    mock.commands.find((c) => c.includes("unhexlify"))!,
    new RegExp(Buffer.from(circuit.firmware).toString("hex")),
  );
  assert.ok(
    mock.commands.findIndex((c) => c.includes("__bb_code = compile")) <
      mock.commands.findIndex((c) => c.includes("os.rename")),
  );
  assert.match(log, /日本語ログ/);
  assert.equal(mock.closed(), true);
  assert.equal(mock.canceled(), true);
});

test("syntax failure leaves main.py unchanged and reports compiler stderr", async () => {
  const mock = board({ compileError: true });
  const connection = new MicroPythonSerial(
    mock.port,
    new AbortController().signal,
  );
  await connection.open();
  await assert.rejects(
    connection.deploy(
      demoCircuit("esp32", "led"),
      () => {},
      () => {},
    ),
    /SyntaxError/,
  );
  await connection.close();
  assert.equal(
    mock.commands.some(
      (c) => c.includes("os.rename") || c.includes("exec(compile"),
    ),
    false,
  );
});

test("runtime import failure is reported after a successful compile and save", async () => {
  const mock = board({ runtimeError: true });
  const connection = new MicroPythonSerial(
    mock.port,
    new AbortController().signal,
  );
  await connection.open();
  await assert.rejects(
    connection.deploy(
      demoCircuit("esp32", "led"),
      () => {},
      () => {},
    ),
    /ImportError/,
  );
  await connection.close();
  assert.ok(mock.commands.some((c) => c.includes("os.rename")));
});

test("board mismatch prevents any file write", async () => {
  const mock = board({ platform: "rp2" });
  const connection = new MicroPythonSerial(
    mock.port,
    new AbortController().signal,
  );
  await connection.open();
  await assert.rejects(
    connection.deploy(
      demoCircuit("esp32", "led"),
      () => {},
      () => {},
    ),
    /一致しません/,
  );
  await connection.close();
  assert.equal(mock.commands.length, 1);
});

test("Pico is identified as rp2 and can build", async () => {
  const mock = board({ platform: "rp2" });
  const connection = new MicroPythonSerial(
    mock.port,
    new AbortController().signal,
  );
  await connection.open();
  await connection.deploy(
    demoCircuit("pico", "led"),
    () => {},
    () => {},
  );
  await connection.close();
  assert.ok(mock.commands.some((c) => c.includes("exec(compile")));
});

test("canceling a long-running firmware monitor releases both stream locks", async () => {
  const mock = board({ running: true });
  const abort = new AbortController();
  const connection = new MicroPythonSerial(mock.port, abort.signal);
  await connection.open();
  let output = "";
  await assert.rejects(
    connection.deploy(
      demoCircuit("esp32", "led"),
      () => {},
      (s) => {
        output += s;
        if (output.includes("稼働中")) abort.abort();
      },
    ),
    { name: "AbortError" },
  );
  await connection.close();
  assert.equal(mock.closed(), true);
});

test("USB disconnect rejects a pending handshake and closes port", async () => {
  const mock = board({ unplug: true });
  const connection = new MicroPythonSerial(
    mock.port,
    new AbortController().signal,
  );
  await connection.open();
  await assert.rejects(connection.enter(), /unplugged/);
  await connection.close();
  assert.equal(mock.closed(), true);
});

test("unsupported Linux, C++ and code-free circuits are explicitly blocked", () => {
  assert.match(
    serialUnsupported(demoCircuit("raspberry-pi", "led"))!,
    /Raspberry Pi OS/,
  );
  assert.match(
    serialUnsupported({
      ...demoCircuit("esp32", "led"),
      firmwareLanguage: "cpp",
    })!,
    /C\+\+/,
  );
  assert.match(
    serialUnsupported(demoCircuit("esp32", "cpu"))!,
    /実行するコードがありません/,
  );
});
