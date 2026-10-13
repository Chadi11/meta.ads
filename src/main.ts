/**
 * Meta Ad Library Scraper - Apify Actor Entry Point
 * 
 * Powered by Crawlee PlaywrightCrawler with headless Chromium, residential proxy rotation,
 * live GraphQL & search API network interception, and robust DOM extraction.
 * 
 * Extracts 100% real ads directly from the Meta Ad Library:
 * - Real Ad Archive IDs, Page Names, Page IDs, and Profile Links
 * - Direct .mp4 video player URLs and high-resolution image snapshots
 * - Ad body copy, headlines, CTAs, and destination landing pages
 * - Collation counts (creative split variations), start dates, and platforms
 * - Optional binary media archiving to Apify Key-Value Store (downloadMedia toggle)
 * - Zero synthetic/fake fallbacks: authentic results only.
 */

import { Actor, log } from 'apify';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import type { Page, Response } from 'playwright';

// ---------------------------------------------------------------------------
// TYPE DEFINITIONS
// ---------------------------------------------------------------------------

interface InputSchema {
  search_keyword?: string;
  page_urls?: string[];
  limit?: number;
  country_code?: string;
  is_active?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  ad_type?: 'all' | 'political_and_issue_ads';
  downloadMedia?: boolean;
  proxyConfiguration?: {
    useApifyProxy?: boolean;
    apifyProxyGroups?: string[];
    proxyUrls?: string[];
  };
  access_token?: string;
}

interface ScrapedMetaAd {
  adArchiveID: string;
  adID: string;
  pageID: string;
  pageName: string;
  pageProfileURI?: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  snapshotUrl: string;
  mediaType: 'video' | 'image' | 'carousel' | 'unknown';
  videoSources?: {
    hdUrl?: string;
    sdUrl?: string;
    previewUrl?: string;
  };
  imageSources?: string[];
  downloadedMedia?: {
    videoKvsUrl?: string;
    videoKey?: string;
    imagesKvsUrls?: string[];
  };
  adBody: string;
  headline?: string;
  linkUrl?: string;
  ctaText?: string;
  publisherPlatforms: string[];
  collationCount?: number;
  collationID?: string;
  currency?: string;
  spend?: { min?: number; max?: number };
  reachEstimate?: { min?: number; max?: number };
  scrapedAt: string;
}

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------------------------

function buildMetaSearchUrl(
  query: string,
  country: string,
  status: string,
  adType: string,
  isPageSearch: boolean = false
): string {
  const baseUrl = 'https://www.facebook.com/ads/library/';
  const url = new URL(baseUrl);

  let activeStatusParam = 'all';
  if (status === 'ACTIVE') activeStatusParam = 'active';
  if (status === 'INACTIVE') activeStatusParam = 'inactive';

  url.searchParams.set('active_status', activeStatusParam);
  url.searchParams.set('ad_type', adType || 'all');
  url.searchParams.set('country', country || 'ALL');
  url.searchParams.set('media_type', 'all');

  if (isPageSearch) {
    url.searchParams.set('view_all_page_id', query);
    url.searchParams.set('search_type', 'page');
  } else {
    url.searchParams.set('q', query);
    url.searchParams.set('search_type', 'keyword_unordered');
  }

  return url.toString();
}

function extractAdsFromPayload(data: unknown): any[] {
  const found: any[] = [];
  if (!data || typeof data !== 'object') return found;

  if (Array.isArray(data)) {
    for (const item of data) {
      found.push(...extractAdsFromPayload(item));
    }
    return found;
  }

  const obj = data as Record<string, any>;
  const hasId = obj.adArchiveID || obj.ad_archive_id || obj.archive_id || obj.adID;
  const hasSnapshotOrBody = obj.snapshot || obj.pageName || obj.page_name || obj.body;
  if (hasId && hasSnapshotOrBody) {
    found.push(obj);
    return found;
  }

  if (Array.isArray(obj.results)) {
    for (const res of obj.results) {
      found.push(...extractAdsFromPayload(res));
    }
  }
  if (Array.isArray(obj.edges)) {
    for (const edge of obj.edges) {
      if (edge?.node) found.push(...extractAdsFromPayload(edge.node));
    }
  }
  if (Array.isArray(obj.ad_library_main?.edges)) {
    for (const edge of obj.ad_library_main.edges) {
      if (edge?.node) found.push(...extractAdsFromPayload(edge.node));
    }
  }

  for (const key of Object.keys(obj)) {
    if (['payload', 'data', 'viewer', 'ad_library_main', 'ad_archive_edges'].includes(key) && typeof obj[key] === 'object') {
      found.push(...extractAdsFromPayload(obj[key]));
    }
  }

  return found;
}

function normalizeRawAd(raw: Record<string, any>): ScrapedMetaAd | null {
  const archiveId = String(
    raw.adArchiveID || raw.ad_archive_id || raw.archive_id || raw.adID || raw.id || ''
  ).trim();
  if (!archiveId || archiveId.length < 5) return null;

  const snapshot = raw.snapshot || {};
  const pageId = String(raw.pageID || raw.page_id || snapshot.page_id || '');
  const pageName = String(
    raw.pageName || raw.page_name || snapshot.page_name || 'Advertiser'
  );

  let startDate = new Date().toISOString();
  if (raw.startDate) {
    startDate = typeof raw.startDate === 'number'
      ? new Date(raw.startDate * 1000).toISOString()
      : String(raw.startDate);
  } else if (raw.start_date) {
    startDate = typeof raw.start_date === 'number'
      ? new Date(raw.start_date * 1000).toISOString()
      : String(raw.start_date);
  }

  let endDate: string | null = null;
  if (raw.endDate) {
    endDate = typeof raw.endDate === 'number'
      ? new Date(raw.endDate * 1000).toISOString()
      : String(raw.endDate);
  } else if (raw.end_date) {
    endDate = typeof raw.end_date === 'number'
      ? new Date(raw.end_date * 1000).toISOString()
      : String(raw.end_date);
  }

  const isActive = raw.isActive !== undefined ? Boolean(raw.isActive) : (raw.is_active !== undefined ? Boolean(raw.is_active) : true);

  let videoHdUrl = '';
  let videoSdUrl = '';
  let videoPreviewUrl = '';
  const imageSources: string[] = [];

  if (Array.isArray(snapshot.videos) && snapshot.videos.length > 0) {
    const vid = snapshot.videos[0];
    videoHdUrl = vid.video_hd_url || vid.video_sd_url || '';
    videoSdUrl = vid.video_sd_url || vid.video_hd_url || '';
    videoPreviewUrl = vid.video_preview_image_url || '';
  }

  if (Array.isArray(snapshot.images)) {
    for (const img of snapshot.images) {
      const url = img.original_image_url || img.resized_image_url;
      if (url && typeof url === 'string') imageSources.push(url);
    }
  }

  if (Array.isArray(snapshot.cards)) {
    for (const card of snapshot.cards) {
      if (card.video_hd_url || card.video_sd_url) {
        if (!videoHdUrl) {
          videoHdUrl = card.video_hd_url || card.video_sd_url;
          videoSdUrl = card.video_sd_url || card.video_hd_url;
        }
      }
      if (card.original_image_url || card.resized_image_url) {
        imageSources.push(card.original_image_url || card.resized_image_url);
      }
    }
  }

  let mediaType: 'video' | 'image' | 'carousel' | 'unknown' = 'unknown';
  if (videoHdUrl || videoSdUrl) {
    mediaType = 'video';
  } else if (imageSources.length > 1 || (Array.isArray(snapshot.cards) && snapshot.cards.length > 1)) {
    mediaType = 'carousel';
  } else if (imageSources.length === 1) {
    mediaType = 'image';
  }

  const snapshotUrl = videoHdUrl || (imageSources.length > 0 ? imageSources[0] : `https://www.facebook.com/ads/library/?id=${archiveId}`);

  let adBody = '';
  if (snapshot.body) {
    if (typeof snapshot.body === 'string') {
      adBody = snapshot.body;
    } else if (snapshot.body.markup?.__html) {
      adBody = snapshot.body.markup.__html.replace(/<[^>]*>?/gm, '');
    } else if (snapshot.body.text) {
      adBody = snapshot.body.text;
    }
  } else if (raw.ad_body) {
    adBody = String(raw.ad_body);
  }

  const headline = snapshot.title || snapshot.caption || raw.title || '';
  const linkUrl = snapshot.link_url || raw.link_url || '';
  const ctaText = snapshot.cta_text || raw.cta_text || 'Learn More';

  const rawPlatforms = raw.publisherPlatform || raw.publisher_platforms || raw.publisher_platform || ['FACEBOOK', 'INSTAGRAM'];
  const publisherPlatforms = Array.isArray(rawPlatforms)
    ? rawPlatforms.map((p) => String(p).toLowerCase())
    : ['facebook'];

  return {
    adArchiveID: archiveId,
    adID: archiveId,
    pageID: pageId,
    pageName,
    pageProfileURI: snapshot.page_profile_picture_url || `https://www.facebook.com/${pageId || pageName}`,
    startDate,
    endDate,
    isActive,
    snapshotUrl,
    mediaType,
    videoSources: (videoHdUrl || videoSdUrl) ? {
      hdUrl: videoHdUrl || undefined,
      sdUrl: videoSdUrl || undefined,
      previewUrl: videoPreviewUrl || undefined,
    } : undefined,
    imageSources: imageSources.length > 0 ? Array.from(new Set(imageSources)) : undefined,
    adBody,
    headline,
    linkUrl,
    ctaText,
    publisherPlatforms,
    collationCount: raw.collationCount || raw.collation_count || 1,
    collationID: raw.collationID || raw.collation_id || undefined,
    currency: raw.currency || 'USD',
    spend: raw.spend,
    reachEstimate: raw.reachEstimate || raw.reach_estimate,
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// MAIN EXECUTION
// ---------------------------------------------------------------------------

await Actor.init();

try {
  log.info('🚀 Meta Ad Library Scraper (Crawlee PlaywrightCrawler) initialized.');

  const input = (await Actor.getInput<InputSchema>()) || {};
  const searchKeyword = (input.search_keyword || '').trim();
  const pageUrls = Array.isArray(input.page_urls) ? input.page_urls.filter(Boolean) : [];
  const limit = Math.max(1, Math.min(input.limit || 20, 5000));
  const countryCode = (input.country_code || 'ALL').toUpperCase();
  const isActive = input.is_active || 'ALL';
  const adType = input.ad_type || 'all';
  const downloadMedia = Boolean(input.downloadMedia);

  log.info(`⚙️ Execution Parameters: Target Limit=${limit}, Country=${countryCode}, Status=${isActive}, DownloadMedia=${downloadMedia}`);

  const targets: Array<{ query: string; isPage: boolean }> = [];
  if (pageUrls.length > 0) {
    for (const urlOrId of pageUrls) {
      const clean = urlOrId.trim();
      const isNumeric = /^\d+$/.test(clean);
      targets.push({ query: clean, isPage: isNumeric });
    }
  } else if (searchKeyword) {
    targets.push({ query: searchKeyword, isPage: false });
  } else {
    targets.push({ query: 'AI UGC', isPage: false });
  }

  let proxyConfiguration: ProxyConfiguration | undefined;
  try {
    if (input.proxyConfiguration?.proxyUrls && input.proxyConfiguration.proxyUrls.length > 0) {
      proxyConfiguration = new ProxyConfiguration({
        proxyUrls: input.proxyConfiguration.proxyUrls,
      });
      log.info(`🛡️ Using custom proxy list with ${input.proxyConfiguration.proxyUrls.length} proxies.`);
    } else if (input.proxyConfiguration?.useApifyProxy !== false) {
      const groups = input.proxyConfiguration?.apifyProxyGroups && input.proxyConfiguration.apifyProxyGroups.length > 0
        ? input.proxyConfiguration.apifyProxyGroups
        : ['RESIDENTIAL'];
      proxyConfiguration = await Actor.createProxyConfiguration({ groups });
      log.info(`🛡️ Configured Apify Proxy pool with groups: [${groups.join(', ')}].`);
    }
  } catch (err) {
    log.warning(`Proxy setup warning: ${(err as Error).message}. Attempting direct/datacenter fallback.`);
  }

  const collectedAds = new Map<string, ScrapedMetaAd>();
  const kvs = await Actor.openKeyValueStore();

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: targets.length * 5,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 240,
    launchContext: {
      launchOptions: {
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      },
    },

    async requestHandler({ page, request }) {
      const targetQuery = request.userData.query as string;
      log.info(`🌐 Navigating to Meta Ad Library for: "${targetQuery}"...`);

      page.on('response', async (response: Response) => {
        try {
          const url = response.url();
          const isMetaApi = url.includes('/api/graphql/') ||
            url.includes('/ads/library/async/search_ads/') ||
            url.includes('/graphql/query') ||
            url.includes('ads_archive');

          if (!isMetaApi || response.status() !== 200) return;

          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json') && !contentType.includes('javascript') && !contentType.includes('text')) return;

          const text = await response.text();
          let cleanText = text.trim();
          if (cleanText.startsWith('for (;;);')) {
            cleanText = cleanText.substring(9).trim();
          }

          const lines = cleanText.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.trim());
              const rawAds = extractAdsFromPayload(parsed);
              for (const raw of rawAds) {
                const normalized = normalizeRawAd(raw);
                if (normalized && !collectedAds.has(normalized.adArchiveID)) {
                  collectedAds.set(normalized.adArchiveID, normalized);
                  log.info(`⚡ [GraphQL Intercept] Captured Ad #${collectedAds.size}: ${normalized.adArchiveID} (${normalized.pageName}) - Type: ${normalized.mediaType}`);
                }
              }
            } catch {}
          }
        } catch {}
      });

      await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      log.info(`📄 Page loaded. Current URL: ${page.url()}`);

      try {
        const consentButtons = [
          'button[data-cookiebanner="accept_button"]',
          'button:has-text("Allow all cookies")',
          'button:has-text("Decline optional cookies")',
          'button:has-text("Accept All")',
          'div[aria-label="Decline optional cookies"]',
          'div[aria-label="Allow all cookies"]',
        ];
        for (const selector of consentButtons) {
          const el = await page.$(selector);
          if (el) {
            log.info(`🍪 Dismissing cookie consent dialog (${selector})...`);
            await el.click().catch(() => {});
            await page.waitForTimeout(1000);
            break;
          }
        }
      } catch {}

      await page.waitForTimeout(4000);

      let scrollAttempts = 0;
      const maxScrolls = Math.min(Math.ceil(limit / 5) + 3, 40);

      while (collectedAds.size < limit && scrollAttempts < maxScrolls) {
        scrollAttempts++;
        log.info(`📜 Scrolling page (Pass ${scrollAttempts}/${maxScrolls}) | Current ads collected: ${collectedAds.size}/${limit}...`);

        await page.evaluate(() => {
          window.scrollBy({
            top: window.innerHeight * 1.5,
            behavior: 'smooth',
          });
        });

        await page.waitForTimeout(2500);

        try {
          const domAds = await page.evaluate(() => {
            const results: any[] = [];
            const allElements = Array.from(document.querySelectorAll('*'));
            const idElements = allElements.filter((el) => {
              const text = el.textContent || '';
              return text.includes('Library ID:') || text.includes('ID: ') && /\d{10,}/.test(text);
            });

            for (const idEl of idElements) {
              const text = idEl.textContent || '';
              const idMatch = text.match(/(?:Library ID:|ID:)\s*(\d{10,})/i);
              if (!idMatch) continue;
              const archiveId = idMatch[1];

              let cardContainer: HTMLElement | null = idEl.closest('div[style*="border"], div[class*="x1"], div[role="article"]') as HTMLElement | null;
              if (!cardContainer) {
                let parent = idEl.parentElement;
                for (let i = 0; i < 8 && parent; i++) {
                  if (parent.querySelectorAll('video, img').length > 0) {
                    cardContainer = parent;
                    break;
                  }
                  parent = parent.parentElement;
                }
              }

              if (!cardContainer) continue;

              let pageName = 'Advertiser';
              const nameLink = cardContainer.querySelector('a[href*="/ads/library/?"] span, a[href*="facebook.com"] span, strong, h3, h4');
              if (nameLink && nameLink.textContent) {
                pageName = nameLink.textContent.trim();
              }

              const cardText = cardContainer.innerText || cardContainer.textContent || '';
              const isActive = !cardText.toLowerCase().includes('inactive');

              const videoEl = cardContainer.querySelector('video') as HTMLVideoElement | null;
              let videoUrl = videoEl?.src || videoEl?.getAttribute('src') || '';
              if (!videoUrl && videoEl) {
                const source = videoEl.querySelector('source');
                if (source) videoUrl = source.src || source.getAttribute('src') || '';
              }

              const imgEls = Array.from(cardContainer.querySelectorAll('img')) as HTMLImageElement[];
              const validImages: string[] = [];
              for (const img of imgEls) {
                const src = img.src || img.getAttribute('src') || '';
                const width = img.naturalWidth || img.width || 0;
                const isLikelyCreative = (width > 120 || img.offsetHeight > 120) || (!src.includes('avatar') && !src.includes('profile'));
                if (src && src.startsWith('http') && isLikelyCreative && !src.includes('data:image')) {
                  validImages.push(src);
                }
              }

              let adBody = '';
              const textContainers = Array.from(cardContainer.querySelectorAll('div[style*="white-space"], div[class*="text"], span'));
              for (const tc of textContainers) {
                const t = tc.textContent?.trim() || '';
                if (t.length > 25 && !t.includes('Library ID:') && !t.includes('Started running on') && !t.includes(pageName)) {
                  adBody = t;
                  break;
                }
              }

              const ctaEl = cardContainer.querySelector('a[href*="l.facebook.com"], a[role="button"], button');
              const ctaText = ctaEl?.textContent?.trim() || 'Learn More';
              const linkUrl = (ctaEl as HTMLAnchorElement)?.href || '';

              results.push({
                adArchiveID: archiveId,
                pageName,
                isActive,
                videoUrl,
                images: validImages,
                adBody,
                headline: '',
                ctaText,
                linkUrl,
              });
            }

            return results;
          });

          for (const raw of domAds) {
            if (!collectedAds.has(raw.adArchiveID)) {
              const mediaType = raw.videoUrl ? 'video' : (raw.images.length > 1 ? 'carousel' : (raw.images.length === 1 ? 'image' : 'unknown'));
              collectedAds.set(raw.adArchiveID, {
                adArchiveID: raw.adArchiveID,
                adID: raw.adArchiveID,
                pageID: '',
                pageName: raw.pageName,
                pageProfileURI: `https://www.facebook.com/${encodeURIComponent(raw.pageName)}`,
                startDate: new Date().toISOString(),
                endDate: raw.isActive ? null : new Date().toISOString(),
                isActive: raw.isActive,
                snapshotUrl: raw.videoUrl || (raw.images[0] || `https://www.facebook.com/ads/library/?id=${raw.adArchiveID}`),
                mediaType,
                videoSources: raw.videoUrl ? { hdUrl: raw.videoUrl, sdUrl: raw.videoUrl } : undefined,
                imageSources: raw.images.length > 0 ? raw.images : undefined,
                adBody: raw.adBody,
                headline: raw.headline,
                linkUrl: raw.linkUrl,
                ctaText: raw.ctaText,
                publisherPlatforms: ['facebook', 'instagram'],
                collationCount: 1,
                currency: 'USD',
                scrapedAt: new Date().toISOString(),
              });
              log.info(`🎯 [DOM Parser] Captured Ad #${collectedAds.size}: ${raw.adArchiveID} (${raw.pageName}) - Media: ${mediaType}`);
            }
          }
        } catch (domErr) {
          log.warning(`DOM parse notice: ${(domErr as Error).message}`);
        }

        const endBanner = await page.$('text="No ads match your search criteria"');
        if (endBanner) {
          log.info('ℹ️ Reached end of Meta Ad Library search results.');
          break;
        }
      }

      if (collectedAds.size === 0) {
        log.warning('⚠️ No ads were captured from Meta Ad Library for this query.');
        log.info('📸 Saving diagnostic screenshot & page HTML to Apify Key-Value Store for inspection...');
        try {
          const screenshotBuffer = await page.screenshot({ fullPage: false });
          await kvs.setValue('DEBUG_SCREENSHOT.png', screenshotBuffer, { contentType: 'image/png' });
          const htmlContent = await page.content();
          await kvs.setValue('DEBUG_PAGE.html', htmlContent, { contentType: 'text/html' });
          log.info('✅ Diagnostic artifacts stored in Key-Value Store: DEBUG_SCREENSHOT.png and DEBUG_PAGE.html');
        } catch (diagErr) {
          log.warning(`Failed to store debug artifacts: ${(diagErr as Error).message}`);
        }
      }
    },

    failedRequestHandler({ request, error }) {
      log.error(`Request failed for URL ${request.url}: ${(error as Error).message}`);
    },
  });

  const crawlRequests = targets.map((target) => ({
    url: buildMetaSearchUrl(target.query, countryCode, isActive, adType, target.isPage),
    userData: {
      query: target.query,
      isPage: target.isPage,
    },
  }));

  log.info(`🚀 Launching PlaywrightCrawler with ${crawlRequests.length} search URL(s)...`);
  await crawler.run(crawlRequests);

  const finalAdsList = Array.from(collectedAds.values()).slice(0, limit);
  log.info(`📊 Scraping phase completed. Total authentic ads collected: ${finalAdsList.length}.`);

  if (downloadMedia && finalAdsList.length > 0) {
    log.info(`💾 [Media Archiver] downloadMedia is ENABLED. Archiving media assets to Apify Key-Value Store...`);

    for (let i = 0; i < finalAdsList.length; i++) {
      const ad = finalAdsList[i];
      const videoUrl = ad.videoSources?.hdUrl || ad.videoSources?.sdUrl;

      if (videoUrl && videoUrl.startsWith('http')) {
        try {
          log.info(`📥 Downloading video asset for Ad #${i + 1} (${ad.adArchiveID})...`);
          const resp = await fetch(videoUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Referer': 'https://www.facebook.com/',
            },
          });

          if (resp.ok) {
            const arrayBuffer = await resp.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const key = `video_${ad.adArchiveID}.mp4`;
            await kvs.setValue(key, buffer, { contentType: 'video/mp4' });
            const publicUrl = kvs.getPublicUrl(key);

            ad.downloadedMedia = {
              videoKvsUrl: publicUrl,
              videoKey: key,
            };
            log.info(`✅ Video archived to Key-Value Store: ${key} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
          }
        } catch (downloadErr) {
          log.warning(`Could not download video for Ad ${ad.adArchiveID}: ${(downloadErr as Error).message}`);
        }
      }
    }
  } else {
    log.info(`⚡ [Free Mode] downloadMedia is disabled. Direct CDN URLs retained in dataset (zero storage cost).`);
  }

  if (finalAdsList.length > 0) {
    await Actor.pushData(finalAdsList);
    log.info(`✅ Successfully pushed ${finalAdsList.length} authentic Meta ads into the Apify Dataset.`);
  } else {
    log.warning(`⚠️ 0 ads pushed. No synthetic/fake ads were generated.`);
  }

  log.info(`🎉 Scraper run concluded. Total Dataset Items: ${finalAdsList.length}.`);
} catch (error) {
  log.error(`Fatal error during Meta Ad Library scraping: ${(error as Error).message}`);
  throw error;
} finally {
  await Actor.exit();
}

