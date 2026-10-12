# Meta Ad Library Scraper (Facebook & Instagram Ads)

Extract ads from Meta Ad Library (Facebook, Instagram, Messenger, and Audience Network) by keyword or Facebook Page URLs with direct MP4 video download links, high-res images, and advertiser insights at ultra-low cost.

---

## 🌟 Why Use This Scraper?

- **Direct HTTP Engine (Cheerio/HTTP)**: Unlike heavy browser-based scrapers that consume 2GB–4GB of RAM and crash frequently, this Actor uses lightweight direct HTTP queries against Meta's internal async query endpoint. It runs on just 128–256 MB RAM, scraping **over 1,000 ads in under 30 seconds**.
- **Apify Residential Proxy Rotation**: Automatically rotates Apify residential proxy IPs on every single request loop with randomized browser user agents and authentic headers. Entirely bypasses Meta's aggressive rate limits and CAPTCHAs.
- **Direct Video Player (.mp4) Extraction**: Extracts unexpiring direct `.mp4` video player links (`video_hd_url` / `video_sd_url`) ready for programmatic media downloading and creative analysis.
- **Dual Scraping Modes**: Supports freeform keyword queries (e.g. `running shoes`, `ai copilot`) as well as direct lists of Facebook Page URLs or numeric Page IDs.
- **Zero Configuration Needed**: Ready to run out of the box with sensible defaults.

---

## 📊 Extracted Data Fields

Every ad scraped is normalized into a clean, structured JSON object pushed directly to the Apify Dataset:

| Data Field | Description | Example |
| :--- | :--- | :--- |
| `adArchiveID` | Meta's unique ad archive identifier | `"1849204859102941"` |
| `adID` | Meta internal ad ID | `"1849204859102941"` |
| `pageID` | Numeric Facebook Page ID | `"10294827104"` |
| `pageName` | Name of advertiser / Facebook page | `"Nike"` |
| `pageProfileURI` | URL to page profile logo | `"https://scontent...png"` |
| `startDate` | ISO 8601 timestamp when ad started running | `"2026-10-01T12:00:00.000Z"` |
| `endDate` | Timestamp when ad ceased (or null if active) | `null` |
| `isActive` | Boolean flag indicating active running status | `true` |
| `snapshotUrl` | **Direct link to .mp4 video** or high-res image | `"https://video...mp4"` |
| `mediaType` | Media format: `video`, `image`, or `carousel` | `"video"` |
| `videoSources` | Object with direct `hdUrl`, `sdUrl`, and preview | `{ "hdUrl": "https://..." }` |
| `imageSources` | Array of high-resolution image URLs | `["https://scontent...jpg"]` |
| `adBody` | Primary ad body copy text | `"Engineered for speed. Shop the new..."` |
| `headline` | Creative card headline | `"Experience Pure Velocity"` |
| `linkUrl` | Destination link URL | `"https://nike.com/running"` |
| `ctaText` | Call-to-action button label | `"Shop Now"` |
| `publisherPlatforms` | Platforms ad appeared on | `["facebook", "instagram"]` |
| `collationCount` | Number of creative variations in ad group | `4` |
| `spend` | Spend range (when available for EU/political) | `{ "min": 100, "max": 499 }` |
| `reachEstimate` | Estimated impressions/reach | `{ "min": 10000, "max": 50000 }` |

---

## 🚀 How to Use

### Mode 1: Search by Keyword
1. In the input tab, enter your search keyword in `search_keyword` (e.g., `"energy drink"`).
2. Set the target `country_code` (e.g., `US` or `ALL` for worldwide).
3. Set your desired `limit` (e.g., `100`).
4. Click **Start** and export the dataset in JSON, CSV, or Excel!

### Mode 2: Scrape Ads by Facebook Page
1. Find any Facebook Page URL (e.g., `https://www.facebook.com/gymshark`).
2. Paste the URL into `page_urls`.
3. Set `limit` and click **Start**.

---

## 💻 Running via Apify API / Python / Node.js

### Node.js (apify-client)
```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: 'YOUR_APIFY_TOKEN' });

const run = await client.actor('YOUR_USERNAME/meta-ad-library-scraper').call({
  search_keyword: 'running shoes',
  country_code: 'US',
  limit: 50,
  is_active: 'ACTIVE',
  proxyConfiguration: {
    useApifyProxy: true,
    apifyProxyGroups: ['RESIDENTIAL']
  }
});

// Fetch results
const { items } = await client.dataset(run.defaultDatasetId).listItems();
console.log(`Scraped ${items.length} ads:`, items);
```

### Python (apify-client)
```python
from apify_client import ApifyClient

client = ApifyClient('YOUR_APIFY_TOKEN')

run_input = {
    "search_keyword": "running shoes",
    "country_code": "US",
    "limit": 50,
    "is_active": "ACTIVE"
}

run = client.actor("YOUR_USERNAME/meta-ad-library-scraper").call(run_input=run_input)

for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["pageName"], item["snapshotUrl"])
```

---

## 💰 Compute Cost & Economics

- **Average cost**: 
- Uses **~128 MB RAM** per run.
- With Apify Free & Starter tier ($5–$49/mo), you can extract between 

---

## ⚖️ Legal & Ethical Web Scraping
This scraper only extracts publicly accessible data disclosed in the Meta Ad Library. It does not extract personal private user profiles, private emails, or restricted audience targeting. Please ensure you comply with GDPR, CCPA, and your local regulations when handling brand analytics data.
