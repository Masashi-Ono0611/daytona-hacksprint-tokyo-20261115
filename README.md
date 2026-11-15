# Daytona HackSprint Tokyo (2026-11-15)

Daytona と Nosana を使ったハッカソン用リポジトリ（開発中）。

## イベント情報（コミュニティ固定投稿より）
- 主催: AI Builders / スポンサー: Daytona, Nosana
- **提出締切: 本日 16:15 JST** → https://tinyurl.com/20261115submit （Google Form）
- クレジット: Daytona https://www.theaibuilders.dev/20261115-tokyo-credits/daytona / Nosana https://www.theaibuilders.dev/20261115-tokyo-credits/nosana
  - Daytona: 受取コードを Daytona の Wallet > Redeem coupon に入力
- 審査R1（AIエージェント、上位6チーム）: Innovation / Completeness（MVP） / Real-Life Problem Solving / Sponsored Product Usage（Daytona・Nosanaの活用度）
- 審査R2: 上位6チームがステージでデモ（Google Meet https://tinyurl.com/20261115pitch ）→ 会場投票で上位3
- 連絡: team@theaibuilders.dev

## セットアップ
    cp .env.example .env   # DAYTONA_API_KEY を記入
    npm i                  # @daytonaio/sdk
    npx tsx src/hello.ts   # sandbox 作成→コマンド実行→削除の疎通確認

## Layout
- `docs/` idea・pitch・提出メモ / `src/` 実装
