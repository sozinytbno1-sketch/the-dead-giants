---
name: create-news-video
description: Tạo video documentary 16:9 (~8–15 phút) cho kênh YouTube "The Dead Giants" kể lịch sử các thương hiệu nổi tiếng. Trigger khi user yêu cầu tạo video documentary thương hiệu, kể lịch sử brand, làm video YouTube The Dead Giants. Output: video.mp4 1920×1080 + voice.mp3 + script.json.
---

# Create Documentary Video Skill — The Dead Giants

Generate a Vietnamese 16:9 cinematic-documentary video (8–15 minutes) for the YouTube channel **"The Dead Giants"** (`@thedeadgiantsHQ`) that tells the rise-and-fall story of a famous brand.

## Channel voice

- **Tone:** cinematic documentary, không phải tin tức nhanh
- **Pacing:** chậm, có nhịp; câu dài hơn news, dùng tu từ, ẩn dụ
- **Cấu trúc kịch bản:** Hook → Bối cảnh ra đời → Đỉnh cao → Khủng hoảng/Bí mật → Bài học → Outro
- **Voice talent:** giọng kể chuyện trầm, ấm; speed = 0.95–1.0
- **Video length:** 8–15 phút (≈ 1500–2500 từ tổng cộng cho voiceText)
- **Scenes:** 15–60 (tối thiểu 15, lý tưởng 25–40 cho 10 phút)

## Input

A single argument:
- A URL to a Wikipedia page / article about a brand, OR
- A path to a `.txt` file containing brand history notes

## Workflow (MUST follow in order)

### Step 1: Detect input type

- Starts with `http://` / `https://` → URL mode
- Otherwise → file mode

### Step 2: Fetch content

**URL mode:**
- Use `WebFetch` with prompt:
  ```
  Trích xuất từ trang này (Wikipedia / bài báo về một thương hiệu):
  - title (string): tên thương hiệu, vd "McDonald's"
  - founded (string|null): năm thành lập, vd "1940"
  - country (string|null): quốc gia gốc, vd "Hoa Kỳ"
  - founders (string[]): tên người sáng lập
  - keyMoments: mảng các mốc quan trọng [{ year, summary }] — đặc biệt các mốc khủng hoảng/bí mật
  - downfall (string|null): sự sụp đổ, vấn đề lớn, scandal nếu có
  - quotes: mảng câu nói nổi tiếng [{ author, quote, role }]
  - facts: mảng "did you know?" facts ít người biết
  - ogImage (string|null): URL ảnh đại diện
  - domain (string)
  Trả về JSON với các field trên.
  ```
- If WebFetch fails → tell user to save content to `.txt` file and pass that instead. Stop.

**File mode:**
- Read the file
- title = first non-empty line (brand name)
- Parse the rest as free-form notes for the LLM to structure

### Step 3: Create slug + output directory

- slug = lowercase ASCII brand name, replace non-alphanumeric with `-`, trim, max 40 chars
- timestamp = `YYYYMMDD-HHmm`
- outputDir = `output/<slug>-<timestamp>/`
- `mkdir -p <outputDir>`

### Step 4: Generate script.json

The pipeline uses `src/render/script-schema.ts` (Zod). Key constraints:

- `version: "1.0"`
- `metadata.channel: "The Dead Giants"`
- `voice.provider: "lucylab"`, `voiceId: "${VIETNAMESE_VOICEID}"` (substituted at runtime), `speed: 0.95`
- `scenes`: **15–60 items**, first scene `type: "hook"`, last scene `type: "outro"`
- All other scenes: `type: "body"`

#### Documentary structure (recommended for ~10-minute video, 25–35 scenes)

| Section | # scenes | Templates |
|---|---|---|
| **Hook** (0:00–0:25) | 1 | `hook` — opening question/claim |
| **Chương 1: Bối cảnh ra đời** (0:25–2:30) | 4–6 | `chapter-title` → `brand-logo` → `timeline` → `body` (stat-hero/feature-list/quote-card) |
| **Chương 2: Đỉnh cao** (2:30–5:00) | 4–6 | `chapter-title` → `stat-hero` → `quote-card` → `feature-list` → `fact-card` |
| **Chương 3: Khủng hoảng/Bí mật** (5:00–8:00) | 5–8 | `chapter-title` → `callout` (warnings) → `fact-card` → `comparison` (before/after) → `quote-card` |
| **Chương 4: Bài học** (8:00–9:30) | 3–5 | `chapter-title` → `callout` → `quote-card` → `fact-card` |
| **Outro** (9:30–end) | 1 | `outro` — Subscribe CTA |

Use `chapter-title` to mark each chapter. Use 2–4 `quote-card` scenes for famous quotes from founders/critics. Use 2–3 `fact-card` scenes for "did you know?" surprises. Use 1 `timeline` for early history. Use 1 `brand-logo` to introduce the brand visually.

#### Templates available (11 total)

| Template | Purpose | Documentary use |
|---|---|---|
| `hook` | Opening claim/question, big background image | Mở video — câu hỏi hấp dẫn |
| `brand-logo` | Brand intro card (founded, origin) | Sau hook — giới thiệu chính thức |
| `chapter-title` | "Chương N: Title" cinematic divider | Mở mỗi chương |
| `timeline` | Horizontal timeline of 2–6 events | Lịch sử ra đời, các mốc lớn |
| `quote-card` | Quote + author + role | Câu nói của founder, critic, journalist |
| `fact-card` | "BẠN CÓ BIẾT?" surprising fact | Bí mật ít người biết |
| `stat-hero` | Big number + label | Doanh thu, số cửa hàng, market cap |
| `feature-list` | Title + 1–5 bullets | Lý do thành công, sai lầm, sản phẩm |
| `comparison` | Side-by-side comparison | Trước vs Sau khủng hoảng |
| `callout` | Italic statement in card | Tuyên bố quan trọng, khẳng định |
| `outro` | YouTube end-screen with Subscribe | Kết video |

#### Example chapter-title

```json
{
  "id": "ch2-title",
  "type": "body",
  "voiceText": "Chương hai. Đỉnh cao của một đế chế.",
  "templateData": {
    "template": "chapter-title",
    "chapterNumber": 2,
    "title": "Đỉnh Cao",
    "subtitle": "Khi cả thế giới gọi tên họ"
  }
}
```

#### Example quote-card

```json
{
  "id": "kroc-quote",
  "type": "body",
  "voiceText": "Ray Kroc từng nói, nếu bạn không phải người dám chấp nhận rủi ro, bạn nên rời khỏi thương trường.",
  "templateData": {
    "template": "quote-card",
    "quote": "If you're not a risk taker, you should get the hell out of business.",
    "author": "Ray Kroc",
    "role": "Founder, McDonald's"
  }
}
```

#### Example timeline

```json
{
  "id": "early-history",
  "type": "body",
  "voiceText": "Câu chuyện bắt đầu năm một chín bốn mươi, khi anh em nhà McDonald mở cửa hàng đầu tiên ở California.",
  "templateData": {
    "template": "timeline",
    "title": "Những mốc đầu tiên",
    "events": [
      { "year": "1940", "text": "Anh em McDonald mở cửa hàng đầu tiên" },
      { "year": "1955", "text": "Ray Kroc mua lại McDonald's" },
      { "year": "1965", "text": "IPO trên sàn chứng khoán" },
      { "year": "1971", "text": "Vượt mốc 1,500 cửa hàng" }
    ]
  }
}
```

#### Example fact-card

```json
{
  "id": "fact-1962",
  "type": "body",
  "voiceText": "Nhưng ít ai biết, năm một chín sáu hai, McDonald's từng đứng trên bờ vực phá sản vì khoản nợ sáu triệu đô la của Ray Kroc.",
  "templateData": {
    "template": "fact-card",
    "label": "BẠN CÓ BIẾT?",
    "fact": "McDonald's từng suýt phá sản năm 1962 vì Ray Kroc nợ hơn 6 triệu đô la."
  }
}
```

#### Example brand-logo

```json
{
  "id": "brand-intro",
  "type": "body",
  "voiceText": "Đây là McDonald's, đế chế thức ăn nhanh lớn nhất thế giới.",
  "templateData": {
    "template": "brand-logo",
    "brandName": "McDonald's",
    "founded": "1940",
    "country": "Hoa Kỳ",
    "bgSrc": "$source.image",
    "kenBurns": "zoom-in"
  }
}
```

#### Outro (always last scene)

```json
{
  "id": "outro",
  "type": "outro",
  "voiceText": "Cảm ơn bạn đã xem. Subscribe The Dead Giants để khám phá những gã khổng lồ đã ngã xuống.",
  "templateData": {
    "template": "outro",
    "ctaTop": "Subscribe",
    "channelName": "The Dead Giants",
    "source": "thedeadgiantsHQ"
  }
}
```

### ⚠️ CRITICAL: Vietnamese TTS Phonetic Rules

Field `voiceText` is read aloud by the Vietnamese TTS. **Always spell out numbers and brand-specific data in Vietnamese phonetic form.** The visual `templateData` fields (text on screen) keep readable formatting like "1955" or "$6M".

**Rules:**

| Number form | WRONG (TTS misreads) | RIGHT (spell out) |
|---|---|---|
| Year | `1955` | `năm một chín năm lăm` (or `năm 1955` reads OK as digits) |
| Decimal | `1.5 tỷ` | `một phẩy năm tỷ` |
| Big number | `6,000,000` | `sáu triệu` |
| USD | `$5` | `năm đô la` |
| Percent | `30%` | `ba mươi phần trăm` |
| Multiplier | `2x` | `gấp đôi` |

**Brand names:** keep as-is in voiceText, TTS handles them OK:
- `McDonald's`, `Apple`, `Nokia`, `Kodak`, `Blockbuster`, `Pan Am` ✅

**Symbols to AVOID in voiceText:** `→` `&` `%` `$` `#` `+` `=` (TTS may say literal name or skip).

**End each sentence with `.` or `?` or `,`** for natural pauses.

**Hook (most important — first 5 seconds of attention):**
- Should pose a question, dramatic claim, or shocking statistic
- AVOID generic openers ("Hôm nay chúng ta sẽ kể..." is wrong)
- GOOD example: `"Năm một chín tám tám, một đế chế trị giá ba mươi tỷ đô la đã sụp đổ chỉ sau mười tám tháng. Đây là câu chuyện của Pan Am."`

### Step 5: Self-validate

- Total word count ~1500–2500
- 15–60 scenes
- scenes[0].type === "hook"
- last scene type === "outro"
- All template enum values valid
- Each `voiceText` ≥ 1 char, no emoji, no URL

If invalid, fix yourself silently. Up to 2 self-correction passes. Then write — Zod will produce a precise error.

### Step 6: Write script.json

Use the Write tool (not Bash) to write to `<outputDir>/script.json`.

### Step 7 (optional): Pre-place voice/images for manual override

The pipeline is idempotent. If you (or the user) place files BEFORE running the pipeline, those files are used as-is and the corresponding API call is skipped:

```
output/my-video/
  script.json
  voice/
    scene-hook.mp3        ← skip TTS for "hook" scene
    scene-body-1.mp3      ← skip TTS for "body-1"
  images/
    bg.jpg                ← skip image download
```

This is useful when:
- User has their own voice recording
- User wants a specific background image (not the og:image)
- Re-running after partial failure (already-generated mp3s are kept)

### Step 8: Run the pipeline

Foreground, stream output:

```bash
npm run pipeline -- output/<slug>-<timestamp>/script.json
```

The pipeline logs `skip TTS` / `skip download` whenever it finds pre-placed files.

If exit code != 0:
- Report the error message clearly
- Tell user the output dir path so they can inspect intermediate files (`voice/`, `script.json`, `index.html`)

### Step 9: Report success

```markdown
✓ Video:  output/<slug>-<timestamp>/video.mp4 (1920×1080)
✓ Audio:  output/<slug>-<timestamp>/voice.mp3
✓ Script: output/<slug>-<timestamp>/script.json
Total duration: XX min YYs · Z scenes
```

## Sound Effects (SFX)

The pipeline auto-picks SFX per scene using a 3-tier strategy:

1. **`scene.sfx` override** — if set in script.
2. **Semantic match** on `voiceText`:
   - "cảnh báo / nguy hiểm / sự cố" → `alert/`
   - "thất bại / sụp đổ / phá sản" → `fail/`
   - "kỷ lục / đột phá / vĩ đại" → `success/`
   - "ra mắt / công bố / hé lộ" → `reveal/`
   - "đỉnh cao / huy hoàng / cinematic" → `cinematic/`
3. **Template default category**:
   - `hook` → `transition/` or `cinematic/`
   - `chapter-title` → `cinematic/` or `drumroll/`
   - `quote-card` → `cinematic/` or `emphasis/`
   - `timeline` → `cinematic/` or `reveal/`
   - `brand-logo` → `reveal/` or `cinematic/`
   - `fact-card` → `emphasis/` or `success/`
   - `stat-hero` → `emphasis/` or `success/`
   - `comparison` → `transition/` or `emphasis/`
   - `feature-list` → `transition/` or `emphasis/`
   - `callout` → `alert/` or `drumroll/`
   - `outro` → `outro/` or `success/`

**You almost never need to set `sfx`.** Write good Vietnamese with natural keywords and the auto-selector picks the right sound. Override only when you want a specific signature sound or to mute a scene with `{ "name": "none" }`.

## Edge cases

| Situation | Action |
|---|---|
| URL paywall / JS-rendered | Tell user to save to .txt and call again. Stop. |
| URL content < 800 words | Warn "Tin gốc ngắn, có thể khó đạt 8 phút"; continue anyway |
| URL content > 5000 words | Summarize to ~2000 words for ~10-min video |
| Brand has no notable downfall | Use Chương 3 = "Lúc lung lay" thay vì "Sụp đổ" |
| Pipeline fails | Report error + output dir path; user can re-try `npm run pipeline -- <path>` |
