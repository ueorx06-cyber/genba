# 現場タスク管理アプリ — CLAUDE.md

Claude Codeで開発を継続するための引き継ぎドキュメント。

> **開発履歴（フェーズ1〜9）は [`開発経緯.md`](開発経緯.md) に分離。** 過去の変更の経緯を追う時だけ参照する（普段は不要）。
> このファイルには、開発中に**常に把握しておくべき情報だけ**を残している。

---

## プロジェクト概要

建設現場からの仕事依頼を管理するPWA（Progressive Web App）。
スマートフォンのホーム画面に追加して使うことを想定している。

**主な機能：**
- タスク（仕事依頼）の登録・編集・削除
- ステータス管理（未着手 / 進行中 / 完了）
- 入力項目は **現場名 / 人数 / 日付 / 作業内容・メモ** の4つ（件名は廃止）
- 日付指定（期間指定 or 候補日）
- 音声入力（全項目に個別の🎤ボタン。現場名・人数・作業内容はテキスト追記、日付は話した内容を解析して反映）
- **音声一括登録**：話した内容をブラウザ内のローカル解析（ルールベース）で構造化し、現場名・人数・日付・作業内容を自動でフォームに反映（APIキー不要・無料）
- **カレンダービュー**：リスト⇄カレンダーの切替タブ。月表示で各日にステータス色ドット、日付タップでその日のタスク一覧、タスクタップでリストの該当カードへジャンプ。カードの日付タップでカレンダーの該当日へ（相互リンク）
- データはlocalStorageに永続化
- オフライン対応（Service Worker）

---

## ファイル構成

```
genba/
├── index.html      ← アプリ本体（React + Babel をCDNで読み込むシングルファイル構成）
├── manifest.json   ← PWA設定
├── sw.js           ← Service Worker（オフライン対応・キャッシュ管理）
├── icon-192.png    ← アイコン
└── icon-512.png    ← アイコン（大）
```

ビルドステップなし。`index.html` 1ファイルにすべてのロジック・スタイルが入っている。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| UI | React 18（UMD/CDN、`18.3.1` 固定）+ Babel Standalone（`@7.26.4` 固定） |
| スタイリング | インラインスタイル（CSS-in-JS的な記述） |
| 状態管理 | React useState |
| 永続化 | localStorage（キー: `genba_tasks_v2`） |
| 音声認識 | Web Speech API（`SpeechRecognition` / `webkitSpeechRecognition`） |
| テキスト解析 | ローカル（ルールベース）解析 — `parseVoiceLocal` / `parseVoiceLabeled` / `extractDates` / `resolveDateToken` / `DATE_RE`。外部API・課金なし |
| PWA | manifest.json + Service Worker |
| ホスティング | GitHub Pages |

---

## 重要な知識・注意点

過去のバグや設計判断から得た、**壊さないために必ず守るべきルール**。背景の詳細は [`開発経緯.md`](開発経緯.md)。

### 1. 音声一括登録はローカル解析（APIキー・課金なし）

- 解析はブラウザ内の `parseVoiceLocal` で完結。Anthropic等の外部APIは使わない（ユーザー方針：課金しない）。
- **この機能をAPI/AI方式で復活させないこと。** 精度を上げたい場合は `DATE_RE` や各抽出正規表現（人数・現場名・作業内容）を拡張する。
- 音声認識（文字起こし）自体は Web Speech API なので**ネット接続が必要**。完全オフラインで動くのは「解析」部分のみ。
- 相対日付の基準は実行時の `new Date()`（今日）。

### 2. Web Speech API はモバイルで `continuous=true` を使わない

- スマホ（Android/iOSのChrome・Safari）は `continuous=true` で確定語を再報告し、語が大量に重複する。
- 連続的に聞きたい場合は **`continuous=false`（1発話ごと）＋ `onend` で自動再開** を使う（`startAiRec` 参照）。停止フラグはrefで持ち、確定テキストもrefに蓄積する。
- 単発入力（`MicButton`）は `continuous=false` / `interimResults=false` で重複しない。

### 3. CDNはバージョン固定必須

- React/ReactDOM `18.3.1`、`@babel/standalone@7.26.4` を**固定**。`@18` のようなメジャー指定や無指定に戻さない。
- 無指定にするとCDN側の自動更新（過去にBabel 8へ更新）でブラウザ内コンパイルが失敗し、**スマホで黒画面**になる。
- この3つのCDNは `sw.js` の `ASSETS` にも登録しプリキャッシュしている。

### 4. Service Worker のキャッシュ

- `sw.js` は **HTMLはネットワーク優先＋オフライン時のみキャッシュ**。さらに `deploy.bat` がデプロイ毎にキャッシュ名を更新するため、通常はキャッシュ削除なしで最新が反映される。
- **`sw.js` を cache-first に戻さないこと**（更新が出なくなる）。

### 5. 音声一括登録の発話ルール（挙動理解のため）

- **ラベル指定モード**：「現場名 ○○ 日付 ○○ 作業内容 ○○ 人数 ○○」と項目名を区切って話すと確実に振り分く（順不同可）。ラベルが無ければ自動推定にフォールバック。
- **自動推定**：現場名判定は マンション種別/社名キーワード → 「○○の現場」 → 最初の語 の優先順。推奨発話順は **現場名 → 日付 → 作業内容 → 人数**。
- **日付モード判定**：範囲マーカー（から/〜/まで）で2日付が繋がった時だけ「期間指定」、それ以外（単一・複数）は「候補日」。

---

## データ構造（タスクオブジェクト）

```js
{
  id: Number,
  siteName: String,        // 現場名
  detail: String,          // 作業内容・メモ（カードの見出しに使用）
  workers: String,         // 人数（例: "2〜3人"）
  status: "未着手" | "進行中" | "完了",
  dateMode: "期間指定" | "候補日",
  dateFrom: String,        // YYYY-MM-DD
  dateTo: String,          // YYYY-MM-DD（期間指定のみ）
  candidateDates: String[], // YYYY-MM-DD[]（候補日のみ）
  createdAt: Number,       // Date.now()
}
```

localStorageキー：`const STORAGE_KEY = "genba_tasks_v2";`

---

## GitHub Pagesへのデプロイ手順

**git連携済み。ファイルを修正したら `deploy.bat` をダブルクリックするだけ。**

```
C:\Users\uenou\Documents\Claude\genba_kanri\deploy.bat
```

`deploy.bat` の処理：
1. `sw.js` のキャッシュ名を現在時刻に自動更新（スマホのキャッシュ対策）
2. `git add -A` → `git commit` → `git push origin main`
3. 1〜2分で `https://ueorx06-cyber.github.io/genba/` に反映

- **リポジトリ：** `github.com/ueorx06-cyber/genba`（`main`ブランチからPages配信）。
- **認証：** 初回プッシュで Git Credential Manager にログイン済み。以降は不要。
- **公開対象：** `index.html / manifest.json / sw.js / icon-192.png / icon-512.png / CLAUDE.md`。`.claude/`（ローカル設定）・`deploy.bat`・スクショは `.gitignore` で除外。

> 手動でやる場合：`git add -A; git commit -m "..."; git push origin main`
> Claudeに「デプロイして」と頼めば代わりにpushも可能。

---

## 今後の開発候補（未実装）

- タスクのカテゴリ・タグ付け
- 複数デバイス間でのデータ同期（現状はlocalStorageのみ）
- 担当者の割り当て
- 完了タスクのアーカイブ
- 印刷・PDF出力
