"""Configure RouteNote's native redirect without changing other apps' settings."""

import json
import os
import urllib.error
import urllib.request

PROJECT = "xrrdokcjhjqdfvwtbenl"
APP_REDIRECTS = (
    "https://jamaica8612.github.io/routenote/",
    "com.jamaica8612.routenote://auth/callback",
)


def request(path, method="GET", payload=None):
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/" + PROJECT + path,
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        method=method,
        headers={
            "Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"],
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; routenote-deploy/1.0)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not print auth configuration or credentials returned by the API.
        raise RuntimeError(f"Management API {method} {path} failed: HTTP {error.code}") from None


def main():
    previous = request("/config/auth")
    if not previous.get("external_google_enabled"):
        raise RuntimeError("Existing Google login is disabled; do not change providers automatically")
    existing = previous.get("uri_allow_list") or ""
    if not isinstance(existing, str):
        raise RuntimeError("Unexpected auth redirect configuration format")
    redirects = [value.strip() for value in existing.split(",") if value.strip()]
    additions = [value for value in APP_REDIRECTS if value not in redirects]
    if additions:
        request("/config/auth", "PATCH", {"uri_allow_list": ",".join(redirects + additions)})
    current = request("/config/auth")
    actual = {value.strip() for value in (current.get("uri_allow_list") or "").split(",")}
    if not set(APP_REDIRECTS).issubset(actual) or not set(redirects).issubset(actual):
        raise RuntimeError("Native callback or existing redirects were not preserved")
    if current.get("site_url") != previous.get("site_url"):
        raise RuntimeError("Unexpected auth site URL change")
    google_keys = {key for key in previous.keys() | current.keys() if key.startswith("external_google_")}
    if any(current.get(key) != previous.get(key) for key in google_keys):
        raise RuntimeError("Unexpected Google provider configuration change")
    print("RouteNote redirects enabled; existing redirects, Google provider and site URL preserved")


if __name__ == "__main__":
    main()
