# Hugging Face Trending Monitor

Tracks new and trending models and datasets on Hugging Face and optionally notifies a webhook when items meet configured thresholds.

## Features

- Crawl Hugging Face models and datasets listing pages.
- Extract metadata: name (namespace/name), author, description, tags, likes and download-like metrics (best-effort).
- Filter by likes and type (models/datasets).
- Save structured items to Dataset for downstream analysis.
- Optional webhook notification (POST JSON) for new/trending items.

## Installation

1. Create project folders and paste files into `.actor/` and `src/`.
2. Install dependencies:
```bash
npm install
```

## Usage

Run locally:
```bash
apify run
```

Example INPUT (storage/key_value_stores/default/INPUT.json):
```json
{
  "startUrls": [
    { "url": "https://huggingface.co/models?sort=downloads" },
    { "url": "https://huggingface.co/datasets?sort=downloads" }
  ],
  "maxRequestsPerCrawl": 200,
  "includeModels": true,
  "includeDatasets": true,
  "minLikes": 10,
  "webhookUrl": ""
}
```

## Deploy

1. Login to Apify:
```bash
apify login
```

2. Push to Apify platform:
```bash
apify push
```

## Output format

Dataset items:
```json
{
  "itemType": "model",
  "name": "facebook/opt-125m",
  "shortName": "opt-125m",
  "author": "facebook",
  "url": "https://huggingface.co/facebook/opt-125m",
  "description": "A small OPT model...",
  "tags": ["text-generation","causal-lm"],
  "likes": 1234,
  "downloads": null,
  "lastUpdated": "2026-05-06T12:34:56Z",
  "metrics": {},
  "notified": false,
  "timestamp": "2026-05-06T12:34:56Z"
}
```

## Legal & Ethical

- Respect Hugging Face terms of service and robots.txt.
- Prefer using Hugging Face APIs where appropriate and authenticated access for heavy collection.
- Do not collect private or sensitive data.
- Limit crawl rate and storage usage responsibly.

## License

ISC