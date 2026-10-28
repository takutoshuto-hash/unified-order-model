import {
  MAX_DESTINATIONS,
  type Destination,
  type NonEmptyArray,
  type Order,
  type OrderItem,
  type Result,
  type ReviewNote,
} from "../model.js";
import { blankToNull, normalizePhone, normalizeZip, parseCool } from "../normalize.js";
import { fromDirectGift, type DirectGiftStatus } from "../status.js";

/**
 * 直送ギフトの申込（スプレッドシート）の1行。1行＝1商品。
 * 同じ申込番号・同じお届け先の行が1つのお届け先にまとまる。
 * のしは実質、商品ごと。支払は銀行振込で、入金を消し込んだ日が入る。
 */
export interface DirectGiftRow {
  applicationNo: string;
  appliedAt: string;
  purchaserName: string;
  purchaserPhone: string;
  purchaserZip: string | number;
  purchaserAddress: string;
  purchaserEmail: string;
  recipientName: string;
  recipientPhone: string;
  recipientZip: string | number;
  recipientAddress: string;
  shipDate: string;
  cool: string;
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  noshiKind: string;
  noshiName: string;
  paidAt: string;
  status: DirectGiftStatus;
  trackingNumber: string;
}

export function fromDirectGiftRows(rows: DirectGiftRow[]): Result<Order> {
  const [first, ...rest] = rows;
  if (!first) return { ok: false, errors: ["行がない"] };
  if (rest.some((r) => r.applicationNo !== first.applicationNo)) {
    return { ok: false, errors: ["申込番号の違う行が混ざっている"] };
  }

  const notes: ReviewNote[] = [];
  // お届け先は「氏名＋電話＋住所」が同じ行をまとめる
  const groups = new Map<string, DirectGiftRow[]>();
  for (const row of rows) {
    const key = [row.recipientName, row.recipientPhone, row.recipientAddress].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  if (groups.size > MAX_DESTINATIONS) {
    return { ok: false, errors: [`お届け先が${MAX_DESTINATIONS}件を超えている: ${groups.size}件`] };
  }

  const destinations = [...groups.values()].map((group, i): Destination => {
    const head = group[0]!;
    const items = group.map(
      (r): OrderItem => ({
        productCode: r.productCode,
        productName: r.productName,
        unitPrice: r.unitPrice,
        quantity: r.quantity,
        noshi: blankToNull(r.noshiKind)
          ? { kind: r.noshiKind.trim(), nameOnNoshi: blankToNull(r.noshiName) }
          : null,
      }),
    );
    const tracking = [...new Set(group.map((r) => r.trackingNumber.trim()).filter(Boolean))];
    return {
      recipient: {
        name: head.recipientName,
        phone: normalizePhone(head.recipientPhone, `destinations[${i}].phone`, notes),
        zip: normalizeZip(head.recipientZip, `destinations[${i}].zip`, notes),
        address: blankToNull(head.recipientAddress),
        email: null,
      },
      shipDate: blankToNull(head.shipDate),
      timeSlot: null,
      cool: parseCool(head.cool, `destinations[${i}].cool`, notes),
      trackingNumbers: tracking,
      parcelCount: Math.max(1, tracking.length),
      items: items as NonEmptyArray<OrderItem>,
    };
  });

  return {
    ok: true,
    value: {
      source: { system: "direct_gift", channel: "web", recordId: first.applicationNo },
      orderedAt: first.appliedAt,
      purchaser: {
        name: first.purchaserName,
        phone: normalizePhone(first.purchaserPhone, "purchaser.phone", notes),
        zip: normalizeZip(first.purchaserZip, "purchaser.zip", notes),
        address: blankToNull(first.purchaserAddress),
        email: blankToNull(first.purchaserEmail),
      },
      payment: { method: "bank_transfer", paidAt: blankToNull(first.paidAt) },
      status: fromDirectGift(first.status),
      destinations: destinations as NonEmptyArray<Destination>,
      customerId: null,
      reviewNotes: notes,
    },
  };
}
