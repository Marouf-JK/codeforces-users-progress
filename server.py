import html
import json
import os
import re
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


PROFILE_URL = "https://codeforces.com/profile/{handle}"
COUNTER_CLASS = "_UserActivityFrame_counterValue"


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def fetch_profile_html(handle):
    request = urllib.request.Request(
        PROFILE_URL.format(handle=urllib.parse.quote(handle)),
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )

    with urllib.request.urlopen(request, timeout=20) as response:
        status_code = response.status
        final_url = response.geturl()
        html_text = response.read().decode("utf-8", errors="replace")

    print(f"[total-solved] Codeforces status code: {status_code}")
    print(f"[total-solved] Final URL: {final_url}")
    print(f"[total-solved] HTML preview: {html_text[:500]!r}")
    print(
        f"[total-solved] Contains {COUNTER_CLASS}: "
        f"{COUNTER_CLASS in html_text}"
    )
    return html_text, status_code, final_url


def parse_total_solved(html):
    class_pattern = re.escape(COUNTER_CLASS)
    counter_pattern = re.compile(
        rf'<[^>]*class=["\'][^"\']*{class_pattern}[^"\']*["\'][^>]*>(.*?)</[^>]+>',
        re.IGNORECASE | re.DOTALL,
    )
    matches = list(counter_pattern.finditer(html))
    debug_matches = []

    for index, candidate in enumerate(matches, start=1):
        raw_text = re.sub(r"<[^>]+>", " ", candidate.group(1))
        raw_text = html_module_unescape(raw_text)
        nearby_html = html[max(0, candidate.start() - 350):candidate.end() + 350]
        nearby_text = html_module_unescape(re.sub(r"<[^>]+>", " ", nearby_html))
        nearby_text = re.sub(r"\s+", " ", nearby_text).strip()
        number_match = re.search(r"\d+", raw_text)
        value = int(number_match.group(0)) if number_match else None
        debug_matches.append(
            {
                "index": index,
                "value": value,
                "text": re.sub(r"\s+", " ", raw_text).strip(),
                "nearbyText": nearby_text[:700],
            }
        )

    print(f"[total-solved] Matched counter count: {len(debug_matches)}")
    for match_debug in debug_matches:
        print(
            "[total-solved] Counter "
            f"#{match_debug['index']}: value={match_debug['value']}, "
            f"text={match_debug['text']!r}, "
            f"nearby={match_debug['nearbyText']!r}"
        )

    if not matches:
        return None, debug_matches, f"No elements with class {COUNTER_CLASS} found."

    # Prefer the counter in the "Solved for all time" user activity block.
    # If Codeforces changes nearby markup, the first counter is the documented fallback.
    match = matches[0]
    for candidate in matches:
        nearby_html = html[max(0, candidate.start() - 1200):candidate.end() + 1200]
        nearby_text = html_module_unescape(re.sub(r"<[^>]+>", " ", nearby_html))
        if "Solved for all time" in nearby_text:
            match = candidate
            break

    text = re.sub(r"<[^>]+>", " ", match.group(1))
    text = html_module_unescape(text)
    number_match = re.search(r"\d+", text)
    if not number_match:
        return None, debug_matches, "Matched counter did not contain a number."

    return int(number_match.group(0)), debug_matches, None


def html_module_unescape(value):
    return html.unescape(value)


class DashboardRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)

        if parsed_url.path == "/api/total-solved":
            self.handle_total_solved(parsed_url)
            return

        super().do_GET()

    def handle_total_solved(self, parsed_url):
        params = urllib.parse.parse_qs(parsed_url.query)
        handle = params.get("handle", [""])[0].strip()

        if not handle:
            json_response(self, 400, {"error": "Missing handle."})
            return

        try:
            profile_html, status_code, final_url = fetch_profile_html(handle)
            total_solved, matches, parse_error = parse_total_solved(profile_html)

            if total_solved is None:
                json_response(
                    self,
                    502,
                    {
                        "totalSolved": None,
                        "error": parse_error
                        or "Could not parse official solved count from profile HTML.",
                        "statusCode": status_code,
                        "finalUrl": final_url,
                        "containsCounterClass": COUNTER_CLASS in profile_html,
                        "matchedCounters": matches,
                    },
                )
                return

            json_response(self, 200, {"totalSolved": total_solved})
        except Exception as error:
            print(f"[total-solved] Endpoint error: {error!r}")
            json_response(self, 502, {"totalSolved": None, "error": str(error)})


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DashboardRequestHandler)
    print(f"Serving dashboard on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
