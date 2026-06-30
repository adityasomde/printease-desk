import crypto from "node:crypto";
import fs from "node:fs";

export function normalizeSha256(value) {
  return String(value || "").trim().toLowerCase();
}

export async function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function verifySha256(filePath, expectedSha256) {
  const expected = normalizeSha256(expectedSha256);
  if (!expected) {
    return {
      success: false,
      reasonCode: "CONVERTER_HASH_MISSING",
      message: "Converter download hash is not configured.",
    };
  }

  const actual = await calculateSha256(filePath);
  return {
    success: actual === expected,
    actual,
    expected,
    reasonCode: actual === expected ? "CONVERTER_HASH_OK" : "CONVERTER_HASH_MISMATCH",
    message: actual === expected ? "Converter hash verified." : "Converter download hash did not match.",
  };
}
