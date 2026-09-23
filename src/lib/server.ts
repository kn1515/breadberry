import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { NextRequest, NextResponse } from "next/server";
import { ServiceError } from "./ai";
import type { Project } from "./circuit";
let firestore: Firestore | undefined;
export function database() {
  if (!process.env.GOOGLE_CLOUD_PROJECT)
    throw new ServiceError(
      "FirestoreのプロジェクトIDが未設定です。サンプル回路をお試しください。",
    );
  return (firestore ??= new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
  }));
}
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new ServiceError(
      "セッション署名キーを32文字以上で設定してください。",
    );
  return s;
}
function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function owner(req: NextRequest) {
  const raw = req.cookies.get("bb_session")?.value || "";
  const [id, expires, signature] = raw.split(".");
  if (
    !id ||
    !expires ||
    !signature ||
    !constantEqual(sign(`${id}.${expires}`), signature) ||
    Number(expires) < Date.now()
  )
    throw new ServiceError(
      "利用期限が切れました。再度お試しください。",
      401,
    );
  return id;
}
export function newSession() {
  const id = randomUUID();
  const exp = Date.now() + 30 * 86400000;
  const raw = `${id}.${exp}`;
  return `${raw}.${sign(raw)}`;
}
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (origin && origin !== allowed)
    throw new ServiceError("この送信元からは操作できません。", 403);
}
export async function bodyJson(req: NextRequest, max = 8192) {
  const reader = req.body?.getReader();
  if (!reader) throw new ServiceError("リクエストが空です。", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ServiceError("入力が長すぎます。", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ServiceError("JSONの形式が不正です。", 400);
  }
}
export function apiError(e: unknown) {
  if (e instanceof ServiceError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("Request failed:", e instanceof Error ? e.name : "unknown");
  return NextResponse.json(
    {
      error:
        "処理に失敗しました。Firestoreの接続・権限を確認し、再試行してください。",
    },
    { status: 503 },
  );
}
export async function takeQuota(id: string) {
  const db = database();
  const day = new Date().toISOString().slice(0, 10);
  const global = db.collection("quotas").doc(`global-${day}`);
  const user = db.collection("quotas").doc(`${id}-${day}`);
  await db.runTransaction(async (tx) => {
    const [g, u] = await tx.getAll(global, user);
    const gc = g.data()?.count ?? 0,
      uc = u.data()?.count ?? 0;
    if (
      gc >= Number(process.env.DAILY_GENERATION_LIMIT || 200) ||
      uc >= Number(process.env.SESSION_DAILY_LIMIT || 20)
    )
      throw new ServiceError("本日の生成回数の上限に達しました。", 429);
    tx.set(global, {
      count: gc + 1,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    tx.set(user, {
      count: uc + 1,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
  });
}
export async function saveProject(id: string, project: Project) {
  await database()
    .collection("users")
    .doc(id)
    .collection("projects")
    .doc(project.id)
    .set(project);
}

/** Separate from generation quotas; shared across Cloud Run instances. */
export async function takeDigiKeyQuota(id: string) {
  const db = database();
  const day = new Date().toISOString().slice(0, 10);
  const global = db.collection("quotas").doc(`digikey-global-${day}`);
  const user = db.collection("quotas").doc(`digikey-${id}-${day}`);
  await db.runTransaction(async (tx) => {
    const [g, u] = await tx.getAll(global, user);
    const gc = g.data()?.count ?? 0,
      uc = u.data()?.count ?? 0;
    if (
      gc >= Number(process.env.DIGIKEY_DAILY_LIMIT || 800) ||
      uc >= Number(process.env.DIGIKEY_SESSION_DAILY_LIMIT || 100)
    )
      throw new ServiceError("本日の部品検索回数の上限に達しました。", 429);
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    tx.set(global, { count: gc + 1, expiresAt });
    tx.set(user, { count: uc + 1, expiresAt });
  });
}
