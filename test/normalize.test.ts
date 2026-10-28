import { describe, expect, it } from "vitest";
import { normalizePhone, normalizeZip, type ReviewNote } from "../src/index.js";

describe("normalizePhone", () => {
  it("ハイフン・全角数字・括弧を取り除く", () => {
    const notes: ReviewNote[] = [];
    expect(normalizePhone("097-000-0001", "p", notes)).toBe("0970000001");
    expect(normalizePhone("０９０−００００−０００３", "p", notes)).toBe("09000000003");
    expect(normalizePhone("(03)0000-0002", "p", notes)).toBe("0300000002");
    expect(notes).toEqual([]);
  });

  it("空は null で、要確認には入れない", () => {
    const notes: ReviewNote[] = [];
    expect(normalizePhone("", "p", notes)).toBeNull();
    expect(normalizePhone(null, "p", notes)).toBeNull();
    expect(notes).toEqual([]);
  });

  it("電話番号の形でなければ、推測で直さず null にして要確認に残す", () => {
    const notes: ReviewNote[] = [];
    expect(normalizePhone("97-000-0001", "purchaser.phone", notes)).toBeNull();
    expect(notes).toEqual([{ field: "purchaser.phone", reason: expect.stringContaining("電話番号の形ではない") }]);
  });
});

describe("normalizeZip", () => {
  it("ハイフンと〒を取り除いて7桁にする", () => {
    const notes: ReviewNote[] = [];
    expect(normalizeZip("〒870-0000", "z", notes)).toBe("8700000");
    expect(normalizeZip("８７００００１", "z", notes)).toBe("8700001");
    expect(notes).toEqual([]);
  });

  it("数値で読まれて先頭のゼロが落ちた6桁は、ゼロを戻して要確認に残す", () => {
    const notes: ReviewNote[] = [];
    expect(normalizeZip(600001, "z", notes)).toBe("0600001");
    expect(notes).toHaveLength(1);
  });

  it("数値でも7桁ならそのまま", () => {
    const notes: ReviewNote[] = [];
    expect(normalizeZip(8700000, "z", notes)).toBe("8700000");
    expect(notes).toEqual([]);
  });

  it("桁数が合わないものは null", () => {
    const notes: ReviewNote[] = [];
    expect(normalizeZip(12345, "z", notes)).toBeNull();
    expect(normalizeZip("870-00", "z", notes)).toBeNull();
    expect(notes).toHaveLength(2);
  });
});
