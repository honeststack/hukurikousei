import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    // 公開デモは、デプロイごとの値から秘密鍵を作る（デモのデータはデプロイのたびに作り直される）
    if (process.env.DEMO_MODE === "true") return `yufuda-demo-${process.env.DEMO_BUILD_ID || "local"}-secret`;
    if (process.env.NODE_ENV === "production") throw new Error("APP_SECRET を16文字以上で設定してください");
    return "dev-secret-not-for-production-use";
  }
  return s;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (e, k) => (e ? reject(e) : resolve(k))),
  );
  return `scrypt$${SCRYPT.N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt") return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const key = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p }, (e, k) => (e ? reject(e) : resolve(k))),
  );
  return crypto.timingSafeEqual(key, expected);
}

/** URLに載せても安全なランダム文字列 */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string): Buffer {
  return crypto.createHmac("sha256", appSecret()).update(value).digest();
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "パスワードは8文字以上にしてください";
  if (password.length > 128) return "パスワードが長すぎます";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "英字と数字を両方含めてください";
  return null;
}
