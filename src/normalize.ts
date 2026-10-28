import type { CoolType, ReviewNote } from "./model.js";

const toHalfWidthDigits = (s: string): string =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/**
 * 電話番号をハイフンなしの半角数字にそろえる。
 * 名寄せの第一キーに使うので、形が崩れているものは推測で直さず null にして要確認へ回す。
 */
export function normalizePhone(
  raw: string | null | undefined,
  field: string,
  notes: ReviewNote[],
): string | null {
  if (raw == null || raw.trim() === "") return null;
  const digits = toHalfWidthDigits(raw).replace(/[-－ー‐−()（）\s]/g, "");
  if (/^0\d{9,10}$/.test(digits)) return digits;
  notes.push({ field, reason: `電話番号の形ではない: "${raw}"` });
  return null;
}

/**
 * 郵便番号を7桁の文字列にそろえる。
 * スプレッドシートで数値として読まれた列は先頭のゼロが落ちる（0600001 → 600001）。
 * 6桁の数値だけはゼロを戻すが、戻したことは要確認に残す。
 */
export function normalizeZip(
  raw: string | number | null | undefined,
  field: string,
  notes: ReviewNote[],
): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    const s = String(raw);
    if (s.length === 7) return s;
    if (s.length === 6) {
      notes.push({ field, reason: `数値で読まれて先頭のゼロが落ちていたので戻した: ${raw}` });
      return `0${s}`;
    }
    notes.push({ field, reason: `郵便番号の桁数が合わない: ${raw}` });
    return null;
  }
  const digits = toHalfWidthDigits(raw).replace(/[-－ー‐−〒\s]/g, "");
  if (/^\d{7}$/.test(digits)) return digits;
  notes.push({ field, reason: `郵便番号の形ではない: "${raw}"` });
  return null;
}

export function blankToNull(s: string | null | undefined): string | null {
  return s == null || s.trim() === "" ? null : s.trim();
}

const COOL_LABELS: Record<string, CoolType> = {
  常温: "normal",
  冷蔵: "chilled",
  冷凍: "frozen",
};

export function parseCool(label: string, field: string, notes: ReviewNote[]): CoolType {
  const cool = COOL_LABELS[label.trim()];
  if (cool) return cool;
  notes.push({ field, reason: `温度帯が読めないので常温にした: "${label}"` });
  return "normal";
}
