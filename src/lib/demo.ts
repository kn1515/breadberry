import {
  type Board,
  type Circuit,
  type Project,
  validateCircuit,
} from "./circuit";
export function demoCircuit(
  board: Board = "esp32",
  example: "climate" | "led" = "climate",
): Circuit {
  const gpio = board === "pico" ? ["GP15", "GP14"] : ["GPIO4", "GPIO18"];
  if (board === "raspberry-pi") gpio[1] = "GPIO17";
  const c: Circuit = {
    title:
      example === "climate"
        ? "お部屋の小さな気象台"
        : "はじめての LED ブリンク",
    description:
      example === "climate"
        ? "温度と湿度を読み取り、LEDで動作を知らせる。デスクの上からはじめる、小さなものづくり。"
        : "LEDがゆっくり点滅する、電子工作の最初の一歩。抵抗と極性を学びましょう。",
    board,
    parts: [
      {
        id: "D1",
        kind: "led",
        value: "Green · 5mm",
        purpose: "動作を知らせるインジケーター",
      },
      {
        id: "R1",
        kind: "resistor",
        value: "330Ω",
        purpose: "LEDに流れる電流を制限",
      },
    ],
    wires: [
      {
        from: `board.${gpio[1]}`,
        to: "R1.1",
        color: "#818cf8",
        explanation:
          "GPIOから330Ωの抵抗へ接続します。基板の印字を確認してください。",
      },
      {
        from: "R1.2",
        to: "D1.A",
        color: "#34d399",
        explanation: "抵抗の反対側をLEDの長い脚（A）と同じ導通列へつなぎます。",
      },
      {
        from: "D1.K",
        to: example === "climate" ? "U1.GND" : "board.GND",
        color: "#94a3b8",
        explanation: "LEDの短い脚（K）をGNDへつなぎます。",
      },
    ],
    notes: [
      "配線中はUSB電源を抜いてください。接続完了後、極性とピン番号を実物で照合してください。",
      "3Dは配線を示す模式モデルです。基板や部品の外形・ピン順は製品によって異なります。",
    ],
    firmwareLanguage: "python",
    firmware: "",
  };
  if (example === "climate") {
    c.parts.push(
      {
        id: "U1",
        kind: "dht22",
        value: "AM2302 · bare sensor",
        purpose: "お部屋の温度・湿度を計測",
      },
      {
        id: "R2",
        kind: "resistor",
        value: "10kΩ",
        purpose: "DHT22のデータ線をプルアップ",
      },
    );
    c.wires.push(
      {
        from: "board.3V3",
        to: "U1.VCC",
        color: "#fb7185",
        explanation: "3.3VをセンサーのVCCへ。5V端子には接続しません。",
      },
      {
        from: "board.GND",
        to: "U1.GND",
        color: "#94a3b8",
        explanation: "基板とセンサーのGNDを共通にします。",
      },
      {
        from: `board.${gpio[0]}`,
        to: "U1.DATA",
        color: "#fbbf24",
        explanation:
          "センサーのDATAをGPIOに接続します。NC端子は空けておきます。",
      },
      {
        from: "U1.DATA",
        to: "R2.1",
        color: "#38bdf8",
        explanation: "DATAと同じ導通列から10kΩの抵抗に接続します。",
      },
      {
        from: "R2.2",
        to: "U1.VCC",
        color: "#fb7185",
        explanation: "10kΩ抵抗のもう一端をVCCと同じ導通列につなぎます。",
      },
    );
  }
  const ledPin = Number(gpio[1].replace(/\D/g, ""));
  const sensorPin = Number(gpio[0].replace(/\D/g, ""));
  c.firmware =
    board === "raspberry-pi"
      ? `# Raspberry Pi OS: python3-gpiozero${example === "climate" ? ", adafruit-circuitpython-dht, libgpiod" : ""}\nfrom gpiozero import LED\nfrom time import sleep\n${example === "climate" ? "import board\nimport adafruit_dht\nsensor = adafruit_dht.DHT22(board.D4, use_pulseio=False)\n" : ""}led = LED(${ledPin})\ntry:\n    while True:\n        led.toggle()\n${example === "climate" ? "        try:\n            print(sensor.temperature, sensor.humidity)\n        except RuntimeError as error:\n            print(error)\n" : ""}        sleep(2)\nfinally:\n    led.close()\n${example === "climate" ? "    sensor.exit()\n" : ""}`
      : `# MicroPython — save as main.py on your board\nfrom machine import Pin\nfrom time import sleep\n${example === "climate" ? `import dht\nsensor = dht.DHT22(Pin(${sensorPin}))\n` : ""}led = Pin(${ledPin}, Pin.OUT)\nwhile True:\n    led.value(not led.value())\n${example === "climate" ? '    try:\n        sensor.measure()\n        print("Temperature:", sensor.temperature(), "Humidity:", sensor.humidity())\n    except OSError as error:\n        print("Sensor read failed:", error)\n' : ""}    sleep(2)\n`;
  return validateCircuit(c);
}
export function demoProject(
  board: Board = "esp32",
  example: "climate" | "led" = "climate",
): Project {
  return {
    id: `demo-${board}-${example}`,
    circuit: demoCircuit(board, example),
    createdAt: new Date(0).toISOString(),
    source: "demo",
    review: {
      status: "demo",
      text: "サンプル回路です。AIによる生成・レビューは行っていません。",
    },
    storage: "browser",
  };
}
