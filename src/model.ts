/**
 * 統一注文モデル（5エンティティのうち、注文・お届け先・明細の3つ）。
 *
 * 4つの受注システムで「注文」の形が違っていたのを、1つの型にそろえる。
 * 顧客マスタと商品マスタは名寄せ用の索引なので、ここでは ID の参照だけを持つ。
 */

/** どのシステムから来た注文か */
export type SourceSystem = "shipping_hub" | "direct_gift" | "catalog_gift" | "own_ec";

/** 統一ステータス（6状態＋キャンセル） */
export type OrderStatus =
  | "received" // 受付
  | "awaiting_payment" // 入金待ち
  | "paid" // 入金確認済み
  | "preparing" // 出荷準備中
  | "shipped" // 出荷済み
  | "completed" // 完了
  | "cancelled"; // キャンセル

export type NonEmptyArray<T> = [T, ...T[]];

/** 1注文に持てるお届け先の上限 */
export const MAX_DESTINATIONS = 10;

export interface Order {
  /** どのシステムのどの行から来たか。再取込を冪等にするための鍵 */
  source: SourceRef;
  orderedAt: string;
  /** 依頼主。カタログの通常申込は「申込者＝お届け先」なので null */
  purchaser: Party | null;
  /** 支払。支払の概念がないシステムは null */
  payment: Payment | null;
  status: OrderStatus;
  destinations: NonEmptyArray<Destination>;
  /** 顧客マスタへの参照は任意。Amazon のように顧客を作れない注文は null */
  customerId: string | null;
  /** コードから断定できなかった点。黙って埋めずに残す */
  reviewNotes: ReviewNote[];
}

export interface SourceRef {
  system: SourceSystem;
  /** 電話・FAX・Amazon など、システムの中の受付経路 */
  channel: string;
  recordId: string;
}

/**
 * 氏名・住所は注文した時点の写し（スナップショット）。
 * 顧客が引っ越しても、過去の配送記録は書き換わらない。
 */
export interface Party {
  name: string;
  phone: string | null;
  zip: string | null;
  address: string | null;
  email: string | null;
}

export type PaymentMethod = "bank_transfer" | "cash_on_delivery" | "invoice" | "card";

export interface Payment {
  method: PaymentMethod;
  paidAt: string | null;
}

export type CoolType = "normal" | "chilled" | "frozen";

export interface Destination {
  recipient: Party;
  shipDate: string | null;
  timeSlot: string | null;
  cool: CoolType;
  trackingNumbers: string[];
  /** 個口数。箱の分割は当面1チャネルだけなので、数だけ持って将来に備える */
  parcelCount: number;
  items: NonEmptyArray<OrderItem>;
}

/** 商品コード・名前・単価も注文した時点の写し。マスタを改定しても過去の注文を再現できる */
export interface OrderItem {
  productCode: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  /** のし・名入れは商品単位にそろえる */
  noshi: Noshi | null;
}

export interface Noshi {
  kind: string;
  nameOnNoshi: string | null;
}

export interface ReviewNote {
  field: string;
  reason: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
