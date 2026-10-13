# Meta Ad Library Scraper (Facebook & Instagram Ads)

Extract authentic live ads from the Meta Ad Library (Facebook, Instagram, Messenger, and Audience Network) by keyword or Facebook Page URLs with direct MP4 video player links, high-res images, advertiser insights, and optional binary media archiving into the Apify Key-Value Store.

---

## 🌟 Key Features

- **Crawlee PlaywrightCrawler Engine**: Leverages headless Chromium with anti-bot evasion headers and real browser fingerprinting. Intercepts Meta's internal GraphQL data streams and dynamically extracts fully-rendered ad cards from the DOM.
- **Apify Residential Proxy Rotation**: Out-of-the-box support for Apify Residential Proxies (`RESIDENTIAL` group) to bypass Facebook geo-restrictions, rate limits, and checkpoint pages.
- **Direct Video Player (.mp4) Extraction**: Extracts live direct `.mp4` video player links (`video_hd_url` / `video_sd_url`) and high-resolution image snapshots directly from Meta's CDN.
- **Flexible Media Archiving (`downloadMedia`)**:
  - **Free Mode (Default `false`)**: Saves direct CDN text URLs to the Apify Dataset at $0 extra storage cost.
  - **Archiving Mode (`true`)**: Downloads binary `.mp4` video files and images permanently into your Apify Key-Value Store, providing permanent storage that never expires.
- **100% Authentic Data**: Real ad archive IDs, real advertiser names, authentic ad copies, CTAs, and destination landing pages with zero synthetic/fake fallbacks.

---

## 📊 Extracted Data Fields

Every scraped ad is normalized into a clean, structured JSON object pushed directly to the Apify Dataset:

| Data Field | Description | Example |
| :--- | :--- | :--- |
| `adArchiveID` | Meta's authentic ad archive identifier | `"1849204859102941"` |
| `adID` | Meta internal ad ID | `"1849204859102941"` |
| `pageID` | Numeric Facebook Page ID | `"10294827104"` |
| `pageName` | Verified name of advertiser / Facebook page | `"Nike"` |
| `pageProfileURI` | URL to page profile logo / Facebook page | `"https://scontent...png"` |
| `startDate` | ISO 8601 timestamp when ad started running | `"2026-10-01T12:00:00.000Z"` |
| `endDate` | Timestamp when ad ceased (or null if active) | `null` |
| `isActive` | Boolean flag indicating active running status | `true` |
| `snapshotUrl` | **Direct link to .mp4 video** or high-res image | `"https://video...mp4"` |
| `mediaType` | Media format: `video`, `image`, or `carousel` | `"video"` |
| `videoSources` | Direct `hdUrl`, `sdUrl`, and preview | `{ "hdUrl": "https://..." }` |
| `imageSources` | Array of high-resolution image URLs | `["https://scontent...jpg"]` |
| `downloadedMedia` | Public Key-Value Store URLs (if `downloadMedia` is enabled) | `{ "videoKvsUrl": "https://..." }` |
| `adBody` | Primary ad body copy text | `"Engineered for speed. Shop the new..."` |
| `headline` | Creative card headline | `"Experience Pure Velocity"` |
| `linkUrl` | Destination link URL | `"https://nike.com/running"` |
| `ctaText` | Call-to-action button label | `"Shop Now"` |
| `publisherPlatforms` | Platforms ad appeared on | `["facebook", "instagram"]` |
| `collationCount` | Number of creative variations in ad group | `4` |
| `scrapedAt` | ISO timestamp of the scrape | `"2026-10-13T09:00:00.000Z"` |

---

## 🚀 How to Use

### Mode 1: Search by Keyword
1. In the input tab, enter your search query in `search_keyword` (e.g. `"AI UGC"`, `"fitness app"`, or `"dropshipping"`).
2. Set target `country_code` (e.g., `US` or `ALL` for worldwide).
3. Set your desired `limit` (e.g. `20` or `100`).
4. (Optional) Check `downloadMedia` if you want binary `.mp4` video files permanently stored in your Key-Value Store.
5. Click **Start** and export the dataset in JSON, CSV, or Excel!

### Mode 2: Scrape Ads by Facebook Page
1. Find any Facebook Page URL (e.g. `https://www.facebook.com/gymshark`) or numeric Page ID.
2. Paste into `page_urls`.
3. Set `limit` and click **Start**.

---

## 🛡️ Recommended Proxy Configuration

Meta aggressively monitors IP addresses. To prevent blocks:
- **Enable Apify Proxy** with the **RESIDENTIAL** group in `proxyConfiguration`.
- Ensure your Apify account has active residential proxy data.
