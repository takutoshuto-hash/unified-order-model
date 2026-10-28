import type { NonEmptyArray, Order, OrderItem, PaymentMethod, Result, ReviewNote } from "../model.js";
import { blankToNull, normalizePhone, normalizeZip, parseCool } from "../normalize.js";
import { fromOwnEc, type OwnEcStatus } from "../status.js";

/**
 * 自社EC（PHP・MySQL）の注文。1注文に複数の明細行があり、のしは商品ごと。
 * 数量が多いと箱に分け、箱がさらに送り状の個口に分かれる（このチャネルだけ）。
 */
export interface OwnEcOrder {
  orderId: number;
  orderedAt: string;
  customer: { name: string; tel: string; zip: string; address: string; email: string };
  delivery: { name: string; tel: string; zip: string; address: string; date: string; time: string; cool: string };
  paymentMethod: "振込" | "代引" | "カード";
  paidAt: string | null;
  status: OwnEcStatus;
  lines: OwnEcLine[];
  /** 送り状の伝票番号。箱を分けると複数になる */
  slipNumbers: string[];
}

export interface OwnEcLine {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  noshi: string;
  noshiName: string;
}

const PAYMENT_METHODS: Record<OwnEcOrder["paymentMethod"], PaymentMethod> = {
  振込: "bank_transfer",
  代引: "cash_on_delivery",
  カード: "card",
};

/** 代引は届けたときに払うので、出荷の前に入金を待たない */
const needsPaymentBeforeShipping = (m: PaymentMethod): boolean => m === "bank_transfer";

export function fromOwnEcOrder(o: OwnEcOrder): Result<Order> {
  const [firstLine, ...restLines] = o.lines;
  if (!firstLine) return { ok: false, errors: [`注文 ${o.orderId}: 明細がない`] };

  const notes: ReviewNote[] = [];
  const method = PAYMENT_METHODS[o.paymentMethod];
  const toItem = (l: OwnEcLine): OrderItem => ({
    productCode: l.sku,
    productName: l.name,
    unitPrice: l.price,
    quantity: l.quantity,
    noshi: blankToNull(l.noshi) ? { kind: l.noshi.trim(), nameOnNoshi: blankToNull(l.noshiName) } : null,
  });
  const items: NonEmptyArray<OrderItem> = [toItem(firstLine), ...restLines.map(toItem)];

  if (o.status === "入金取消") {
    notes.push({ field: "payment", reason: "入金の取消があった。キャンセルではなく入金待ちに戻した" });
  }

  return {
    ok: true,
    value: {
      source: { system: "own_ec", channel: "web", recordId: String(o.orderId) },
      orderedAt: o.orderedAt,
      purchaser: {
        name: o.customer.name,
        phone: normalizePhone(o.customer.tel, "purchaser.phone", notes),
        zip: normalizeZip(o.customer.zip, "purchaser.zip", notes),
        address: blankToNull(o.customer.address),
        email: blankToNull(o.customer.email),
      },
      payment: { method, paidAt: o.status === "入金取消" ? null : o.paidAt },
      status: fromOwnEc(o.status, needsPaymentBeforeShipping(method)),
      destinations: [
        {
          recipient: {
            name: o.delivery.name,
            phone: normalizePhone(o.delivery.tel, "destinations[0].phone", notes),
            zip: normalizeZip(o.delivery.zip, "destinations[0].zip", notes),
            address: blankToNull(o.delivery.address),
            email: null,
          },
          shipDate: blankToNull(o.delivery.date),
          timeSlot: blankToNull(o.delivery.time),
          cool: parseCool(o.delivery.cool, "destinations[0].cool", notes),
          trackingNumbers: o.slipNumbers,
          parcelCount: Math.max(1, o.slipNumbers.length),
          items,
        },
      ],
      customerId: null,
      reviewNotes: notes,
    },
  };
}
