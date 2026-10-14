import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  flashMicroPython,
  parseBootloaderInfo,
  picoFirmware,
  validateUf2,
  type DirectoryHandleLike,
  type FlashStage,
} from "../../src/lib/pico-flash";

const rp2040Info =
  "UF2 Bootloader v3.0\r\nModel: Raspberry Pi RP2\r\nBoard-ID: RPI-RP2\r\n";
const rp2350Info =
  "UF2 Bootloader v1.0\r\nModel: Raspberry Pi RP2350\r\nBoard-ID: RP2350\r\n";

function uf2(blocks: number) {
  const bytes = new Uint8Array(blocks * 512);
  const view = new DataView(bytes.buffer);
  for (let offset = 0; offset < bytes.length; offset += 512) {
    view.setUint32(offset, 0x0a324655, true);
    view.setUint32(offset + 4, 0x9e5d5157, true);
    view.setUint32(offset + 508, 0x0ab16f30, true);
  }
  return bytes;
}

function drive(
  info: string | undefined,
  options: { rebootOnClose?: boolean } = {},
) {
  const written: Record<string, Uint8Array<ArrayBuffer>> = {};
  const handle: DirectoryHandleLike = {
    name: "RPI-RP2",
    async getFileHandle(name, opts) {
      if (name === "INFO_UF2.TXT" && info !== undefined)
        return {
          getFile: async () => new Blob([info]),
          createWritable: async () => assert.fail("INFO_UF2.TXT is read-only"),
        };
      if (!opts?.create) throw new DOMException("missing", "NotFoundError");
      return {
        getFile: async () => new Blob([written[name] ?? new Uint8Array()]),
        createWritable: async () => ({
          async write(data) {
            written[name] = new Uint8Array(data as Uint8Array);
          },
          async close() {
            if (options.rebootOnClose)
              throw new DOMException("gone", "NotFoundError");
          },
        }),
      };
    },
  };
  return { handle, written };
}

test("bootloader info identifies RP2040 and RP2350 Picos", () => {
  assert.equal(parseBootloaderInfo(rp2040Info), "RPI-RP2");
  assert.equal(parseBootloaderInfo(rp2350Info), "RP2350");
  assert.equal(parseBootloaderInfo("Board-ID: ESP32-S2\n"), undefined);
});

test("bundled MicroPython images are complete UF2 files", () => {
  for (const { url } of Object.values(picoFirmware))
    validateUf2(readFileSync(`public${url}`));
  const broken = uf2(2);
  broken[512] = 0;
  assert.throws(() => validateUf2(broken), /破損/);
  assert.throws(() => validateUf2(uf2(1).slice(0, 500)), /破損/);
});

test("MicroPython is written to the matching Pico drive", async () => {
  for (const [info, expected] of [
    [rp2040Info, "RPI-RP2"],
    [rp2350Info, "RP2350"],
  ] as const) {
    const { handle, written } = drive(info, { rebootOnClose: true });
    const stages: FlashStage[] = [];
    const urls: string[] = [];
    const image = uf2(3);
    const result = await flashMicroPython(
      handle,
      new AbortController().signal,
      (stage) => stages.push(stage),
      async (url) => {
        urls.push(url);
        return image.buffer;
      },
    );
    assert.equal(result, expected);
    assert.deepEqual(urls, [picoFirmware[expected].url]);
    assert.deepEqual(stages, ["detecting", "downloading", "writing"]);
    assert.deepEqual(written["micropython.uf2"], image);
  }
});

test("non-Pico folders and corrupt images are never written", async () => {
  const signal = new AbortController().signal;
  const load = async () => uf2(1).buffer;
  const folder = drive(undefined);
  await assert.rejects(
    flashMicroPython(folder.handle, signal, () => {}, load),
    /Picoのドライブではありません/,
  );
  const other = drive("Board-ID: ESP32-S3\n");
  await assert.rejects(
    flashMicroPython(other.handle, signal, () => {}, load),
    /対応していないボード/,
  );
  const corrupt = drive(rp2040Info);
  await assert.rejects(
    flashMicroPython(
      corrupt.handle,
      signal,
      () => {},
      async () => new Uint8Array(512).buffer,
    ),
    /破損/,
  );
  for (const { written } of [folder, other, corrupt])
    assert.deepEqual(written, {});
});
