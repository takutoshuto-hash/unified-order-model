import type { Order, Result, ReviewNote } from "../model.js";
import { blankToNull, normalizePhone, normalizeZip } from "../normalize.js";
import { fromCatalogGift, type CatalogGiftStatus } from "../status.js";

/**
 * カタログギフトの申込（QR・Web・ハガキ）。1申込＝1商品で、数量の列すらない。
 * 申込者がそのままお届け先なので、依頼主の情報はない。のし・支払もない。
 */
export interface CatalogGiftApplication {
  applicationNo: string;
  appliedAt: string;
  /** QR・Web・ハガキ */
  channel: string;
  applicantName: string;
  applicantPhone: string;
  applicantZip: string | number;
  applicantAddress: string;
  productCode: string;
  productName: string;
  status: CatalogGiftStatus;
  trackingNumber: string;
}

/** カタログの商品は贈られた側が選ぶので、注文の金額は 0 として扱う */
const CATALOG_UNIT_PRICE = 0;

export function fromCatalogGiftApplication(app: CatalogGiftApplication): Result<Order> {
  const errors: string[] = [];
  if (!blankToNull(app.productCode)) errors.push("商品コードが空");
  if (!blankToNull(app.applicantAddress)) errors.push("お届け先の住所が空");
  if (errors.length > 0) return { ok: false, errors };

  const notes: ReviewNote[] = [];
  const tracking = blankToNull(app.trackingNumber);
  return {
    ok: true,
    value: {
      source: { system: "catalog_gift", channel: app.channel, recordId: app.applicationNo },
      orderedAt: app.appliedAt,
      purchaser: null,
      payment: null,
      status: fromCatalogGift(app.status),
      destinations: [
        {
          recipient: {
            name: app.applicantName,
            phone: normalizePhone(app.applicantPhone, "destinations[0].phone", notes),
            zip: normalizeZip(app.applicantZip, "destinations[0].zip", notes),
            address: blankToNull(app.applicantAddress),
            email: null,
          },
          shipDate: null,
          timeSlot: null,
          cool: "normal",
          trackingNumbers: tracking ? [tracking] : [],
          parcelCount: 1,
          items: [
            {
              productCode: app.productCode,
              productName: app.productName,
              unitPrice: CATALOG_UNIT_PRICE,
              quantity: 1,
              noshi: null,
            },
          ],
        },
      ],
      customerId: null,
      reviewNotes: notes,
    },
  };
}
