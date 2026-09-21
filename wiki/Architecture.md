# Architecture

breadberry のシステム構成、API、データ構造の概要です。

## 全体構成

```
ブラウザ (React / Three.js)
    │
    ▼
Next.js App Router (src/app)
    ├── ページ・レイアウト ... SSRされたワークスペース
    └── API Routes (src/app/api)
            ├── POST /api/generate ... Gemini生成 + GMIレビュー + Firestore保存
            ├── GET  /api/projects ... 保存プロジェクト一覧
            ├── GET  /api/projects/[id] ... プロジェクト取得
            ├── POST /api/session ... HMAC署名セッション開始
            └── GET  /api/health ... ヘルスチェック
    │
    ▼
外部サービス
    ├── Gemini API ... 回路の構造化JSON生成
    ├── GMI Cloud ... 生成結果の補助レビュー
    └── Cloud Firestore ... プロジェクト保存・利用回数管理
```

## 設計の中核：単一の回路データ

部品表・穴番号・3D・接続図・工程ガイドはすべて同じ回路ネットリスト（`src/lib/circuit.ts` の `circuitSchema`）から決定的に導出します。AI が 3D 形状を自由に生成するのではなく、あらかじめ定義した部品形状をネットリストに沿って配置します。

### 生成パイプライン

1. ユーザー入力（プロンプト＋基板、任意で `context: { circuit, messages }`）
2. Gemini API が構造化JSONで回路を出力（Zod スキーマで型検査）
3. ネット検査で危険・不正な接続を拒否
4. GMI Cloud が電圧・配線・ピン番号・コードの整合性を補助レビュー（失敗時は「未実施」として設計を保持）
5. Firestore に保存し、クライアントへ応答（`messages` に今回の依頼と回路説明を追加）

## API

### `POST /api/generate`

従来の `{ prompt, board }` に加え、任意の `context: { circuit, messages }` を受け取ります。`messages` は `{ role: "user" | "assistant", content: string }` の配列です。

- 入力サイズ（1〜2000文字）・会話（最大50往復）・修正元の回路を検査
- 生成結果も従来の接続検査を通してから保存
- 応答の `messages` に今回の依頼と生成された回路の説明を追加
- 生成要求は全体・個別の上限を Firestore トランザクションで消費。失敗した要求も利用回数に含まれます

## データモデル（Firestore）

| パス | 内容 |
| ---- | ---- |
| `users/{signed-session-id}/projects/{uuid}` | 保存プロジェクト（回路＋会話履歴） |
| `quotas/global-YYYY-MM-DD` | アプリ全体の日次利用回数 |
| `quotas/{session-id}-YYYY-MM-DD` | セッションごとの日次利用回数 |

- 生成回数カウンターには 7 日 TTL を適用できます（`firebase deploy --only firestore`）
- セキュリティルールはデータベース全体のクライアント直接アクセスを禁止します。サーバー SDK のアクセスは IAM で管理します

## 認証・セッション

- HMAC 署名付き HttpOnly Cookie（`bb_session`）で所有者を分離
- Cookie は 30 日で失効。ログインアカウント方式ではなく、別端末への引き継ぎ・期限後の復旧は未実装
- `SESSION_SECRET`（32文字以上）で署名。`timingSafeEqual` で検証
- `APP_ACCESS_TOKEN` を設定すると共通アクセスコードによるゲートを追加
- `APP_ORIGIN` で許可する送信元を1つに制限（CSRF 対策）。ブラウザの送信元と一致しない操作は 403

## 主なモジュール

| ファイル | 役割 |
| -------- | ---- |
| `src/components/studio.tsx` | ワークスペースと各操作 |
| `src/components/board-scene.tsx` | 部品・基板・ジャンパ線の 3D 描画とアニメーション |
| `src/components/circuit-chat.tsx` | 回路設計チャット UI |
| `src/components/schematic.tsx` | ネットリストの接続図 |
| `src/lib/circuit.ts` | 共通スキーマ、ピン表、配置、部品表、接続検査 |
| `src/lib/ai.ts` | Gemini 生成と GMI 補助レビュー |
| `src/lib/conversation.ts` | 会話コンテキストの型・制約 |
| `src/lib/demo.ts` | APIキー不要のサンプル回路 |
| `src/lib/server.ts` | セッション、Firestore、利用回数制限 |

## エラーハンドリングの方針

- AI サービスのタイムアウト・不正応答は `ServiceError` として適切な HTTP ステータスで返却
- 生成失敗時は回路・履歴・入力を保持して再試行可能
- Firestore 保存失敗時はブラウザ保存へ切り替えて明示（成功したと偽らない）
- 全体上限により、セッションを作り直しても無制限には生成できません
