import {
  MAX_DESTINATIONS,
  type Destination,
  type NonEmptyArray,
  type Order,
  type OrderItem,
  type Party,
  type Result,
  type ReviewNote,
} from "../model.js";
import { blankToNull, normalizePhone, normalizeZip, parseCool } from "../normalize.js";
import { fromShippingHub, type ShippingHubStatus } from "../status.js";

/**
 * 出荷基幹（スプレッドシート）の1行。1行＝1お届け先で、同じ受注番号の行が1つの注文になる。
 * 商品は「商品1」「商品2」の固定の列で、2点までしか持てない。
 * のしはお届け先の単位で1つ（2商品で共有）。支払の列はない。
 */
export interface ShippingHubRow {
  rowId: string;
  orderNo: string;
  orderedAt: string;
  /** 電話・FAX・Amazon など */
  channel: string;
  purchaserName: string;
  purchaserPhone: string;
  purchaserZip: string | number;
  purchaserAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientZip: string | number;
  recipientAddress: string;
  shipDate: string;
  timeSlot: string;
  cool: string;
  noshiKind: string;
  noshiName: string;
  item1Code: string;
  item1Name: string;
  item1Price: number;
  item1Qty: number;
  item2Code: string;
  item2Name: string;
  item2Price: number | null;
  item2Qty: number | null;
  status: ShippingHubStatus;
  cancelled: boolean;
  trackingNumber: string;
}

/** Amazon の注文は規約上、購入者の電話・住所・メールを持てない（名前だけ） */
const NAME_ONLY_CHANNELS = new Set(["Amazon"]);

export function fromShippingHubRows(rows: ShippingHubRow[]): Result<Order> {
  const [first, ...rest] = rows;
  if (!first) return { ok: false, errors: ["行がない"] };
  const errors: string[] = [];
  if (rest.some((r) => r.orderNo !== first.orderNo)) {
    errors.push("受注番号の違う行が混ざっている");
  }
  if (rows.length > MAX_DESTINATIONS) {
    errors.push(`お届け先が${MAX_DESTINATIONS}件を超えている: ${rows.length}件`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const notes: ReviewNote[] = [];
  const destinations: Destination[] = [];
  for (const row of rows) {
    const dest = toDestination(row, notes);
    if (!dest.ok) return dest;
    destinations.push(dest.value);
  }

  const nameOnly = NAME_ONLY_CHANNELS.has(first.channel);
  const purchaser: Party = nameOnly
    ? { name: first.purchaserName, phone: null, zip: null, address: null, email: null }
    : {
        name: first.purchaserName,
        phone: normalizePhone(first.purchaserPhone, "purchaser.phone", notes),
        zip: normalizeZip(first.purchaserZip, "purchaser.zip", notes),
        address: blankToNull(first.purchaserAddress),
        email: null,
      };

  // 1行でもキャンセルなら注文全体をキャンセルとみなす。行ごとに違う状態は人に確認する
  const cancelled = rows.some((r) => r.cancelled);
  if (cancelled && !rows.every((r) => r.cancelled)) {
    notes.push({ field: "status", reason: "キャンセルの行とそうでない行が混ざっている" });
  }
  const shippedAll = rows.every((r) => r.trackingNumber.trim() !== "");

  return {
    ok: true,
    value: {
      source: { system: "shipping_hub", channel: first.channel, recordId: first.orderNo },
      orderedAt: first.orderedAt,
      purchaser,
      payment: null,
      status: fromShippingHub(first.status, cancelled, shippedAll),
      destinations: destinations as NonEmptyArray<Destination>,
      customerId: null,
      reviewNotes: notes,
    },
  };
}

function toDestination(row: ShippingHubRow, notes: ReviewNote[]): Result<Destination> {
  const noshi = blankToNull(row.noshiKind)
    ? { kind: row.noshiKind.trim(), nameOnNoshi: blankToNull(row.noshiName) }
    : null;

  // 固定の2列を可変の明細に開く。お届け先単位ののしは、それぞれの商品に写す
  const items: OrderItem[] = [
    {
      productCode: row.item1Code,
      productName: row.item1Name,
      unitPrice: row.item1Price,
      quantity: row.item1Qty,
      noshi,
    },
  ];
  if (blankToNull(row.item2Code)) {
    if (row.item2Price == null || row.item2Qty == null) {
      return { ok: false, errors: [`行 ${row.rowId}: 商品2の単価か数量が空`] };
    }
    items.push({
      productCode: row.item2Code,
      productName: row.item2Name,
      unitPrice: row.item2Price,
      quantity: row.item2Qty,
      noshi,
    });
  }

  const tracking = blankToNull(row.trackingNumber);
  return {
    ok: true,
    value: {
      recipient: {
        name: row.recipientName,
        phone: normalizePhone(row.recipientPhone, `destinations[${row.rowId}].phone`, notes),
        zip: normalizeZip(row.recipientZip, `destinations[${row.rowId}].zip`, notes),
        address: blankToNull(row.recipientAddress),
        email: null,
      },
      shipDate: blankToNull(row.shipDate),
      timeSlot: blankToNull(row.timeSlot),
      cool: parseCool(row.cool, `destinations[${row.rowId}].cool`, notes),
      trackingNumbers: tracking ? [tracking] : [],
      parcelCount: 1,
      items: items as NonEmptyArray<OrderItem>,
    },
  };
}
