import { type Board, type Circuit, catalog, validateCircuit } from "./circuit";
import { logicOutput } from "./logic";

/** Manually supplied instructions; a real accumulator/ALU, without a program ROM or PC. */
export function cpuDemo(board: Board): Circuit {
  const c: Circuit = {
    title: "ロジックICでつくる1bit CPU",
    description:
      "4枚のブレッドボードで、1bitアキュムレータとALUを組み立てます。DIPスイッチで命令と入力を設定し、ボタンで1命令ずつ実行。マイコンは3.3Vの給電だけに使います。プログラムメモリ・自動実行・分岐は含みません。",
    board,
    breadboards: [1, 2, 3, 4].map((n) => ({ id: `BB${n}` })),
    parts: [],
    wires: [],
    firmwareLanguage: "python",
    firmware:
      "# No firmware is required.\n# The selected board supplies regulated 3.3 V and GND only.\n# Instructions and operand are set with SW1; SW2 clocks the 74HC74.\n",
    notes: [
      "SW1: 1=入力D、2=OP0、3=OP1。OFF=0、ON=1。4=RESET（ONでA=0、実行時はOFF）。電源投入後は必ずRESETしてください。",
      "OP1 OP0: 00=LOAD D、01=AND（A AND D）、10=XOR（A XOR D）、11=NOT A。SW2を押すとAを更新し、赤LEDでA=1を表示します。",
      "実行例: RESET→LOAD 1→AND 0→XOR 1→NOT。各命令でSW2を1回押すと、Aは0→1→0→1→0になります。",
      "命令と入力はクロック前に設定し、押している間は変更しないでください。RC＋74HC14でクロックを整形します。ボタンは200ms以上押し、離して300ms以上待ってから次を実行します。",
      "74HCのPDIPを使用し、74HCTや表面実装品に置き換えないでください。ICは中央の溝を跨ぎ、切り欠きと1番ピンを実物のデータシートで確認します。未使用入力は固定、未使用出力は開放します。",
      "電源を切って配線し、各ICの100nFをVCC/GNDの近くに置きます。3.3VとGNDを4枚へ接続してください。レールが途中で分断されている製品では導通を確認し、同極レールを橋渡ししてください。",
      "これは手動命令入力式の最小CPUです。PC・ROM・RAM・分岐命令はありません。回路の実機検証は未実施です。",
    ],
  };
  function part(
    id: string,
    kind: Circuit["parts"][number]["kind"],
    value: string,
    purpose: string,
    breadboard: string,
    hole: string,
  ) {
    c.parts.push({
      id,
      kind,
      value,
      purpose,
      placement: { breadboard, hole, reversed: false },
      ...(kind === "led" ? { ledColor: "red" as const } : {}),
    });
  }
  function wire(
    from: string,
    to: string,
    explanation: string,
    color: Circuit["wires"][number]["color"] = "#38bdf8",
  ) {
    c.wires.push({ from, to, explanation, color });
  }
  function ground(pin: string, bb: string) {
    wire(`${bb}.GND`, pin, "GNDへ接続します。", "#94a3b8");
  }
  function power(pin: string, bb: string) {
    wire(`${bb}.VCC`, pin, "3.3Vへ接続します。", "#fb7185");
  }
  part("U1", "74hc08", "SN74HC08N", "A AND D", "BB1", "e2");
  part("U2", "74hc86", "SN74HC86N", "A XOR D", "BB1", "e13");
  part(
    "U3",
    "74hc153",
    "SN74HC153N",
    "命令に対応するALU結果を選択",
    "BB2",
    "e2",
  );
  part("U4", "74hc74", "SN74HC74N", "1bitアキュムレータAを保持", "BB2", "e15");
  part(
    "U5",
    "74hc14",
    "SN74HC14N",
    "手動クロックのチャタリング対策",
    "BB3",
    "e2",
  );
  part(
    "SW1",
    "dip-switch",
    "4 position SPST DIP",
    "入力・命令・リセットを設定",
    "BB3",
    "e12",
  );
  part(
    "SW2",
    "button",
    "NO 2-pin",
    "1命令を実行する手動クロック",
    "BB4",
    "g20",
  );
  const resistors = [
    ["R1", "10kΩ", "入力Dのプルダウン", "b1"],
    ["R2", "10kΩ", "OP0のプルダウン", "g1"],
    ["R3", "10kΩ", "OP1のプルダウン", "b7"],
    ["R4", "10kΩ", "RESETのプルアップ", "g7"],
    ["R5", "100kΩ", "クロックのRCプルアップ", "b13"],
    ["R6", "10kΩ", "クロック放電時の電流制限", "g13"],
    ["R7", "2.2kΩ", "LEDの電流制限", "b25"],
  ];
  for (const [id, value, purpose, hole] of resistors)
    part(id, "resistor", value, purpose, "BB4", hole);
  const chips = c.parts.filter((p) => p.id.startsWith("U"));
  chips.forEach((p, i) => {
    const bb = p.placement!.breadboard!;
    part(
      `C${i + 1}`,
      "capacitor",
      "100nF",
      `${p.id}の電源バイパス`,
      bb,
      ["g1", "g12", "g1", "g14", "g1"][i],
    );
    power(`${p.id}.VCC`, bb);
    ground(`${p.id}.GND`, bb);
    power(`C${i + 1}.2`, bb);
    ground(`C${i + 1}.1`, bb);
  });
  part("C6", "capacitor", "1uF", "クロックのRCフィルタ", "BB3", "b23");
  part("D1", "led", "Red · 5mm", "アキュムレータA=1を表示", "BB4", "b20");
  for (const rail of ["VCC", "GND"]) {
    wire(
      `board.${rail === "VCC" ? "3V3" : "GND"}`,
      `BB1.${rail}`,
      "基板の給電端子を電源レールへ接続します。",
      rail === "VCC" ? "#fb7185" : "#94a3b8",
    );
    for (let n = 1; n < 4; n++)
      wire(
        `BB${n}.${rail}`,
        `BB${n + 1}.${rail}`,
        "別のボードの同じ電源レールへ橋渡しします。",
        rail === "VCC" ? "#fb7185" : "#94a3b8",
      );
  }
  for (let n = 1; n <= 3; n++) {
    power(`SW1.${n}A`, "BB3");
    ground(`R${n}.2`, "BB4");
    wire(`SW1.${n}B`, `R${n}.1`, "OFF時の入力を0に固定します。");
  }
  ground("SW1.4A", "BB3");
  power("R4.1", "BB4");
  wire("R4.2", "SW1.4B", "RESETを通常HIGH、ONでLOWにします。");
  wire("SW1.4B", "U4.1CLR_N", "アキュムレータの非同期クリアへ接続します。");
  wire("SW1.1B", "U1.1B", "入力DをANDゲートへ接続します。");
  wire("SW1.1B", "U2.1B", "入力DをXORゲートへ接続します。");
  wire("R1.1", "U3.1C0", "LOAD命令の入力Dを選択候補0へ接続します。");
  wire("SW1.2B", "U3.A", "OP0を選択ビットAへ接続します。");
  wire("SW1.3B", "U3.B", "OP1を選択ビットBへ接続します。");
  wire("U4.1Q", "U1.1A", "AをANDゲートへ戻します。");
  wire("U4.1Q", "U2.1A", "AをXORゲートへ戻します。");
  wire("U1.1Y", "U3.1C1", "AND結果を選択候補1へ接続します。");
  wire("U2.1Y", "U3.1C2", "XOR結果を選択候補2へ接続します。");
  wire("U4.1Q_N", "U3.1C3", "NOT Aを選択候補3へ接続します。");
  wire("U3.1Y", "U4.1D", "命令の結果を次のAの入力Dへ接続します。");
  ground("U3.1G_N", "BB2");
  power("U3.2G_N", "BB2");
  power("U4.1PRE_N", "BB2");
  power("U4.2PRE_N", "BB2");
  power("U4.2CLR_N", "BB2");
  power("R5.1", "BB4");
  wire("R5.2", "C6.1", "100kΩと1uFでクロック入力を平滑化します。");
  ground("C6.2", "BB3");
  wire("C6.1", "U5.1A", "RC信号をシュミット入力へ接続します。");
  wire("R5.2", "R6.1", "放電用抵抗へ接続します。");
  wire("R6.2", "SW2.1", "クロックボタンを10kΩ経由で接続します。");
  ground("SW2.2", "BB4");
  wire("U5.1Y", "U4.1CLK", "押下時の立ち上がりでAを更新します。");
  wire("U4.1Q", "R7.1", "Aを2.2kΩ経由でLEDへ出力します。");
  wire("R7.2", "D1.A", "LEDのアノードへ接続します。");
  ground("D1.K", "BB4");
  // Connect every unused CMOS input. Unused push-pull outputs must remain open.
  for (const chip of chips)
    for (const pin of catalog[chip.kind].pins) {
      if (
        !logicOutput(chip.kind, pin) &&
        !c.wires.some(
          (w) => w.from === `${chip.id}.${pin}` || w.to === `${chip.id}.${pin}`,
        )
      )
        ground(`${chip.id}.${pin}`, chip.placement!.breadboard!);
    }
  return validateCircuit(c);
}
