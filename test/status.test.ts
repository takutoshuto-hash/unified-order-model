import { describe, expect, it } from "vitest";
import { fromCatalogGift, fromDirectGift, fromOwnEc, fromShippingHub } from "../src/index.js";

describe("出荷基幹のステータス", () => {
  it("「完了」は送り状CSVを出しただけなので、追跡番号がなければ出荷準備中", () => {
    expect(fromShippingHub("完了", false, false)).toBe("preparing");
  });

  it("「完了」で追跡番号が入っていれば出荷済み（completed にはしない）", () => {
    expect(fromShippingHub("完了", false, true)).toBe("shipped");
  });

  it("キャンセルのフラグは、どのステータスより優先する", () => {
    expect(fromShippingHub("完了", true, true)).toBe("cancelled");
    expect(fromShippingHub("受付", true, false)).toBe("cancelled");
  });

  it("受付・出荷準備はそのまま", () => {
    expect(fromShippingHub("受付", false, false)).toBe("received");
    expect(fromShippingHub("出荷準備", false, false)).toBe("preparing");
  });
});

describe("自社ECのステータス", () => {
  it("「入金取消」は注文のキャンセルではなく、入金待ちに戻す", () => {
    expect(fromOwnEc("入金取消", true)).toBe("awaiting_payment");
  });

  it("振込の新規注文は入金待ち、代引・カードの新規注文は入金確認済み", () => {
    expect(fromOwnEc("新規", true)).toBe("awaiting_payment");
    expect(fromOwnEc("新規", false)).toBe("paid");
  });
});

describe("直送・カタログのステータス", () => {
  it("直送は入金の段階を持つ", () => {
    expect(fromDirectGift("入金待ち")).toBe("awaiting_payment");
    expect(fromDirectGift("入金済")).toBe("paid");
    expect(fromDirectGift("発送済")).toBe("shipped");
  });

  it("カタログは受付と発送済みだけ", () => {
    expect(fromCatalogGift("受付")).toBe("received");
    expect(fromCatalogGift("発送済")).toBe("shipped");
  });

  it("型にない文字列が実行時に来たら、黙って通さずに止める", () => {
    // スプレッドシートの手入力など、型の外から来る値を想定
    expect(() => fromCatalogGift("保留" as never)).toThrow("想定していない値");
  });
});
