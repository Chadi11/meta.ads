/**
 * Meta Ad Library Scraper - Apify Actor Entry Point
 * 
 * High-performance, low-cost HTTP scraper utilizing Crawlee and the Apify SDK.
 * Bypasses heavy browser frameworks by directly querying Meta Ad Library's internal
 * asynchronous GraphQL search endpoint with automatic Apify Residential Proxy rotation.
 */

import { Actor, log } from 'apify';
import { gotScraping, CookieJar } from 'crawlee';

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
  proxyConfiguration?: Record<string, unknown>;
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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Computes Meta's internal `jazoest` checksum for the given `lsd` token.
 * Meta's client-side javascript calculates: '2' + sum(ASCII values of lsd token chars).
 * Without this checksum, Meta's security gateway rejects the request with HTTP 403.
 */
function computeJazoest(lsd: string): string {
  if (!lsd) return '2999';
  let sum = 0;
  for (let i = 0; i < lsd.length; i++) {
    sum += lsd.charCodeAt(i);
  }
  return `2${sum}`;
}

/**
 * Returns exact Meta request headers with synchronized 'www.facebook.com' origin & referer.
 */
function getMetaRequestHeaders(userAgent: string, lsdToken: string): Record<string, string> {
  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'origin': 'https://www.facebook.com',
    'referer': 'https://www.facebook.com/ads/library/',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': userAgent,
    'x-asbd-id': '129477',
    'x-fb-lsd': lsdToken,
  };
}

function parseMetaResponse(rawText: string): any {
  let cleanText = rawText.trim();
  if (cleanText.startsWith('for (;;);')) {
    cleanText = cleanText.substring(9).trim();
  }
  try {
    return JSON.parse(cleanText);
  } catch (err) {
    throw new Error(`Failed to parse Meta JSON response: ${(err as Error).message}`);
  }
}

function extractAdRecord(rawAd: any): ScrapedMetaAd {
  const archiveId = String(rawAd.adArchiveID || rawAd.id || '');
  const pageId = String(rawAd.pageID || (rawAd.page && rawAd.page.id) || '');
  const pageName = String(rawAd.pageName || (rawAd.page && rawAd.page.name) || 'Unknown Page');
  const pageProfileURI = rawAd.pageProfileURI || (rawAd.page && rawAd.page.profile_picture_url) || '';

  const startDate = rawAd.startDate ? new Date(rawAd.startDate * 1000).toISOString() : new Date().toISOString();
  const endDate = rawAd.endDate ? new Date(rawAd.endDate * 1000).toISOString() : null;
  const isActive = rawAd.isActive !== undefined ? Boolean(rawAd.isActive) : true;

  const snapshot = rawAd.snapshot || {};
  let directMp4Url = '';
  let previewUrl = '';
  let highResImageUrl = '';
  const imageSources: string[] = [];
  let mediaType: 'video' | 'image' | 'carousel' | 'unknown' = 'unknown';

  if (Array.isArray(snapshot.videos) && snapshot.videos.length > 0) {
    const primaryVideo = snapshot.videos[0];
    directMp4Url = primaryVideo.video_hd_url || primaryVideo.video_sd_url || '';
    previewUrl = primaryVideo.video_preview_image_url || '';
    mediaType = 'video';
  }

  if (Array.isArray(snapshot.cards) && snapshot.cards.length > 0) {
    if (snapshot.cards.length > 1) {
      mediaType = 'carousel';
    }
    for (const card of snapshot.cards) {
      if (card.video_hd_url || card.video_sd_url) {
        if (!directMp4Url) {
          directMp4Url = card.video_hd_url || card.video_sd_url;
          mediaType = 'video';
        }
      }
      if (card.resized_image_url || card.original_image_url) {
        imageSources.push(card.resized_image_url || card.original_image_url);
      }
    }
  }

  if (Array.isArray(snapshot.images)) {
    for (const img of snapshot.images) {
      const url = img.resized_image_url || img.original_image_url;
      if (url) imageSources.push(url);
    }
    if (imageSources.length > 0 && mediaType === 'unknown') {
      mediaType = imageSources.length > 1 ? 'carousel' : 'image';
    }
  }

  highResImageUrl = imageSources[0] || '';
  const snapshotUrl = directMp4Url || highResImageUrl || `https://www.facebook.com/ads/library/?id=${archiveId}`;

  let adBody = '';
  if (snapshot.body) {
    if (typeof snapshot.body === 'string') {
      adBody = snapshot.body;
    } else if (snapshot.body.markup && snapshot.body.markup.__html) {
      adBody = snapshot.body.markup.__html.replace(/<[^>]*>?/gm, '');
    } else if (snapshot.body.text) {
      adBody = snapshot.body.text;
    }
  }

  const primaryCard = Array.isArray(snapshot.cards) && snapshot.cards.length > 0 ? snapshot.cards[0] : null;
  const headline = snapshot.title || (primaryCard && primaryCard.title) || '';
  const linkUrl = snapshot.link_url || (primaryCard && primaryCard.link_url) || '';
  const ctaText = snapshot.cta_text || (primaryCard && primaryCard.cta_text) || '';

  const publisherPlatforms: string[] = Array.isArray(rawAd.publisherPlatform)
    ? rawAd.publisherPlatform.map((p: string) => String(p).toLowerCase())
    : ['facebook', 'instagram'];

  return {
    adArchiveID: archiveId,
    adID: String(rawAd.adID || archiveId),
    pageID: pageId,
    pageName: pageName,
    pageProfileURI: pageProfileURI || undefined,
    startDate,
    endDate,
    isActive,
    snapshotUrl,
    mediaType,
    videoSources: directMp4Url ? {
      hdUrl: directMp4Url,
      sdUrl: snapshot.videos?.[0]?.video_sd_url,
      previewUrl: previewUrl || highResImageUrl,
    } : undefined,
    imageSources: imageSources.length > 0 ? imageSources : undefined,
    adBody: adBody.trim(),
    headline: headline || undefined,
    linkUrl: linkUrl || undefined,
    ctaText: ctaText || undefined,
    publisherPlatforms,
    collationCount: rawAd.collationCount || 1,
    collationID: rawAd.collationID ? String(rawAd.collationID) : undefined,
    currency: rawAd.currency || 'USD',
    spend: rawAd.spend ? { min: rawAd.spend.lower_bound, max: rawAd.spend.upper_bound } : undefined,
    reachEstimate: rawAd.reachEstimate ? { min: rawAd.reachEstimate.lower_bound, max: rawAd.reachEstimate.upper_bound } : undefined,
    scrapedAt: new Date().toISOString(),
  };
}

function extractPageIdOrName(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/facebook\.com\/(?:pages\/[^\/]+\/)?([a-zA-Z0-9.\-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// MAIN EXECUTION FLOW
// ---------------------------------------------------------------------------

await Actor.init();

try {
  log.info('🚀 Meta Ad Library Scraper Actor initialized.');

  const input = (await Actor.getInput<InputSchema>()) || {};
  const searchKeyword = (input.search_keyword || '').trim();
  const pageUrls = Array.isArray(input.page_urls) ? input.page_urls : [];
  const limit = Math.max(1, Math.min(input.limit || 20, 50000));
  const countryCode = (input.country_code || 'ALL').toUpperCase();
  const isActive = (input.is_active || 'ALL').toUpperCase();
  const adType = input.ad_type || 'all';

  const effectiveKeyword = searchKeyword || (pageUrls.length === 0 ? 'shoes' : '');

  // 1. Initialize Apify Residential Proxy Pool
  let proxyConfiguration;
  try {
    proxyConfiguration = await Actor.createProxyConfiguration(
      input.proxyConfiguration || {
        groups: ['RESIDENTIAL'],
      }
    );
    log.info('🛡️ Proxy pool configured with Apify Residential group.');
  } catch (proxyErr) {
    log.warning(`Could not initialize residential proxy pool: ${(proxyErr as Error).message}. Proceeding without proxy.`);
  }

  let totalScraped = 0;
  const pushedAdIds = new Set<string>();
  const targets: Array<{ mode: 'page' | 'keyword'; query: string }> = [];

  if (pageUrls.length > 0) {
    for (const pUrl of pageUrls) {
      const cleanId = extractPageIdOrName(pUrl);
      if (cleanId) targets.push({ mode: 'page', query: cleanId });
    }
  }

  if (effectiveKeyword) {
    targets.push({ mode: 'keyword', query: effectiveKeyword });
  }

  for (const target of targets) {
    if (totalScraped >= limit) break;

    log.info(`🔍 Searching Meta Ad Library [Mode: ${target.mode.toUpperCase()}] for: "${target.query}"`);

    let forwardCursor: string | null = null;
    let hasNextPage = true;
    let pageNumber = 1;

    // Use a persistent residential proxy session & cookie jar for this query target
    const proxySessionId = `res_meta_${Math.random().toString(36).substring(2, 9)}`;
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(proxySessionId) : undefined;
    const cookieJar = new CookieJar();
    const userAgent = getRandomUserAgent();

    // 2. Initial Handshake on SAME proxy IP & CookieJar to get LSD token and session cookies
    log.info('📡 Establishing baseline session with Meta Ad Library (fetching LSD & cookies)...');
    let lsdToken = 'AVrP-default';
    try {
      const sessionRes = await gotScraping({
        url: 'https://www.facebook.com/ads/library/',
        headers: {
          'user-agent': userAgent,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
        },
        cookieJar,
        proxyUrl,
        timeout: { request: 20000 },
        retry: { limit: 1 },
      });

      const tokenMatch = sessionRes.body.match(/"LSD",\[\],{"token":"([^"]+)"}/) ||
                         sessionRes.body.match(/name="lsd"\s+value="([^"]+)"/);
      if (tokenMatch && tokenMatch[1]) {
        lsdToken = tokenMatch[1];
        log.info(`🔑 Acquired live security handshake LSD token: ${lsdToken.substring(0, 6)}...`);
      }
    } catch (e) {
      log.warning(`Session handshake note: ${(e as Error).message}. Using computed token fallback.`);
    }

    const jazoestToken = computeJazoest(lsdToken);
    const sessionId = `session-${Math.random().toString(36).substring(2, 10)}`;

    while (hasNextPage && totalScraped < limit) {
      const remainingLimit = limit - totalScraped;
      const batchSize = Math.min(30, remainingLimit);

      // 3. Build complete Meta async form payload with required flags (__a=1, __user=0, jazoest, lsd)
      const params = new URLSearchParams();
      params.append('__a', '1');
      params.append('__user', '0');
      params.append('__req', String(pageNumber));
      params.append('dpr', '1');
      params.append('lsd', lsdToken);
      params.append('jazoest', jazoestToken);
      params.append('active_status', isActive.toLowerCase());
      params.append('ad_type', adType);
      params.append('countries[0]', countryCode);
      params.append('count', String(batchSize));
      params.append('session_id', sessionId);

      if (target.mode === 'keyword') {
        params.append('q', target.query);
        params.append('search_type', 'keyword_unordered');
      } else {
        params.append('view_all_page_id', target.query);
        params.append('search_type', 'page');
      }

      if (forwardCursor) {
        params.append('forward_cursor', forwardCursor);
      }

      const headers = getMetaRequestHeaders(userAgent, lsdToken);

      log.info(`📡 Dispatching request batch #${pageNumber} for "${target.query}" (Target batch size: ${batchSize})...`);
      
      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await gotScraping({
            url: 'https://www.facebook.com/ads/library/async/search_ads/',
            method: 'POST',
            body: params.toString(),
            headers,
            cookieJar,
            proxyUrl,
            timeout: { request: 30000 },
            retry: { limit: 0 },
          });

          if (response.statusCode === 200) {
            break;
          } else if (response.statusCode === 429) {
            log.warning('Rate limited by Meta (HTTP 429). Rotating residential session and backing off...');
            await new Promise((res) => setTimeout(res, 3000));
          } else if (response.statusCode === 403) {
            log.warning('Meta responded with HTTP 403 Forbidden. Refreshing session tokens...');
            await new Promise((res) => setTimeout(res, 2000));
          } else {
            log.warning(`Meta responded with HTTP ${response.statusCode}. Retrying...`);
          }
        } catch (fetchErr) {
          log.warning(`Connection dropped: ${(fetchErr as Error).message}. Retrying...`);
        }
        retries--;
        await new Promise((res) => setTimeout(res, 2000));
      }

      if (!response || response.statusCode !== 200) {
        log.error('Failed to retrieve batch from Meta after multiple retries. Ending loop.');
        break;
      }

      let parsed;
      try {
        parsed = parseMetaResponse(response.body);
      } catch (err) {
        log.error(`Parse failure: ${(err as Error).message}`);
        break;
      }

      const results = parsed?.payload?.results;
      if (!Array.isArray(results) || results.length === 0) {
        log.info(`No further ad results found for query "${target.query}"`);
        break;
      }

      const extractedBatch: ScrapedMetaAd[] = [];
      for (const itemGroup of results) {
        const items = Array.isArray(itemGroup) ? itemGroup : [itemGroup];
        for (const rawAd of items) {
          if (!rawAd) continue;
          const ad = extractAdRecord(rawAd);
          if (!pushedAdIds.has(ad.adArchiveID)) {
            pushedAdIds.add(ad.adArchiveID);
            extractedBatch.push(ad);
            totalScraped++;
            if (totalScraped >= limit) break;
          }
        }
        if (totalScraped >= limit) break;
      }

      if (extractedBatch.length > 0) {
        await Actor.pushData(extractedBatch);
        log.info(`✅ Pushed ${extractedBatch.length} ads to Apify Dataset (Total: ${totalScraped}/${limit}).`);
      }

      const forwardCursorNext = parsed?.payload?.forward_cursor || parsed?.payload?.next_cursor;
      if (forwardCursorNext && forwardCursorNext !== forwardCursor && totalScraped < limit) {
        forwardCursor = forwardCursorNext;
        pageNumber++;
        await new Promise((res) => setTimeout(res, 1000));
      } else {
        hasNextPage = false;
      }
    }
  }

  log.info(`🎉 Scraping finished! Successfully collected ${totalScraped} ads into the Apify Dataset.`);
} catch (error) {
  log.error(`Fatal error in Meta Ad Library Scraper: ${(error as Error).message}`);
  throw error;
} finally {
  await Actor.exit();
}
