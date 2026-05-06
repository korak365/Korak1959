// Hugging Face Trending Monitor
// Scrapes Hugging Face models & datasets listing pages and individual item pages,
// saves metadata to Dataset and posts to a webhook when configured.
//
// Uses CheerioCrawler (fast HTTP-based). Does NOT execute page JS.

import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

await Actor.init();

const {
    startUrls = ['https://huggingface.co/models?sort=downloads', 'https://huggingface.co/datasets?sort=downloads'],
    maxRequestsPerCrawl = 200,
    includeModels = true,
    includeDatasets = true,
    minLikes = 10,
    webhookUrl = '',
    siteAllowList = ['huggingface.co', 'www.huggingface.co']
} = (await Actor.getInput()) ?? {};

const proxyConfiguration = await Actor.createProxyConfiguration();
let notificationsSent = 0;

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler({ request, $, enqueueLinks, log }) {
        const url = request.loadedUrl;
        log.info('Processing', { url });

        try {
            // On listing pages, enqueue links to model/dataset pages
            if (url.includes('/models') || url.includes('/datasets')) {
                // Link patterns: /<type>/<namespace>/<name>
                await enqueueLinks({
                    selector: 'a[href*="/models/"], a[href*="/datasets/"]',
                    allowExternal: false,
                    transformRequestFunction: (r) => ({ ...r, userData: { fromListing: true } })
                }).catch(() => {});

                // Optionally follow pagination
                await enqueueLinks({
                    selector: 'a',
                    globs: ['**?page=*', '**&page=*', '**/page/*']
                }).catch(() => {});
                return;
            }

            // Individual model or dataset page
            if (/\/models\/|\/datasets\//.test(url)) {
                // Heuristic: determine item type
                const itemType = url.includes('/models/') ? 'model' : (url.includes('/datasets/') ? 'dataset' : 'unknown');

                // Extract name (namespace/name)
                const pathMatch = url.match(/(?:huggingface\.co\/)(models|datasets)\/(.+?)(?:$|[?#\/])/);
                const name = pathMatch ? pathMatch[2].replace(/\/+$/,'') : $('h1').first().text().trim();

                // Author (namespace is before slash)
                const author = name && name.includes('/') ? name.split('/')[0] : '';

                // Title / short name
                const shortName = name && name.includes('/') ? name.split('/')[1] : name;

                // Description: try meta tags, then page elements
                const description = $('meta[name="description"]').attr('content') ||
                    $('p.card-description, .card-body p, .lead').first().text().trim() || '';

                // Tags: best-effort selectors
                const tags = [];
                $('a[href*="/tasks/"], a[href*="/libraries/"], .tag, .tags a').each((i, el) => {
                    const t = $(el).text().trim();
                    if (t) tags.push(t);
                });

                // Likes: find elements that include "Likes" or a heart icon nearby
                let likes = null;
                const likesText = $('[data-testid="like-count"], .likes, .hf-like-count, button[aria-label*="likes"], button[title*="likes"]').first().text() || '';
                if (likesText) {
                    const m = likesText.replace(/,/g, '').match(/\d+/);
                    likes = m ? parseInt(m[0], 10) : null;
                }

                // Downloads or other metric: best-effort
                let downloads = null;
                const downloadsText = $('[data-testid="downloads-count"], .downloads, .hf-downloads, .stat-number').first().text() || '';
                if (downloadsText) {
                    const m = downloadsText.replace(/,/g, '').match(/\d+/);
                    downloads = m ? parseInt(m[0], 10) : null;
                }

                // Last updated date (if visible)
                let lastUpdated = '';
                const lu = $('[data-testid="last-updated"], .last-updated, .modified, time').first().attr('datetime') || $('time').first().text().trim();
                if (lu) lastUpdated = lu;

                // Metrics object: attempt to collect any performance badges/metrics
                const metrics = {};
                $('.metric, .model-metrics, .dataset-metric').each((i, el) => {
                    const key = $(el).find('.metric-name').text().trim() || $(el).find('.label').text().trim();
                    const val = $(el).find('.metric-value').text().trim() || $(el).text().trim();
                    if (key && val) metrics[key] = val;
                });

                // Compose item
                const item = {
                    itemType,
                    name,
                    shortName,
                    author,
                    url,
                    description,
                    tags: Array.from(new Set(tags)).slice(0, 50),
                    likes: likes || 0,
                    downloads: downloads || null,
                    lastUpdated,
                    metrics,
                    notified: false,
                    timestamp: new Date().toISOString()
                };

                // Apply filters
                if ((itemType === 'model' && !includeModels) || (itemType === 'dataset' && !includeDatasets)) {
                    log.info('Skipping due to type filter', { itemType, url });
                    return;
                }
                if (minLikes && item.likes < minLikes) {
                    log.info('Skipping due to minLikes filter', { likes: item.likes, minLikes });
                    return;
                }

                // Save to dataset
                await Dataset.pushData(item);

                // If webhook configured, POST the item
                if (webhookUrl && webhookUrl.trim()) {
                    try {
                        const res = await fetch(webhookUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(item),
                            redirect: 'follow'
                        });
                        if (res.ok) {
                            notificationsSent++;
                            item.notified = true;
                            log.info('Webhook notified', { url, status: res.status });
                        } else {
                            log.warning('Webhook returned non-OK', { status: res.status, url: webhookUrl });
                        }
                    } catch (err) {
                        log.warning('Failed to POST webhook', { error: err.message, url: webhookUrl });
                    }
                }

                // Optionally enqueue related links (authors, similar models)
                await enqueueLinks({
                    selector: 'a[href*="/models/"], a[href*="/datasets/"], a[href*="/docs/"], a[href*="/tasks/"]',
                    allowExternal: false
                }).catch(() => {});
            }
        } catch (err) {
            log.warning('Error processing request', { url, error: err.message });
        }
    }
});

await crawler.run(startUrls);

console.log('Actor finished. Notifications sent:', notificationsSent);
await Actor.exit();