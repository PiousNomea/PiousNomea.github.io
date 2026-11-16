"""Fetch the latest Dimsum Daily headlines and save them to headlines.json.

Tries three sources in order, so a site redesign doesn't break the widget:
  1. The RSS feed            (most reliable)
  2. The WordPress posts API  (backup)
  3. Scraping the homepage    (last resort)

If every source fails, the old headlines.json is left untouched and the
script exits with an error so the failure shows up in the Actions tab.
"""

import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import requests
from bs4 import BeautifulSoup

SITE = "https://www.dimsumdaily.hk"
MAX_ITEMS = 10
OUTPUT = "headlines.json"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; PiousNomeaHeadlineBot/1.0; "
        "+https://piousnomea.github.io)"
    )
}


def clean(text, limit=None):
    """Strip HTML tags and extra whitespace; optionally shorten."""
    text = BeautifulSoup(html.unescape(text or ""), "html.parser").get_text(" ")
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return text


def from_rss():
    r = requests.get(f"{SITE}/feed/", headers=HEADERS, timeout=20)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    items = []
    for item in root.iter("item"):
        try:
            date = parsedate_to_datetime(item.findtext("pubDate"))
            date = date.astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            date = None
        items.append({
            "title": clean(item.findtext("title")),
            "link": (item.findtext("link") or "").strip(),
            "date": date,
            "summary": clean(item.findtext("description"), 140),
        })
    return items


def from_wp_api():
    r = requests.get(
        f"{SITE}/wp-json/wp/v2/posts",
        params={"per_page": MAX_ITEMS, "_fields": "title,link,date_gmt,excerpt"},
        headers=HEADERS,
        timeout=20,
    )
    r.raise_for_status()
    return [{
        "title": clean(p["title"]["rendered"]),
        "link": p["link"],
        "date": p["date_gmt"] + "+00:00" if p.get("date_gmt") else None,
        "summary": clean(p.get("excerpt", {}).get("rendered"), 140),
    } for p in r.json()]


def from_homepage():
    r = requests.get(SITE, headers=HEADERS, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    items, seen = [], set()
    for a in soup.select("h2 a[href], h3 a[href]"):
        link, title = a["href"], clean(a.get_text())
        if "dimsumdaily.hk" in link and title and link not in seen:
            seen.add(link)
            items.append({"title": title, "link": link, "date": None, "summary": ""})
    return items


def main():
    for source in (from_rss, from_wp_api, from_homepage):
        try:
            items = [i for i in source() if i["title"] and i["link"]][:MAX_ITEMS]
        except Exception as exc:  # try the next source
            print(f"{source.__name__} failed: {exc}")
            continue
        if items:
            try:
                with open(OUTPUT, encoding="utf-8") as f:
                    if json.load(f).get("items") == items:
                        print("Headlines unchanged; nothing to update")
                        return
            except (OSError, ValueError):
                pass  # no previous file yet
            data = {
                "source": "Dimsum Daily",
                "source_url": SITE,
                "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "via": source.__name__,
                "items": items,
            }
            with open(OUTPUT, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Saved {len(items)} headlines via {source.__name__}")
            return
        print(f"{source.__name__} returned no headlines")
    sys.exit("All sources failed; keeping the previous headlines.json")


if __name__ == "__main__":
    main()
