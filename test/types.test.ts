/**
 * 型で防いでいることのテスト。中身は `npm run typecheck`（tsc）で確かめる。
 * `@ts-expect-error` の行がエラーにならなくなったら、型チェックが落ちる。
 */
import { expectTypeOf, it } from "vitest";
import type { Destination, Order, OrderItem, OrderStatus, Party } from "../src/index.js";

it("お届け先と明細は、空の配列にできない", () => {
  // @ts-expect-error お届け先のない注文は作れない
  const noDestination: Order["destinations"] = [];
  // @ts-expect-error 明細のないお届け先は作れない
  const noItem: Destination["items"] = [];
  void noDestination;
  void noItem;
});

it("依頼主と支払は null がありうるので、使う側に確認を強いる", () => {
  expectTypeOf<Order["purchaser"]>().toEqualTypeOf<Party | null>();
  const nameOf = (o: Order): string => {
    // @ts-expect-error カタログの注文では依頼主がいないので、そのままは読めない
    const name: string = o.purchaser.name;
    void name;
    return o.purchaser?.name ?? o.destinations[0].recipient.name;
  };
  void nameOf;
});

it("ステータスは決めた7つの値しか入らない", () => {
  // @ts-expect-error 旧システムの「完了」をそのまま入れることはできない
  const raw: OrderStatus = "完了";
  void raw;
});

it("明細の単価は数値（スプレッドシートの文字列のまま入れない）", () => {
  expectTypeOf<OrderItem["unitPrice"]>().toEqualTypeOf<number>();
});
