# Meta Ad Library Scraper (Facebook & Instagram Ads)

Extract authentic live ads from the **Meta Ad Library** (Facebook, Instagram, Messenger, and Threads) by keyword or Facebook Page URLs with direct MP4 video player links, high-res images, advertiser information, ad copy, CTAs, and creative split counts.

## ✨ Key Features

- **🚀 Blazing Fast (< 8 seconds)**: Instant automated clearance of Meta's `/__rd_verify` security checkpoint. No heavy browser lag or timeouts.
- **🎬 Direct .mp4 Video Player Streams**: Extracts progressive MP4 video links (`video-*.xx.fbcdn.net`) in HD (720p) and SD (360p) that play immediately in any video player without watermarks.
- **🖼️ High-Resolution Image Snapshots**: Grabs the full uncropped creative images from Meta's CDN.
- **🔍 Flexible Search Modes**:
  - **Keyword Search**: Any brand, niche, or product query (e.g., `"AI UGC"`, `"dropshipping"`, `"running shoes"`).
  - **Facebook Page Search**: Direct Page ID or Page URL (e.g., `facebook.com/Nike` or `view_all_page_id=15087023444`).
- **🌍 Global Filtering**: Filter by Country (`ALL`, `US`, `GB`, `CA`, `AU`, `DE`, `FR`, etc.), Active status (`ACTIVE`, `INACTIVE`, `ALL`), and Ad Type.
- **💾 Media Archiving (Key-Value Store)**: Toggle `downloadMedia` to permanently store video MP4s and creative images in your Apify Key-Value Store with public URLs.
- **💰 Ultra-Low Cost ($0.00)**: Runs in standard Node.js containers without memory-heavy browsers. Zero synthetic or placeholder ads.

---

## 📥 Input Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `search_keyword` | String | `"AI UGC"` | Keyword, brand, or query to search across active Facebook & Instagram ads |
| `page_urls` | Array[String] | `[]` | Facebook Page URLs or IDs to scrape ads exclusively from that advertiser |
| `country_code` | String (Enum) | `"ALL"` | Target country code (e.g. `ALL`, `US`, `GB`, `CA`, `AU`, `DE`, `FR`, etc.) |
| `limit` | Integer | `20` | Maximum number of ads to collect (1 to 200) |
| `is_active` | String (Enum) | `"ACTIVE"` | `ACTIVE` (currently running), `INACTIVE`, or `ALL` |
| `ad_type` | String (Enum) | `"all"` | `all` (commercial ads) or `political_and_issue_ads` |
| `downloadMedia` | Boolean | `false` | When `true`, downloads .mp4 and image binaries to Apify Key-Value Store |

---

## 📤 Output Dataset Format

Each item pushed to the Apify Dataset contains:

```json
{
  "adArchiveID": "1465344302086856",
  "adID": "1465344302086856",
  "pageID": "1369755289823565",
  "pageName": "Runway",
  "pageProfileURI": "https://www.facebook.com/1369755289823565",
  "startDate": "2026-08-07T07:00:00.000Z",
  "endDate": "2026-10-14T07:00:00.000Z",
  "isActive": true,
  "snapshotUrl": "https://video-lhr11-1.xx.fbcdn.net/o1/v/t2/f2/m367/AQMLPPpbvghZH14U7AtoQR2GIL1_iWn3jITmKv9JuiC_j4lG0RR0e4u9_LVoH5blVsH6v4gbcqMpCOvyys9o55Wnh4L9A3VoHE4IbORMPw.mp4?...",
  "mediaType": "video",
  "videoSources": {
    "hdUrl": "https://video-lhr11-1.xx.fbcdn.net/o1/v/t2/f2/m367/...mp4",
    "sdUrl": "https://video-lhr11-1.xx.fbcdn.net/o1/v/t2/f2/m367/...mp4",
    "previewUrl": "https://scontent-lhr11-1.xx.fbcdn.net/v/..."
  },
  "adBody": "runwayml.com/UGC-ads",
  "headline": "",
  "linkUrl": "https://runway.com/ugc-videos?utm_source=meta",
  "ctaText": "Sign up",
  "publisherPlatforms": ["facebook", "instagram", "messenger", "threads"],
  "collationCount": 2,
  "collationID": "892239273545104",
  "currency": "USD",
  "scrapedAt": "2026-10-14T21:59:24.178Z"
}
```

---

## 🛠️ Deploying to Apify

1. Clone or download this repository.
2. In the folder, run `apify push` (or upload zip in Apify Console).
3. The Actor will build using `apify/actor-node:20` in seconds.
4. Execute your run and inspect the results in the Apify Dataset!
