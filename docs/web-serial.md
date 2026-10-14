# Web Serial 自動ビルド・実行

「コード」の右隣の **自動ビルド** から実機にプログラムを転送できます。

ヘルプの操作チュートリアルにも「USBでビルド・実行」「エラーはAIで解析」の案内があります。コード画面に切り替えて実際の「自動ビルド」ボタンを強調し、接続条件・操作・失敗時の修正手順を説明します。チュートリアルを進めるだけでUSB接続や書き込みが始まることはありません。終了すると元の表示に戻ります。

## 対応条件

- PC版Chrome／Edge等のWeb Serial対応ブラウザ。HTTPSまたはlocalhostが必要です。
- **MicroPython導入済みのESP32またはRaspberry Pi Pico** とUSBデータケーブル。PicoはMicroPython未導入でも、下記「PicoへのMicroPython書き込み」で導入できます。
- 設計と実機の基板・配線が一致し、センサー用の外部ドライバーを導入済みであること。
- ブラウザの接続先選択はユーザー操作が必要です。Web Serial APIだけでは物理配線の正しさを確認できません。
- Raspberry Pi OS、Arduino/C++、ESP32へのMicroPython本体の書き込みには対応していません（ESP32はesptool等で導入してください）。未対応の回路は理由を表示して実行を無効にします。ロジックICのCPU例のように給電だけに使う基板にもコードを書き込みません。

## 操作

1. 配線を確認し、ボードをUSB接続します。Thonny、Arduino IDE等がシリアルポートを使用している場合は閉じます。
2. 「自動ビルド」→「接続してビルド・実行」で接続先を選びます。
3. 現在のプログラムを中断し、MicroPython raw REPLからランタイムと基板（ESP32=`esp32`、Pico=`rp2`）を確認します。
4. UTF-8コードを一時ファイル `.breadberry-main.tmp` に小分けして転送し、ボード上の `compile()` でコンパイルします。構文エラー時は既存の `main.py` を更新しません。
5. コンパイル成功後、元の `main.py` を `main.py.breadberry.bak` にバックアップし、転送したコードを `main.py` に保存して実行します。次回起動時にも `main.py` が動きます。バックアップは直前の1世代です。
6. 実行ログを監視します。継続実行するプログラムは「実行中」、正常終了した場合は「完了」と表示します。これは実回路の動作保証ではありません。
7. コンパイルと `main.py` の保存が成功して実行を開始すると、「ビルド成功」の通知を5秒間表示します。通知はビルド画面の上にも表示されます。
8. 「切断」または画面を閉じる操作でシリアルポートを解放します。**通信の切断は実行停止ではありません。** ボード上のプログラムは動作を続ける場合があります。

raw REPLが10秒以内に応答しない場合は、MicroPython以外のファームウェア（Arduinoスケッチ等）が書き込まれている可能性があるとして、MicroPythonの導入方法を表示します。

## PicoへのMicroPython書き込み

回路の基板がPicoの場合、自動ビルド画面に「MicroPythonが入っていないPico」を表示します。同梱した公式ビルドのMicroPython v1.29.0を、BOOTSELモードのPicoへ書き込みます。

1. 新品のPicoはそのままUSB接続します。書き込み済みのPicoはBOOTSELボタンを押しながら接続します。`RPI-RP2`（Pico 2は `RP2350`）ドライブが現れます。
2. 「MicroPythonを書き込む」を押し、ブラウザのフォルダ選択でそのドライブを選んで書き込みを許可します。
3. ドライブの `INFO_UF2.TXT` からチップ（RP2040=Pico／Pico H、RP2350=Pico 2）を判定し、対応するUF2を `micropython.uf2` としてドライブへ書き込みます。Picoは書き込み後に自動で再起動します。
4. 以前にこのサイトで許可したPicoのシリアルポートが再起動後20秒以内に現れた場合は、そのままビルド・実行へ進みます。現れない場合は「接続してビルド・実行」を押し、Picoのポートを選択してください。

UF2は `public/firmware/` に配置した [micropython.org](https://micropython.org/download/RPI_PICO/) の公式ビルド（`RPI_PICO-20260824-v1.29.0.uf2`、`RPI_PICO2-20260824-v1.29.0.uf2`）で、書き込み時に外部サイトへは接続しません。書き込み前にUF2ブロックの形式を検査し、破損したファイルは書き込みません。`INFO_UF2.TXT` がないフォルダや非対応ボードは拒否します。

ドライブへの直接書き込みには File System Access API（`showDirectoryPicker`、PC版Chrome／Edge等、HTTPSまたはlocalhost）が必要です。非対応のブラウザでは「Raspberry Pi Pico / Pico H (RP2040)用UF2」「Raspberry Pi Pico 2 (RP2350)用UF2」をダウンロードし、ドライブへドラッグしてください。MicroPythonのバージョンを更新する場合は、UF2を差し替えて `src/lib/pico-flash.ts` の `micropythonVersion` と `picoFirmware` のファイル名を変更します。

## AIによるエラー解析

失敗時は実行工程・コード・回路・最大16000文字のログを `/api/firmware/analyze` に送信して、原因と対処手順を表示します。「失敗したらAIで自動解析する」を外すと、明示的に「AIでエラーを解析」を押したときだけ送信します。ログはダウンロードできます。

AIが修正コードを提案した場合は、展開して内容を確認し、「修正を反映して再ビルド・実行」を押すとワークスペースのコードに反映して再実行します。回路・ピンは保持し、無制限の自動修正ループには入りません。接続・環境エラーには設定の対処方法を提示します。解析APIが利用できなくてもビルドログは残ります。

## 運用・実装

ビルドは接続先MicroPythonのコンパイラーが行うため、Cloud RunへArduino CLI等を追加する必要はありません。クラウドはコードを実行せず、AI解析だけを行います。既存のAI接続、署名付きセッション、生成クォータ、Model Armor、Cloud Traceを使用します。追加の秘密情報や環境変数は不要です。解析も既存の生成回数上限に含まれます。

USB許可・通信はブラウザ内だけで扱います。接続時に `requestPort()` を直接クリックから呼び、115200 baudで開きます。raw REPLのstdoutとstderrを分離し、応答待ちには期限を設けています。実行中の無出力ループはタイムアウトと扱いません。切断、キャンセル、USB抜去、通常終了時にストリームロックを解放します。

コンパイルは構文の検証です。外部ライブラリ不足、I2C応答エラー、GPIO不一致などは実行時に失敗する場合があります。実行失敗時も自動で古いコードへ切り戻さず、ログとバックアップを残します。バックアップの復元が必要なら、MicroPythonのファイル操作で内容を確認して `main.py` を戻してください。

## 検証

自動テストはWeb Streamsによる模擬ボードで、分割UTF-8受信、コンパイルと保存の順序、構文エラー、実行エラー、基板不一致、USB抜去、継続実行のキャンセルを確認します。ブラウザテストはボタン配置、未対応環境、AI解析、修正・再実行、コードへの反映を確認します。MicroPython書き込みは単体テストで、`INFO_UF2.TXT` によるRP2040／RP2350の判定、同梱UF2の形式、一致するドライブへの書き込み、非Picoフォルダと破損イメージの拒否を、模擬ドライブで確認します。

実機は別途、ESP32/PicoでLED点滅、新品PicoへのMicroPython書き込みと再起動後の自動ビルド、構文エラー、ドライバー不足、USB抜去、再接続、再起動後の `main.py` 起動を確認してください。自動テストでは物理USB通信と実機動作を検証していません。

参照: [Web Serial API](https://developer.chrome.com/docs/capabilities/serial)、[MicroPython raw REPL](https://docs.micropython.org/en/latest/reference/repl.html)、[File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)、[Pico向けMicroPython](https://www.raspberrypi.com/documentation/microcontrollers/micropython.html)。
