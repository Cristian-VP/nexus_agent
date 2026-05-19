import crypto from "node:crypto";

function buildKey(material: string): Buffer {
  return crypto.createHash("sha256").update(material).digest();
}

export function encryptSecret(plainText: string, keyMaterial: string): string {
  const key = buildKey(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(
    "."
  );
}

export function decryptSecret(cipherText: string, keyMaterial: string): string {
  const [ivBase64, tagBase64, payloadBase64] = cipherText.split(".");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error("Invalid encrypted secret format");
  }

  const key = buildKey(keyMaterial);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final()
  ]).toString("utf8");
}