import { describe, expect, it } from "vitest";
import {
  fromCatalogGiftApplication,
  fromDirectGiftRows,
  fromOwnEcOrder,
  fromShippingHubRows,
  MAX_DESTINATIONS,
  type Order,
  type Result,
} from "../src/index.js";
import { catalogApp, directRow, ecOrder, hubRow } from "./fixtures.js";

function unwrap(r: Result<Order>): Order {
  if (!r.ok) throw new Error(r.errors.join(", "));
  return r.value;
}

describe("出荷基幹 → 統一注文", () => {
  it("固定の「商品1」「商品2」を可変の明細に開き、お届け先単位ののしを各商品に写す", () => {
    const order = unwrap(
      fromShippingHubRows([hubRow({ item2Code: "A-200", item2Name: "詰め合わせB", item2Price: 3240, item2Qty: 2 })]),
    );
    const items = order.destinations[0].items;
    expect(items.map((i) => i.productCode)).toEqual(["A-100", "A-200"]);
    expect(items.every((i) => i.noshi?.kind === "御歳暮")).toBe(true);
  });

  it("商品2が空なら明細は1つ", () => {
    const order = unwrap(fromShippingHubRows([hubRow()]));
    expect(order.destinations[0].items).toHaveLength(1);
  });

  it("商品2のコードがあるのに単価が空なら、取り込まずにエラー", () => {
    const r = fromShippingHubRows([hubRow({ item2Code: "A-200", item2Name: "B", item2Price: null, item2Qty: 1 })]);
    expect(r.ok).toBe(false);
  });

  it("同じ受注番号の行を、複数のお届け先にまとめる", () => {
    const order = unwrap(fromShippingHubRows([hubRow(), hubRow({ rowId: "r2", recipientName: "別の人" })]));
    expect(order.destinations).toHaveLength(2);
    expect(order.source).toEqual({ system: "shipping_hub", channel: "電話", recordId: "H-0001" });
  });

  it(`お届け先が${MAX_DESTINATIONS}件を超えたら取り込まない`, () => {
    const rows = Array.from({ length: MAX_DESTINATIONS + 1 }, (_, i) => hubRow({ rowId: `r${i}` }));
    expect(fromShippingHubRows(rows).ok).toBe(false);
  });

  it("受注番号の違う行が混ざっていたら取り込まない", () => {
    expect(fromShippingHubRows([hubRow(), hubRow({ orderNo: "H-0002" })]).ok).toBe(false);
  });

  it("Amazon の注文は購入者の名前だけを持ち、顧客マスタにはつながない", () => {
    const order = unwrap(fromShippingHubRows([hubRow({ channel: "Amazon" })]));
    expect(order.purchaser).toEqual({ name: "山田 太郎", phone: null, zip: null, address: null, email: null });
    expect(order.customerId).toBeNull();
  });

  it("支払の列がないシステムなので payment は null", () => {
    expect(unwrap(fromShippingHubRows([hubRow()])).payment).toBeNull();
  });

  it("「完了」でも追跡番号がない行があれば、出荷準備中のまま", () => {
    const order = unwrap(
      fromShippingHubRows([
        hubRow({ status: "完了", trackingNumber: "1234-5678-9012" }),
        hubRow({ rowId: "r2", status: "完了", trackingNumber: "" }),
      ]),
    );
    expect(order.status).toBe("preparing");
  });

  it("キャンセルの行とそうでない行が混ざっていたら、キャンセルにして要確認に残す", () => {
    const order = unwrap(fromShippingHubRows([hubRow({ cancelled: true }), hubRow({ rowId: "r2" })]));
    expect(order.status).toBe("cancelled");
    expect(order.reviewNotes.map((n) => n.field)).toContain("status");
  });

  it("読めない温度帯は常温にして、要確認に残す", () => {
    const order = unwrap(fromShippingHubRows([hubRow({ cool: "冷やす" })]));
    expect(order.destinations[0].cool).toBe("normal");
    expect(order.reviewNotes).toHaveLength(1);
  });
});

describe("直送ギフト → 統一注文", () => {
  it("1行1商品の行を、同じお届け先ごとに1つの明細リストにまとめる", () => {
    const order = unwrap(
      fromDirectGiftRows([
        directRow(),
        directRow({ productCode: "B-201", productName: "ギフトB2" }),
        directRow({ recipientName: "別の人", recipientPhone: "06-0000-0099" }),
      ]),
    );
    expect(order.destinations).toHaveLength(2);
    expect(order.destinations[0].items.map((i) => i.productCode)).toEqual(["B-200", "B-201"]);
  });

  it("のしは商品ごとに持つ", () => {
    const order = unwrap(
      fromDirectGiftRows([directRow({ noshiKind: "内祝", noshiName: "鈴木" }), directRow({ productCode: "B-201" })]),
    );
    const [withNoshi, without] = order.destinations[0].items;
    expect(withNoshi?.noshi).toEqual({ kind: "内祝", nameOnNoshi: "鈴木" });
    expect(without?.noshi).toBeNull();
  });

  it("支払は銀行振込で、入金日が空なら未入金", () => {
    const order = unwrap(fromDirectGiftRows([directRow()]));
    expect(order.payment).toEqual({ method: "bank_transfer", paidAt: null });
    expect(order.status).toBe("awaiting_payment");
  });

  it("全角の電話番号も、名寄せに使える形にそろえる", () => {
    expect(unwrap(fromDirectGiftRows([directRow()])).purchaser?.phone).toBe("09000000003");
  });

  it("伝票番号が複数あれば個口数に数える", () => {
    const order = unwrap(
      fromDirectGiftRows([
        directRow({ status: "発送済", trackingNumber: "1111" }),
        directRow({ productCode: "B-201", status: "発送済", trackingNumber: "2222" }),
      ]),
    );
    expect(order.destinations[0].trackingNumbers).toEqual(["1111", "2222"]);
    expect(order.destinations[0].parcelCount).toBe(2);
  });
});

describe("カタログギフト → 統一注文", () => {
  it("申込者がそのままお届け先で、依頼主・支払・のしは持たない", () => {
    const order = unwrap(fromCatalogGiftApplication(catalogApp()));
    expect(order.purchaser).toBeNull();
    expect(order.payment).toBeNull();
    expect(order.destinations[0].recipient.name).toBe("田中 三郎");
    expect(order.destinations[0].items[0].noshi).toBeNull();
  });

  it("数量の列がないので、明細の数量は1", () => {
    expect(unwrap(fromCatalogGiftApplication(catalogApp())).destinations[0].items[0].quantity).toBe(1);
  });

  it("先頭のゼロが落ちた郵便番号を戻し、要確認に残す", () => {
    const order = unwrap(fromCatalogGiftApplication(catalogApp()));
    expect(order.destinations[0].recipient.zip).toBe("0600001");
    expect(order.reviewNotes.map((n) => n.field)).toEqual(["destinations[0].zip"]);
  });

  it("住所か商品コードが空なら取り込まない", () => {
    const r = fromCatalogGiftApplication(catalogApp({ applicantAddress: "", productCode: " " }));
    expect(r).toEqual({ ok: false, errors: ["商品コードが空", "お届け先の住所が空"] });
  });
});

describe("自社EC → 統一注文", () => {
  it("複数の明細行と、商品ごとののしをそのまま持つ", () => {
    const order = unwrap(
      fromOwnEcOrder(
        ecOrder({
          lines: [
            { sku: "E-1", name: "商品E", price: 2160, quantity: 3, noshi: "御中元", noshiName: "伊藤" },
            { sku: "E-2", name: "商品F", price: 1080, quantity: 1, noshi: "", noshiName: "" },
          ],
        }),
      ),
    );
    const [e1, e2] = order.destinations[0].items;
    expect(e1?.noshi?.kind).toBe("御中元");
    expect(e2?.noshi).toBeNull();
  });

  it("入金取消はキャンセルにせず、入金待ちに戻して入金日を消す", () => {
    const order = unwrap(fromOwnEcOrder(ecOrder({ status: "入金取消", paidAt: "2026-10-05" })));
    expect(order.status).toBe("awaiting_payment");
    expect(order.payment?.paidAt).toBeNull();
    expect(order.reviewNotes.map((n) => n.field)).toContain("payment");
  });

  it("代引の新規注文は、入金を待たずに出荷へ進める", () => {
    expect(unwrap(fromOwnEcOrder(ecOrder({ paymentMethod: "代引" }))).status).toBe("paid");
  });

  it("箱を分けて伝票が3枚になった注文は、個口数3", () => {
    const order = unwrap(fromOwnEcOrder(ecOrder({ status: "発送済", slipNumbers: ["1", "2", "3"] })));
    expect(order.destinations[0].parcelCount).toBe(3);
  });

  it("明細がない注文は取り込まない", () => {
    expect(fromOwnEcOrder(ecOrder({ lines: [] })).ok).toBe(false);
  });
});

describe("4システム共通", () => {
  it("どのシステムから来ても、同じ Order 型で扱える", () => {
    const orders = [
      fromShippingHubRows([hubRow()]),
      fromDirectGiftRows([directRow()]),
      fromCatalogGiftApplication(catalogApp()),
      fromOwnEcOrder(ecOrder()),
    ].map(unwrap);
    expect(orders.map((o) => o.source.system)).toEqual(["shipping_hub", "direct_gift", "catalog_gift", "own_ec"]);
    // 出荷の画面が必要とする情報は、どの注文にもそろっている
    for (const o of orders) {
      expect(o.destinations.length).toBeGreaterThan(0);
      expect(o.destinations[0].items.length).toBeGreaterThan(0);
      expect(o.destinations[0].recipient.address).not.toBeNull();
    }
  });
});
