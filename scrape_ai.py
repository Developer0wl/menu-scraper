#!/usr/bin/env python3
"""
Allerva AI Sidecar — ScrapeGraphAI-powered allergen extraction.

Usage:
  python scrape_ai.py --chain-name "BlazePizza" --url "https://blazepizza.com/nutrition"
  python scrape_ai.py --chain-name "TimHortons" --url "https://..." --provider openai --model gpt-4o-mini

Outputs a JSON array of allergen rows to stdout (same schema as the Node.js scrapers).
Errors go to stderr.

Setup:
  pip install -r requirements.txt
  playwright install chromium          # Python playwright (separate from Node.js)

Environment variables (set whichever provider you use):
  GROQ_API_KEY    — for --provider groq  (default, fast + cheap)
  OPENAI_API_KEY  — for --provider openai
  OLLAMA_BASE_URL — for --provider ollama (default: http://localhost:11434)
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

ALLERGENS = ["milk", "eggs", "fish", "shellfish", "treeNuts", "peanuts", "wheat", "soy", "sesame"]
VALID_ALLERGEN = {"TRUE", "FALSE", "COULD_NOT_VERIFY"}

EXTRACTION_PROMPT = """
Extract every menu item from this restaurant's allergen or nutrition page.

For each item return a JSON object with exactly these fields:
  category    - menu section name (string, e.g. "Tacos", "Burgers", "Sides")
  itemName    - exact item name (string)
  milk        - "TRUE" if contains milk/dairy/butter/cream/cheese, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  eggs        - "TRUE" if contains eggs, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  fish        - "TRUE" if contains fish/anchovy/salmon/tuna/cod, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  shellfish   - "TRUE" if contains shellfish/shrimp/crab/lobster, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  treeNuts    - "TRUE" if contains tree nuts (almonds/cashews/walnuts/pecans/pistachios), "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  peanuts     - "TRUE" if contains peanuts, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  wheat       - "TRUE" if contains wheat/gluten/flour/barley/rye, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  soy         - "TRUE" if contains soy/soybean/tofu/edamame, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  sesame      - "TRUE" if contains sesame/tahini, "FALSE" if explicitly absent, "COULD_NOT_VERIFY" if unknown
  crossContact - "YES" if cross-contamination risk mentioned, "NO" if not mentioned, "COULD_NOT_VERIFY" if unclear
  confidence  - "HIGH" if data from allergen table or explicit list, "LOW" if inferred from ingredients

Rules:
- Only use exactly: "TRUE", "FALSE", "COULD_NOT_VERIFY" for allergen fields.
- Only use "YES", "NO", "COULD_NOT_VERIFY" for crossContact.
- Only use "HIGH", "LOW", "COULD_NOT_VERIFY" for confidence.
- If no allergen data exists on the page, return an empty array [].
- Return a top-level JSON array of item objects — nothing else.
"""


def build_config(provider: str, model: str) -> dict:
    if provider == "groq":
        api_key = os.environ.get("GROQ_API_KEY", "")
        if not api_key:
            print(
                json.dumps({"error": "GROQ_API_KEY environment variable not set"}),
                file=sys.stderr,
            )
            sys.exit(1)
        return {
            "llm": {
                "api_key": api_key,
                "model": f"groq/{model}",
            },
            "model_tokens": 128_000,
            "verbose": False,
            "headless": True,
        }

    if provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            print(
                json.dumps({"error": "OPENAI_API_KEY environment variable not set"}),
                file=sys.stderr,
            )
            sys.exit(1)
        return {
            "llm": {
                "api_key": api_key,
                "model": model,
            },
            "model_tokens": 128_000,
            "verbose": False,
            "headless": True,
        }

    if provider == "ollama":
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        return {
            "llm": {
                "model": f"ollama/{model}",
                "base_url": base_url,
            },
            "model_tokens": 128_000,
            "verbose": False,
            "headless": True,
        }

    print(json.dumps({"error": f"Unknown provider: {provider}"}), file=sys.stderr)
    sys.exit(1)


def flatten_result(result) -> list:
    """Normalize SmartScraperGraph output — it can be a list or a dict containing a list."""
    if isinstance(result, list):
        return result
    if isinstance(result, dict):
        # Look for the first list value
        for v in result.values():
            if isinstance(v, list):
                return v
    return []


def normalize_row(item: dict, source_url: str) -> dict:
    """Validate and coerce an AI-extracted item to the Allerva row schema."""
    row = {
        "menuCategory": str(item.get("category") or "COULD_NOT_VERIFY"),
        "itemName": str(item.get("itemName") or "COULD_NOT_VERIFY"),
        "crossContact": "COULD_NOT_VERIFY",
        "confidence": "HIGH",
        "sourceUrl": source_url,
        "scrapeDate": datetime.now(timezone.utc).isoformat(),
        "sourceText": f"ScrapeGraphAI — {source_url}",
    }

    for allergen in ALLERGENS:
        raw = str(item.get(allergen, "COULD_NOT_VERIFY")).strip().upper()
        row[allergen] = raw if raw in VALID_ALLERGEN else "COULD_NOT_VERIFY"

    cross = str(item.get("crossContact", "COULD_NOT_VERIFY")).strip().upper()
    row["crossContact"] = cross if cross in {"YES", "NO", "COULD_NOT_VERIFY"} else "COULD_NOT_VERIFY"

    conf = str(item.get("confidence", "HIGH")).strip().upper()
    row["confidence"] = conf if conf in {"HIGH", "LOW", "COULD_NOT_VERIFY"} else "HIGH"

    return row


def fetch_rendered_html(url: str) -> str:
    """
    Use Python Playwright to fully render the page (runs JS) and return the HTML.
    Falls back to returning the URL string if Playwright fails, so ScrapeGraphAI
    can attempt its own fetch as a last resort.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("[allerva-ai] playwright not available — passing URL directly", file=sys.stderr)
        return url

    print("[allerva-ai] Rendering page with Playwright...", file=sys.stderr)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--lang=en-US,en",
                ],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.6367.201 Safari/537.36"
                ),
                locale="en-US",
            )
            context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60_000)

            # Wait for the page to settle (networkidle or a fixed wait)
            try:
                page.wait_for_load_state("networkidle", timeout=20_000)
            except Exception:
                page.wait_for_timeout(5_000)

            html = page.content()
            browser.close()
            print(f"[allerva-ai] Rendered HTML: {len(html):,} chars", file=sys.stderr)
            return html
    except Exception as exc:
        print(f"[allerva-ai] Playwright render failed: {exc} — falling back to URL", file=sys.stderr)
        return url


def main():
    parser = argparse.ArgumentParser(description="Allerva AI allergen sidecar")
    parser.add_argument("--chain-name", required=True, help="Chain name (for logging)")
    parser.add_argument("--url", required=True, help="Allergen/nutrition page URL")
    parser.add_argument(
        "--provider",
        default="groq",
        choices=["groq", "openai", "ollama"],
        help="LLM provider (default: groq)",
    )
    parser.add_argument(
        "--model",
        default="llama-3.3-70b-versatile",
        help="Model name (default: llama-3.3-70b-versatile for Groq)",
    )
    args = parser.parse_args()

    try:
        from scrapegraphai.graphs import SmartScraperGraph
    except ImportError:
        print(
            json.dumps({
                "error": (
                    "scrapegraphai not installed. "
                    "Run: pip install -r requirements.txt && playwright install chromium"
                )
            }),
            file=sys.stderr,
        )
        sys.exit(1)

    config = build_config(args.provider, args.model)

    print(f"[allerva-ai] Scraping {args.chain_name} at {args.url}", file=sys.stderr)

    # Pre-render the page with Playwright so the LLM sees fully-hydrated HTML,
    # not the bare skeleton that JS-heavy SPAs serve on initial load.
    source = fetch_rendered_html(args.url)

    try:
        graph = SmartScraperGraph(
            prompt=EXTRACTION_PROMPT,
            source=source,
            config=config,
        )
        result = graph.run()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)

    items = flatten_result(result)
    rows = [normalize_row(item, args.url) for item in items if isinstance(item, dict)]

    print(f"[allerva-ai] Extracted {len(rows)} rows", file=sys.stderr)
    print(json.dumps(rows))


if __name__ == "__main__":
    main()
