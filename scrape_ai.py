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


def _extract_allergen_content(visible_text: str, all_scripts: str, max_chars: int) -> str:
    """
    Build a token-efficient string for the LLM (target: under 10k tokens for Groq free tier).

    Strategy:
    1. Visible body text first (usually small for SPAs).
    2. Parse script content for item name + allergen description pairs and convert
       them to readable lines like "Item: Zax Sauce | Contains: egg, wheat, soy".
       Raw JSON is ~2 chars/token; reformatted text is ~4 chars/token, halving cost.
    3. Fall back to raw allergen-keyword windows if no structured pairs found.
    4. Truncate combined to max_chars.
    """
    import re

    # ── Pattern 1: title/name + description containing "Contains" ─────────
    ITEM_ALLERGEN = re.compile(
        r'"(?:title|name|item_name|itemName)"\s*:\s*"(?P<name>[^"]{2,80})"'
        r'(?:(?!"description").){0,500}'   # skip up to 500 chars before description
        r'"description"\s*:\s*"(?P<desc>[^"]*?[Cc]ontains[^"]*?)"',
        re.DOTALL,
    )
    allergen_lines: list[str] = []
    seen_names: set[str] = set()
    for m in ITEM_ALLERGEN.finditer(all_scripts):
        name = m.group("name").strip()
        desc = m.group("desc").replace("\\r\\n", " ").replace("\\n", " ").strip()
        if name in seen_names:
            continue
        seen_names.add(name)
        allergen_lines.append(f"Item: {name} | {desc[:200]}")

    # ── Pattern 2: raw keyword windows if structured parse found nothing ──
    if not allergen_lines:
        ALLERGEN_KW = re.compile(
            r'contains|allergen|milk|dairy|egg[^s]|fish|shellfish|tree.?nut|peanut|wheat|gluten|soy|sesame',
            re.IGNORECASE,
        )
        WINDOW = 300
        seen_offsets: set[int] = set()
        for m in ALLERGEN_KW.finditer(all_scripts):
            bucket = (max(0, m.start() - WINDOW) // WINDOW) * WINDOW
            if bucket in seen_offsets:
                continue
            seen_offsets.add(bucket)
            snippet = all_scripts[max(0, m.start() - WINDOW): m.start() + WINDOW]
            allergen_lines.append(snippet)

    script_section = "\n".join(allergen_lines)
    combined = visible_text
    if script_section.strip():
        combined = visible_text + "\n\n=== ALLERGEN DATA FROM PAGE ===\n" + script_section

    if len(combined) > max_chars:
        combined = combined[:max_chars]
    return combined


def _extract_pdf_content(pdf_path: str) -> str:
    """
    Extract allergen-relevant content from a PDF.
    Tries table extraction first (token-efficient for allergen charts),
    falls back to filtered text lines containing allergen keywords.
    """
    import pdfplumber
    import re

    ALLERGEN_KW = re.compile(
        r'milk|dairy|egg|fish|shellfish|tree.?nut|peanut|wheat|gluten|soy|sesame|allergen|contains',
        re.IGNORECASE,
    )

    table_lines: list[str] = []
    text_lines: list[str] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            # Try table extraction — produces compact "col1 | col2 | ..." rows
            tables = page.extract_tables() or []
            for table in tables:
                for row in table:
                    if row:
                        cells = [str(c or "").strip() for c in row]
                        row_str = " | ".join(cells)
                        table_lines.append(row_str)

            # Also collect raw text lines containing allergen keywords
            text = page.extract_text() or ""
            for line in text.splitlines():
                if ALLERGEN_KW.search(line):
                    text_lines.append(line.strip())

    if table_lines:
        content = "\n".join(table_lines)
        print(f"[allerva-ai] PDF tables: {len(table_lines)} rows", file=sys.stderr)
        return content

    # Fallback: allergen-keyword lines only
    content = "\n".join(text_lines)
    print(f"[allerva-ai] PDF text (filtered): {len(text_lines)} lines", file=sys.stderr)
    return content


def _parse_allergen_table_direct(pdf_path: str, source_url: str) -> list:
    """
    Parse an allergen-chart PDF directly without an LLM.
    Supports two table layouts:
      A) Checkbox grid  — one column per allergen, cells contain X/•/Y/1/empty
      B) Allergen text  — single "Allergens" or "Contains" column with text like "Contains Milk, Soy"
    Returns a list of allergen row dicts, or [] if the table structure isn't recognised.
    """
    import pdfplumber
    from datetime import datetime, timezone

    # Column-header aliases → schema key (used for grid layout)
    COL_MAP = {
        "milk": "milk", "dairy": "milk",
        "egg": "eggs", "eggs": "eggs",
        "fish": "fish",
        "shellfish": "shellfish", "crustacean": "shellfish",
        "tree nut": "treeNuts", "treenuts": "treeNuts", "tree nuts": "treeNuts",
        "peanut": "peanuts", "peanuts": "peanuts",
        "wheat": "wheat", "gluten": "wheat",
        "soy": "soy", "soybean": "soy",
        "sesame": "sesame",
    }

    # Keyword → allergen key (used when parsing free text like "Contains Milk, Soy, Wheat")
    TEXT_MAP = [
        (["milk", "dairy"], "milk"),
        (["egg"], "eggs"),
        (["fish"], "fish"),
        (["shellfish", "crustacean"], "shellfish"),
        (["tree nut", "treenut"], "treeNuts"),
        (["peanut"], "peanuts"),
        (["wheat", "gluten"], "wheat"),
        (["soy"], "soy"),
        (["sesame"], "sesame"),
    ]

    def cell_is_positive(cell: str) -> bool:
        s = (cell or "").strip().lower()
        return s in {"x", "yes", "✓", "•", "●", "y", "true", "1", "contains", "■", "√"}

    def cell_is_negative(cell: str) -> bool:
        s = (cell or "").strip().lower()
        return s in {"", "-", "no", "n", "false", "0", "○", "□", "free", "✗", "none"}

    def normalize_header(cell: str) -> str:
        """Return lowercase; also try reversed string (handles rotated PDF text)."""
        s = (cell or "").strip().lower()
        return s

    def is_allergen_header(s: str) -> bool:
        """True if the string (forward or backward) contains 'allergen' or 'contains'."""
        return "allergen" in s or "allergen" in s[::-1] or "contains" in s

    # Abbreviation codes used in PDF allergen columns (e.g. Carl's Jr, Hardee's)
    ABBREV_MAP = {
        "m": "milk",  "d": "milk",
        "e": "eggs",
        "f": "fish",
        "sh": "shellfish", "cr": "shellfish",
        "tn": "treeNuts", "t": "treeNuts",
        "p": "peanuts",
        "w": "wheat",  "g": "wheat",
        "s": "soy",
        "ss": "sesame",
    }

    # Layout C column order (offset 0-8 from merged allergen header cell).
    # Empirically validated on Bojangles 2024 nutrition guide PDF; the order is
    # Egg, Fish, Milk, Peanut, Sesame, Soy, Shellfish, Wheat, TreeNuts.
    LAYOUT_C_ORDER = [
        "eggs", "fish", "milk", "peanuts", "sesame",
        "soy", "shellfish", "wheat", "treeNuts",
    ]

    def parse_allergen_text(text: str) -> dict:
        """Parse allergen text in two modes:
          1. Abbreviation codes: 'E,M,S,SS,W' → eggs/milk/soy/sesame/wheat = TRUE
          2. Keyword text: 'Contains Milk, Soy, Wheat' → keyword matching
        """
        import re as _re2
        t = (text or "").strip()
        if not t:
            return {key: "FALSE" for _, key in TEXT_MAP}

        # Detect abbreviation format: short text, mostly uppercase single/double letters
        # Examples: "E,M,S,SS,W" / "M,S +" / "W" / "E,M,W"
        abbrev_check = _re2.sub(r'[,\s+\-]+', '', t.upper())
        if abbrev_check and _re2.fullmatch(r'[A-Z+]+', abbrev_check) and len(t) <= 30:
            # Abbreviation mode — tokenise by comma/space/+
            tokens = [tok.lower() for tok in _re2.split(r'[,\s+]+', t) if tok.strip()]
            present_keys = set()
            for tok in tokens:
                tok = tok.strip()
                if tok in ABBREV_MAP:
                    present_keys.add(ABBREV_MAP[tok])
            if present_keys:
                result = {}
                for _, key in TEXT_MAP:
                    result[key] = "TRUE" if key in present_keys else "FALSE"
                return result

        # Keyword mode — search for allergen words in text
        t_lower = t.lower()
        result = {}
        for keywords, key in TEXT_MAP:
            present = any(kw in t_lower for kw in keywords)
            result[key] = "TRUE" if present else "FALSE"
        return result

    def make_row(item_name, category, allergen_data, source_url):
        return {
            "rowNum": 0,  # will be renumbered by caller
            "menuCategory": category,
            "itemName": item_name,
            "milk": allergen_data.get("milk", "COULD_NOT_VERIFY"),
            "eggs": allergen_data.get("eggs", "COULD_NOT_VERIFY"),
            "fish": allergen_data.get("fish", "COULD_NOT_VERIFY"),
            "shellfish": allergen_data.get("shellfish", "COULD_NOT_VERIFY"),
            "treeNuts": allergen_data.get("treeNuts", "COULD_NOT_VERIFY"),
            "peanuts": allergen_data.get("peanuts", "COULD_NOT_VERIFY"),
            "wheat": allergen_data.get("wheat", "COULD_NOT_VERIFY"),
            "soy": allergen_data.get("soy", "COULD_NOT_VERIFY"),
            "sesame": allergen_data.get("sesame", "COULD_NOT_VERIFY"),
            "crossContact": "NO",
            "confidence": "HIGH",
            "sourceText": "PDF allergen table",
            "sourceUrl": source_url,
            "scrapeDate": datetime.now(timezone.utc).isoformat(),
        }

    def _detect_merged_allergen_header(row):
        """Return column index of a merged allergen header cell, or None.
        Detects cells where forward or reversed text contains ≥5 allergen keywords
        AND at least 4 of the following 8 columns are empty (merged-cell span).
        """
        for ci, cell in enumerate(row):
            s = (cell or "").strip()
            if not s:
                continue
            for text in (s.lower(), s[::-1].lower()):
                n_matches = sum(
                    1 for kw in ("egg", "fish", "milk", "peanut", "sesame", "soy", "shellfish", "wheat")
                    if kw in text
                )
                if n_matches >= 5:
                    trailing_empty = sum(1 for c in row[ci + 1 : ci + 9] if not (c or "").strip())
                    if trailing_empty >= 4:
                        return ci
        return None

    rows: list[dict] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                if len(table) < 2:
                    continue

                # ── Layout A: checkbox grid (≥2 distinct allergen columns) ──────────────
                header_row_idx = None
                col_to_allergen: dict[int, str] = {}
                for ri, row in enumerate(table[:5]):
                    if not row:
                        continue
                    mapping: dict[int, str] = {}
                    for ci, cell in enumerate(row):
                        h = normalize_header(cell)
                        # Allergen headers are short labels (≤15 chars), not data values or item names.
                        # "Contains Milk, Soy" and ingredient lists are excluded by these guards.
                        if len(h) > 15 or "contains" in h:
                            continue
                        for alias, key in COL_MAP.items():
                            if alias in h:
                                mapping[ci] = key
                                break
                    if len(mapping) >= 2:
                        header_row_idx = ri
                        col_to_allergen = mapping
                        break

                if header_row_idx is not None:
                    allergen_cols = set(col_to_allergen.keys())
                    name_col = next((i for i in range(len(table[header_row_idx])) if i not in allergen_cols), 0)
                    cat_col = 0 if name_col > 0 and 0 not in allergen_cols else None
                    current_category = "Menu"

                    for row in table[header_row_idx + 1:]:
                        if not row or not any(row):
                            continue
                        item_name = ((row[name_col] if name_col < len(row) else None) or "").strip()
                        if not item_name or len(item_name) > 120:
                            continue
                        if cat_col is not None:
                            cat_cell = (row[cat_col] or "").strip()
                            if cat_cell and not any(row[c] for c in allergen_cols if c < len(row)):
                                current_category = cat_cell
                                continue

                        allergen_data: dict[str, str] = {}
                        has_any = False
                        for ci, key in col_to_allergen.items():
                            cell = row[ci] if ci < len(row) else ""
                            if cell_is_positive(cell):
                                allergen_data[key] = "TRUE"; has_any = True
                            elif cell_is_negative(cell):
                                allergen_data[key] = "FALSE"; has_any = True
                            else:
                                allergen_data[key] = "COULD_NOT_VERIFY"

                        if not has_any:
                            continue
                        r = make_row(item_name, current_category, allergen_data, source_url)
                        rows.append(r)
                    continue  # done with this table — skip Layout B check

                # ── Layout C: merged allergen-header grid (e.g. Bojangles) ────────────
                # One merged cell spans 9 allergen sub-columns; cell text (or its
                # character-reversed form) contains all 9 allergen names.
                layout_c_col = None
                layout_c_header_ri = None
                for ri, row in enumerate(table[:5]):
                    if not row:
                        continue
                    ci = _detect_merged_allergen_header(row)
                    if ci is not None:
                        layout_c_col = ci
                        layout_c_header_ri = ri
                        break

                if layout_c_col is not None:
                    current_category = "Menu"
                    for row in table[layout_c_header_ri + 1:]:
                        if not row or not any(row):
                            continue
                        item_name = ((row[0] if row else None) or "").strip()
                        if not item_name or len(item_name) > 120:
                            continue
                        allergen_cells = [
                            (row[layout_c_col + off] if layout_c_col + off < len(row) else "") or ""
                            for off in range(9)
                        ]
                        all_empty = all(not c.strip() for c in allergen_cells)
                        if all_empty and item_name.isupper():
                            current_category = item_name
                            continue
                        allergen_data: dict[str, str] = {}
                        has_any = False
                        for off, ak in enumerate(LAYOUT_C_ORDER):
                            cell = allergen_cells[off]
                            if cell_is_positive(cell):
                                allergen_data[ak] = "TRUE"
                                has_any = True
                            elif cell_is_negative(cell):
                                allergen_data[ak] = "FALSE"
                                has_any = True
                            else:
                                allergen_data[ak] = "COULD_NOT_VERIFY"
                        if not has_any:
                            continue
                        r = make_row(item_name, current_category, allergen_data, source_url)
                        rows.append(r)
                    continue  # done with this table — skip Layout B

                # ── Layout B: single allergen-text column ("Contains Milk, Soy") ────────
                allergen_text_col = None
                ingredient_col_b = None
                name_col_b = 0
                for ri, row in enumerate(table[:5]):
                    if not row:
                        continue
                    for ci, cell in enumerate(row):
                        h = normalize_header(cell)
                        if is_allergen_header(h):
                            allergen_text_col = ci
                            name_col_b = next((i for i in range(len(row)) if i != ci), 0)
                            header_row_idx = ri
                        elif "ingredient" in h:
                            ingredient_col_b = ci
                    if allergen_text_col is not None:
                        break

                if allergen_text_col is None:
                    continue  # can't parse this table

                current_category = "Menu"
                for row in table[header_row_idx + 1:]:
                    if not row or not any(row):
                        continue
                    item_name = ((row[name_col_b] if name_col_b < len(row) else None) or "").strip()
                    if not item_name or len(item_name) > 120:
                        continue
                    # Category detection: row where allergen column is empty and name looks like a header
                    allergen_cell = (row[allergen_text_col] if allergen_text_col < len(row) else "") or ""
                    if not allergen_cell.strip() and item_name.isupper():
                        current_category = item_name
                        continue

                    # If the dedicated allergen column is empty, fall back to the ingredient list
                    if not allergen_cell.strip() and ingredient_col_b is not None:
                        allergen_cell = (row[ingredient_col_b] if ingredient_col_b < len(row) else "") or ""

                    allergen_data = parse_allergen_text(allergen_cell)
                    r = make_row(item_name, current_category, allergen_data, source_url)
                    rows.append(r)

    # Re-number rows
    for i, r in enumerate(rows):
        r["rowNum"] = i + 1
    return rows


def scrape_pdf(pdf_url: str, provider: str, model: str) -> list:
    """
    Download a PDF, extract its text with pdfplumber, call the LLM directly
    (bypasses ScrapeGraphAI which can't reliably handle PDF files).
    Returns a list of normalized allergen row dicts.
    """
    import tempfile
    import urllib.request
    import pdfplumber

    print(f"[allerva-ai] Downloading PDF: {pdf_url}", file=sys.stderr)
    req = urllib.request.Request(pdf_url, headers={"User-Agent": "Mozilla/5.0"})
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        with urllib.request.urlopen(req, timeout=60) as resp:
            f.write(resp.read())
        tmp_path = f.name
    print(f"[allerva-ai] PDF saved to {tmp_path}", file=sys.stderr)

    # Attempt 1: LLM-free direct table parsing (works for structured allergen tables)
    direct_rows = _parse_allergen_table_direct(tmp_path, pdf_url)
    if direct_rows:
        print(f"[allerva-ai] Direct table parse succeeded: {len(direct_rows)} rows (no LLM needed)", file=sys.stderr)
        return direct_rows
    print("[allerva-ai] Direct table parse returned 0 rows — falling back to LLM", file=sys.stderr)

    # Attempt 2: Extract content for LLM — prefer table rows (token-efficient) over raw text
    pdf_text = _extract_pdf_content(tmp_path)
    if not pdf_text.strip():
        print("[allerva-ai] PDF has no extractable text (image-based?)", file=sys.stderr)
        return []

    # Fit token budget: Groq free tier 12k TPM; input must stay under ~11k tokens
    # Dense PDF table rows run ~1.45 tokens/char; 5.5k chars + ~1.8k prompt ≈ 9.8k total
    MAX_PDF_CHARS = 5_500
    if len(pdf_text) > MAX_PDF_CHARS:
        pdf_text = pdf_text[:MAX_PDF_CHARS]
        print(f"[allerva-ai] PDF content truncated to {MAX_PDF_CHARS:,} chars", file=sys.stderr)

    # Call LLM directly via langchain
    full_prompt = EXTRACTION_PROMPT + "\n\nPAGE CONTENT:\n" + pdf_text

    if provider == "groq":
        from langchain_groq import ChatGroq
        llm = ChatGroq(api_key=os.environ.get("GROQ_API_KEY", ""), model_name=model, max_tokens=8192)
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""), model_name=model, max_tokens=8192)
    else:
        print(f"[allerva-ai] PDF path unsupported for provider: {provider}", file=sys.stderr)
        return []

    from langchain_core.messages import HumanMessage
    response = llm.invoke([HumanMessage(content=full_prompt)])
    raw = response.content.strip()
    print(f"[allerva-ai] LLM response: {len(raw):,} chars", file=sys.stderr)

    # Parse JSON from response — try direct parse first, then regex extraction
    import re
    items = None
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        json_match = re.search(r'\[.*\]', raw, re.DOTALL)
        if json_match:
            try:
                items = json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass
    if items is None:
        print(f"[allerva-ai] No JSON array in LLM response: {raw[:200]}", file=sys.stderr)
        return []
    rows = [normalize_row(item, pdf_url) for item in items if isinstance(item, dict)]
    return rows


def fetch_rendered_html(url: str) -> str:
    """
    Render the page with Playwright, then return a token-budget-friendly text payload:
      - Visible body text (what a user sees)
      - JSON data from <script type="application/json"> blocks (preserves embedded allergen data)
      - Truncated to MAX_CHARS to stay within Groq free tier (12k TPM ≈ 40k chars)
    Falls back to the URL string on failure so ScrapeGraphAI can try its own fetch.
    """
    MAX_CHARS = 20_000  # ~8k tokens — safely fits Groq free tier 12k TPM (content+prompt+response)

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

            try:
                page.wait_for_load_state("networkidle", timeout=20_000)
            except Exception:
                page.wait_for_timeout(5_000)

            # Visible text — strips all HTML tags
            visible_text = page.inner_text("body")

            # All script text — many SPAs embed menu + allergen data as JSON in <script> tags
            all_scripts = page.evaluate("""() =>
                Array.from(document.querySelectorAll('script'))
                     .map(s => s.textContent).join(' ')
            """)

            browser.close()

            # Build allergen-focused content: visible text + allergen-relevant script snippets
            combined = _extract_allergen_content(visible_text, all_scripts, MAX_CHARS)

            raw_len = len(visible_text) + len(all_scripts)
            print(f"[allerva-ai] Content prepared: {len(combined):,} chars (raw: {raw_len:,})", file=sys.stderr)
            return combined
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
        help="Model name (default: llama-3.3-70b-versatile for Groq — 12k TPM free tier)",
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

    # PDF URLs: extract text with pdfplumber + call LLM directly
    # (SmartScraperGraph / Playwright can't render PDFs reliably)
    # Match .pdf before a query string (e.g., ?language=en-US) OR path ending
    # with 'pdf' without a dot (CDN-style, e.g. scene7.com/…/0924_BJS_NUTRI_92425pdf)
    import re as _re
    from urllib.parse import urlparse as _urlparse
    _pdf_path = _urlparse(args.url).path.rstrip('/').lower()
    if _pdf_path.endswith('pdf'):
        rows = scrape_pdf(args.url, args.provider, args.model)
        print(f"[allerva-ai] Extracted {len(rows)} rows", file=sys.stderr)
        print(json.dumps(rows))
        return

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
