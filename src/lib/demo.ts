import {
  type Board,
  type Circuit,
  type Project,
  validateCircuit,
} from "./circuit";
export type Example = "climate" | "led" | "temperature" | "display";
export function demoCircuit(
  board: Board = "esp32",
  example: Example = "climate",
): Circuit {
  if (example === "temperature" || example === "display")
    return extendedDemo(board, example);
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
  example: Example = "climate",
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

function extendedDemo(
  board: Board,
  example: "temperature" | "display",
): Circuit {
  const pi = board === "raspberry-pi";
  const data = board === "pico" ? "GP15" : "GPIO4";
  const sda = board === "pico" ? "GP4" : pi ? "GPIO2" : "GPIO21";
  const scl = board === "pico" ? "GP5" : pi ? "GPIO3" : "GPIO22";
  const wire = (
    from: string,
    to: string,
    explanation: string,
    color: Circuit["wires"][number]["color"] = "#38bdf8",
  ) => ({ from, to, explanation, color });
  const c: Circuit = {
    title:
      example === "temperature"
        ? "DS18B20でつくる温度計"
        : "OLEDにメッセージを表示",
    description:
      example === "temperature"
        ? "3端子の温度センサーを1-Wireで読み取ります。"
        : "I2C接続の128×64 OLEDに文字を表示します。",
    board,
    parts: [],
    wires: [],
    firmware: "",
    firmwareLanguage: "python",
    notes: [
      "配線中はUSB電源を抜き、実物の端子名を確認してください。3Dは配線用の模式モデルです。",
    ],
  };
  if (example === "temperature") {
    c.parts = [
      { id: "U1", kind: "ds18b20", value: "TO-92", purpose: "温度を読み取る" },
      {
        id: "R1",
        kind: "resistor",
        value: "4.7kΩ",
        purpose: "1-Wireデータ線をプルアップ",
      },
    ];
    c.wires = [
      wire("board.3V3", "U1.VDD", "VDDに3.3Vを供給します。", "#fb7185"),
      wire("board.GND", "U1.GND", "GNDを共通にします。", "#94a3b8"),
      wire(`board.${data}`, "U1.DQ", "DQをデータ用GPIOに接続します。"),
      wire("U1.DQ", "R1.1", "DQと同じ導通列から4.7kΩ抵抗へつなぎます。"),
      wire("R1.2", "U1.VDD", "抵抗の反対側を3.3Vにつなぎます。", "#fb7185"),
    ];
    c.notes.push(
      pi
        ? "Raspberry Pi OSで1-Wireを有効にし、/boot/firmware/config.txtにdtoverlay=w1-gpio,gpiopin=4を設定して再起動。w1-gpio/w1-thermを使用します。"
        : "MicroPythonのonewireとds18x20が必要です。12bit測定の変換完了まで750ms待ちます。",
    );
    c.firmware = pi
      ? `# Raspberry Pi OS: dtoverlay=w1-gpio,gpiopin=4, then reboot
from pathlib import Path
from time import sleep
while True:
    devices = list(Path("/sys/bus/w1/devices").glob("28-*/w1_slave"))
    if not devices:
        print("No DS18B20 found; check wiring and 1-Wire setup")
    for device in devices:
        try:
            lines = device.read_text().splitlines()
            if len(lines) >= 2 and lines[0].strip().endswith("YES") and "t=" in lines[1]:
                print(device.parent.name, int(lines[1].split("t=")[1]) / 1000, "C")
            else:
                print("CRC/read error:", device.parent.name)
        except (OSError, ValueError) as error:
            print(error)
    sleep(1)
`
      : `from machine import Pin
import onewire, ds18x20
from time import sleep_ms
sensor = ds18x20.DS18X20(onewire.OneWire(Pin(${data.replace(/\D/g, "")})))
while True:
    try:
        devices = sensor.scan()
        if devices:
            sensor.convert_temp()
            sleep_ms(750)
            for device in devices:
                print(sensor.read_temp(device), "C")
        else:
            print("No DS18B20 found; check wiring")
    except OSError as error:
        print(error)
    sleep_ms(1000)
`;
  } else {
    c.parts = [
      {
        id: "U1",
        kind: "ssd1306",
        value: "128x64 / 0x3C / I2C",
        purpose: "文字を表示",
      },
    ];
    c.wires = [
      wire(
        "board.3V3",
        "U1.VCC",
        "3.3VをVCCへ。実物の端子順を確認します。",
        "#fb7185",
      ),
      wire("board.GND", "U1.GND", "GNDを共通にします。", "#94a3b8"),
      wire(`board.${scl}`, "U1.SCL", "クロック線SCLをつなぎます。", "#818cf8"),
      wire(`board.${sda}`, "U1.SDA", "データ線SDAをつなぎます。"),
    ];
    c.notes.push(
      "3.3V対応・プルアップとリセット回路内蔵の4端子SSD1306、アドレス0x3Cを想定。表示は実機上で行い、3D画面では再現しません。",
    );
    c.notes.push(
      pi
        ? "Raspberry Pi OSでI2Cを有効化。Adafruit Blinkaの環境を構築し、仮想環境にadafruit-circuitpython-ssd1306をインストールしてください。"
        : "MicroPython用ssd1306.pyドライバを基板の/libへコピーしてください。MicroPython公式ドキュメントのSSD1306ドライバを使用します。",
    );
    c.firmware = pi
      ? `import board
import adafruit_ssd1306
i2c = board.I2C()
display = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=0x3C)
display.fill(0)
display.text("Hello Breadberry", 0, 12, 1)
display.show()
`
      : `from machine import Pin, SoftI2C
from ssd1306 import SSD1306_I2C
i2c = SoftI2C(sda=Pin(${sda.replace(/\D/g, "")}), scl=Pin(${scl.replace(/\D/g, "")}), freq=100000)
if 0x3C not in i2c.scan():
    raise OSError("OLED not found at 0x3C; check wiring/address")
display = SSD1306_I2C(128, 64, i2c, addr=0x3C)
display.fill(0)
display.text("Hello Breadberry", 0, 12, 1)
display.show()
`;
  }
  return validateCircuit(c);
}
