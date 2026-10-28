# unified-order-model

[![CI](https://github.com/takutoshuto-hash/unified-order-model/actions/workflows/ci.yml/badge.svg)](https://github.com/takutoshuto-hash/unified-order-model/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![tests](https://img.shields.io/badge/vitest-46%20passed-brightgreen)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

**4つの受注システムでバラバラだった「注文」を、TypeScript の型で1つにそろえる。**
*Expressing one order model, unified from four in-house order systems, as TypeScript types guarded by tests.*

> 食品・ホスピタリティ系の会社で、チャネルごとに作った4つの受注システムを1つの注文モデルに統合しました（本番は PHP + MySQL で稼働中）。このリポジトリは、そのときの**論理設計を TypeScript の型とテストで表し直したもの**です。実際のコードではなく、データはすべて架空です。
>
> 設計の経緯は Zenn の記事に書いています。
> - 設計編: [「注文」という言葉が、4つのシステムで4つの意味を持っていた](https://zenn.dev/takutoshuto/articles/e12ef58cfe8f18)
> - このリポジトリの解説: [4つの受注システムの「注文」を、TypeScript の型で1つにする](https://zenn.dev/takutoshuto/articles/1485430c919762)

---

## 何が問題だったか

同じ「注文」でも、システムごとに形と意味が違っていました。

| 論点 | 出荷基幹 | 直送ギフト | カタログギフト | 自社EC |
|---|---|---|---|---|
| 明細の持ち方 | 1行に「商品1」「商品2」の固定2枠 | 1行1商品 | 1申込1商品（数量の列もない） | 1注文に複数行 |
| のし | お届け先の単位 | 商品の単位 | なし | 商品の単位 |
| 依頼主 | あり（Amazon は名前だけ） | あり | なし（申込者＝お届け先） | あり |
| 支払 | なし | 銀行振込 | なし | 振込・代引・カード |
| 「完了」の意味 | 送り状CSVを出力した | — | — | — |
| 取消 | キャンセルのフラグ | なし | なし | 「入金取消」＝入金のやり直し |

## 型でどう表したか

[`src/model.ts`](src/model.ts) に統一モデルを置き、4つの変換（[`src/adapters/`](src/adapters/)）がそこへ寄せます。

- **ない情報は `null` で表す**。カタログの依頼主（`purchaser: Party | null`）、支払の概念がないシステムの `payment` など。使う側は確認しないと読めないので、「依頼主がいる前提」のコードがコンパイルで止まる。
- **空にできないものは `NonEmptyArray`**。お届け先のない注文、明細のないお届け先は型の上で作れない。
- **ステータスは7つの値の union**。旧システムの「完了」を文字列のまま入れることはできず、[`src/status.ts`](src/status.ts) の対応表を必ず通る。`switch` は `never` で網羅をチェックするので、旧システムに状態が増えたら型エラーになる。
- **断定できないものは `reviewNotes` に残す**。先頭のゼロが落ちた郵便番号を戻したとき、電話番号の形でないとき、読めない温度帯を常温にしたときなど。推測で直したことを黙らない。
- **変換の失敗は `Result` で返す**。例外を投げずに、取り込めなかった理由を並べて返す。

## テストで守っていること

`npm run check` で型チェック（`tsc --noEmit`、`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）と Vitest を実行します。CI は Node 20 / 22 / 24。

統合のときに見つけた落とし穴を、そのままテストの名前にしています（[`test/`](test/)）。

- 出荷基幹の「完了」は送り状CSVを出しただけなので、追跡番号がなければ出荷準備中
- 自社ECの「入金取消」は注文のキャンセルではなく、入金待ちに戻す
- 固定の「商品1」「商品2」を可変の明細に開き、お届け先単位ののしを各商品に写す
- Amazon の注文は購入者の名前だけを持ち、顧客マスタにはつながない
- 数値で読まれて先頭のゼロが落ちた郵便番号は、ゼロを戻して要確認に残す
- お届け先が10件を超えたら取り込まない
- 型で防いでいること（`@ts-expect-error` で、型エラーになるべき書き方がエラーになり続けることを確かめる）

## 使い方

```bash
npm install
npm run check
```

```ts
import { fromCatalogGiftApplication } from "./src/index.js";

const result = fromCatalogGiftApplication({
  applicationNo: "C-0001",
  appliedAt: "2026-10-03",
  channel: "ハガキ",
  applicantName: "田中 三郎",
  applicantPhone: "011-000-0005",
  applicantZip: 600001, // スプレッドシートで数値として読まれ、先頭のゼロが落ちている
  applicantAddress: "北海道札幌市サンプル4-5",
  productCode: "K-300",
  productName: "カタログ商品C",
  status: "受付",
  trackingNumber: "",
});

if (result.ok) {
  result.value.destinations[0].recipient.zip; // "0600001"
  result.value.reviewNotes; // [{ field: "destinations[0].zip", reason: "数値で読まれて先頭のゼロが落ちていたので戻した: 600001" }]
}
```

## このリポジトリに入れていないもの

- 顧客マスタの名寄せ（電話番号の完全一致＋氏名のあいまい一致）と、商品コードの対応表。本番では別の工程で行っている
- 箱と個口の対応（どの商品が何個どの伝票か）。今は個口数だけを持ち、必要になったら広げる
- 実際の会社名・商品・顧客データ
