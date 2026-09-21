# breadberry Wiki

**想像を、つなごう。** breadberry は、アイデアから回路設計・部品表・3D組み立てガイドまでをつなぐ、日本語の電子工作ワークスペースです。

![breadberry ワークスペース](../docs/preview.jpg)

## breadberry とは

自然言語で「ESP32で温湿度を測ってOLEDに表示したい」のような要望を入力すると、Gemini API が回路・部品・配線・ファームウェアを構造化JSONで生成し、GMI Cloud のモデルが電圧・配線・ピン番号・コードの整合性を補助レビューします。生成結果はブレッドボード上に3Dアニメーションで1工程ずつ描画され、そのまま組み立てガイドとして使えます。

3D形状をAIに自由に出力させるのではなく、**Geminiの回路ネットリストからあらかじめ定義した部品形状を決定的に配置**します。部品表・穴番号・3D・接続図・工程はすべて同じデータを参照するため、表示間の矛盾がありません。

## 技術スタック

- Next.js / TypeScript / Tailwind CSS
- Three.js（React Three Fiber）による3D描画
- Gemini API（構造化出力）/ GMI Cloud（補助レビュー）
- Cloud Firestore（プロジェクト保存・利用回数管理）
- Docker / Cloud Run / Cloud Build / GitHub Actions

## 主な機能

- 自然言語からの回路・部品・配線・ファームウェア生成
- 回路設計チャットによる対話的な修正（「抵抗を470Ωにして」など）
- 3D組み立てガイド（再生・一時停止・工程移動・速度変更・回転・ズーム・真上表示・全画面）
- 穴番号と端子名を記載した工程ガイド、回路接続図、コード表示
- 部品表CSV・回路JSON・Python/C++コードのダウンロード
- Firestoreへの自動保存とプロジェクトの再表示
- APIキー不要で使えるサンプル回路（ブラウザ保存）

## Wiki ページ一覧

- [[Getting Started|Getting-Started]] — セットアップと基本的な使い方
- [[Supported Hardware|Supported-Hardware]] — 対応基板・部品・回路の制約
- [[Architecture|Architecture]] — システム構成・API・データ構造
- [[Deployment|Deployment]] — Docker / Cloud Run / GitHub Actions によるデプロイ
- [[Development|Development]] — 開発・テスト・プロジェクト構成

## 免責

生成される回路・コードは設計の出発点です。電気的な動作シミュレーターや安全認証ではないため、実機での動作は必ずご自身で確認してください。
