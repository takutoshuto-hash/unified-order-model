import type { OrderStatus } from "./model.js";

/**
 * ステータスは名前ではなく、業務上の意味で対応させる。
 * 同じ「完了」でも、システムによって指しているものが違う。
 */

export function assertNever(x: never): never {
  throw new Error(`想定していない値: ${JSON.stringify(x)}`);
}

export type ShippingHubStatus = "受付" | "出荷準備" | "完了";

/**
 * 出荷基幹の「完了」は「送り状CSVを出力した」という意味で、配送が終わったわけではない。
 * 文字列のまま completed に寄せると、まだ発送していない注文を完了扱いにしてしまう。
 * 追跡番号が入っていれば出荷済み、なければ出荷準備中とみなす。
 */
export function fromShippingHub(
  status: ShippingHubStatus,
  cancelled: boolean,
  hasTracking: boolean,
): OrderStatus {
  if (cancelled) return "cancelled";
  switch (status) {
    case "受付":
      return "received";
    case "出荷準備":
      return "preparing";
    case "完了":
      return hasTracking ? "shipped" : "preparing";
    default:
      return assertNever(status);
  }
}

/** 直送はキャンセルの状態を持たない（削除は手作業） */
export type DirectGiftStatus = "入金待ち" | "入金済" | "発送済";

export function fromDirectGift(status: DirectGiftStatus): OrderStatus {
  switch (status) {
    case "入金待ち":
      return "awaiting_payment";
    case "入金済":
      return "paid";
    case "発送済":
      return "shipped";
    default:
      return assertNever(status);
  }
}

/** カタログは支払もキャンセルもない。受付と発送済みだけ */
export type CatalogGiftStatus = "受付" | "発送済";

export function fromCatalogGift(status: CatalogGiftStatus): OrderStatus {
  switch (status) {
    case "受付":
      return "received";
    case "発送済":
      return "shipped";
    default:
      return assertNever(status);
  }
}

export type OwnEcStatus = "新規" | "入金確認" | "入金取消" | "発送済";

/**
 * 自社ECの「入金取消」は注文のキャンセルではなく、入金の消し込みのやり直し。
 * cancelled にすると、お客さんが払うつもりの注文を落としてしまう。入金待ちに戻す。
 */
export function fromOwnEc(status: OwnEcStatus, needsPayment: boolean): OrderStatus {
  switch (status) {
    case "新規":
      return needsPayment ? "awaiting_payment" : "paid";
    case "入金確認":
      return "paid";
    case "入金取消":
      return "awaiting_payment";
    case "発送済":
      return "shipped";
    default:
      return assertNever(status);
  }
}
