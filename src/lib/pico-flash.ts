// Installs MicroPython on a Pico in BOOTSEL mode by copying a UF2 image to its
// USB drive, the same as dragging the file in a file manager. A blank Pico
// starts in BOOTSEL mode; a programmed one does so when BOOTSEL is held at plug-in.

// Local structural types keep the optional File System Access API out of the global DOM types.
export interface WritableFileLike {
  write(data: BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
export interface DirectoryHandleLike {
  name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<{
    getFile(): Promise<Blob>;
    createWritable(): Promise<WritableFileLike>;
  }>;
}
type DirectoryPicker = (options?: {
  id?: string;
  mode?: "read" | "readwrite";
}) => Promise<DirectoryHandleLike>;

export const micropythonVersion = "v1.29.0";
// Official micropython.org builds, served from /public so flashing needs no third-party fetch.
export const picoFirmware = {
  "RPI-RP2": {
    name: "Raspberry Pi Pico / Pico H (RP2040)",
    url: "/firmware/RPI_PICO-20260824-v1.29.0.uf2",
  },
  RP2350: {
    name: "Raspberry Pi Pico 2 (RP2350)",
    url: "/firmware/RPI_PICO2-20260824-v1.29.0.uf2",
  },
} as const;
export type PicoBootloader = keyof typeof picoFirmware;
export const PICO_USB_VENDOR_ID = 0x2e8a;

export function directoryPicker(): DirectoryPicker | undefined {
  if (typeof window === "undefined" || !globalThis.isSecureContext) return;
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker })
    .showDirectoryPicker;
  return picker?.bind(window);
}

/** Reads the chip family from the bootloader's INFO_UF2.TXT. */
export function parseBootloaderInfo(text: string): PicoBootloader | undefined {
  const id = /^Board-ID:\s*(\S+)/m.exec(text)?.[1];
  if (id === "RPI-RP2" || id === "RP2350") return id;
  if (/^Model:.*RP2350/m.test(text)) return "RP2350";
}

const UF2_BLOCK = 512;
/** Rejects anything that is not a whole UF2 image before it reaches the drive. */
export function validateUf2(bytes: Uint8Array) {
  if (!bytes.length || bytes.length % UF2_BLOCK)
    throw new Error("MicroPythonのファームウェアが破損しています。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length; offset += UF2_BLOCK)
    if (
      view.getUint32(offset, true) !== 0x0a324655 ||
      view.getUint32(offset + 4, true) !== 0x9e5d5157 ||
      view.getUint32(offset + UF2_BLOCK - 4, true) !== 0x0ab16f30
    )
      throw new Error("MicroPythonのファームウェアが破損しています。");
}

export type FlashStage = "detecting" | "downloading" | "writing";
export const flashStageLabels: Record<FlashStage, string> = {
  detecting: "Picoのドライブを確認中",
  downloading: "MicroPythonを準備中",
  writing: "MicroPythonを書き込み中",
};

export async function flashMicroPython(
  drive: DirectoryHandleLike,
  signal: AbortSignal,
  onStage: (stage: FlashStage) => void,
  load: (url: string, signal: AbortSignal) => Promise<ArrayBuffer> = async (
    url,
    signal,
  ) => {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error("MicroPythonのファームウェアを取得できませんでした。");
    return response.arrayBuffer();
  },
): Promise<PicoBootloader> {
  onStage("detecting");
  let info: string;
  try {
    info = await (
      await (await drive.getFileHandle("INFO_UF2.TXT")).getFile()
    ).text();
  } catch {
    throw new Error(
      "選択したフォルダはPicoのドライブではありません。BOOTSELモードで表示されるRPI-RP2（Pico 2はRP2350）ドライブを選択してください。",
    );
  }
  const bootloader = parseBootloaderInfo(info);
  if (!bootloader)
    throw new Error(
      "対応していないボードです。Raspberry Pi Pico／Pico 2のドライブを選択してください。",
    );
  signal.throwIfAborted();
  onStage("downloading");
  const image = new Uint8Array(
    await load(picoFirmware[bootloader].url, signal),
  );
  validateUf2(image);
  signal.throwIfAborted();
  onStage("writing");
  const file = await drive.getFileHandle("micropython.uf2", { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(image);
  } catch (error) {
    await writable.abort?.().catch(() => {});
    throw error;
  }
  // The bootloader flashes each block as it lands on the drive and reboots once
  // the image is complete, so the drive can vanish before close() finishes.
  await writable.close().catch(() => {});
  return bootloader;
}
