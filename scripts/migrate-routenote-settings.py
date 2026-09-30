"""Copy RouteNote external secrets in memory, then merge its Auth redirects.

Management API: https://supabase.com/docs/reference/api/v1-bulk-create-secrets
No secret values, response bodies, or provider configuration are logged.
"""

import json
import os
from pathlib import Path
import runpy
import sys
import urllib.error
import urllib.request

SOURCE = "dewusorjwzhsdhrsrvbg"
TARGET = "xrrdokcjhjqdfvwtbenl"
SECRET_NAMES = (
    "NAVER_MAP_CLIENT_ID",
    "NAVER_MAP_CLIENT_SECRET",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
)


class MigrationError(RuntimeError):
    """A controlled error containing only safe status information."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(url, token, payload, label, expect_json=False, method="POST"):
    req = urllib.request.Request(
        url,
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        method=method,
        headers={
            "Authorization": "Bearer " + token.strip(),
            "Content-Type": "application/json",
            "User-Agent": "routenote-settings-migration/1.0",
        },
    )
    try:
        opener = urllib.request.build_opener(NoRedirect)
        with opener.open(req, timeout=60) as response:
            if expect_json:
                try:
                    return json.load(response)
                except (ValueError, UnicodeError):
                    raise MigrationError(label + " returned invalid JSON") from None
            # Never expose a Management API response, including on success.
            response.read()
    except urllib.error.HTTPError as error:
        raise MigrationError(f"{label} failed: HTTP {error.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise MigrationError(label + " failed: network/timeout") from None


def configure_redirects():
    setup = Path(__file__).with_name("setup-android-backend.py")
    runpy.run_path(str(setup), run_name="__main__")


def preflight_google(token):
    configs = {}
    for label, project in (("source", SOURCE), ("target", TARGET)):
        config = request(
            f"https://api.supabase.com/v1/projects/{project}/config/auth",
            token,
            None,
            label + " Google preflight",
            expect_json=True,
            method="GET",
        )
        if not isinstance(config, dict):
            raise MigrationError(label + " Google preflight returned invalid structure")
        configs[label] = config
    enabled = {label: config.get("external_google_enabled") is True for label, config in configs.items()}
    print(json.dumps({"sourceGoogleEnabled": enabled["source"], "targetGoogleEnabled": enabled["target"]}))
    return configs


def configure_google(token, configs):
    previous = configs["target"]
    google_keys = ("external_google_enabled", "external_google_client_id", "external_google_secret")
    copied = previous.get("external_google_enabled") is not True
    if copied:
        source = configs["source"]
        if source.get("external_google_enabled") is not True:
            raise MigrationError("sourceGoogleDisabled")
        if any(not isinstance(source.get(key), str) or not source[key].strip() for key in google_keys[1:]):
            raise MigrationError("sourceGoogleCredentialsMissing")
        request(
            f"https://api.supabase.com/v1/projects/{TARGET}/config/auth",
            token,
            {key: source[key] for key in google_keys},
            "Target Google setup",
            method="PATCH",
        )
    current = request(
        f"https://api.supabase.com/v1/projects/{TARGET}/config/auth",
        token,
        None,
        "Target Google verification",
        expect_json=True,
        method="GET",
    )
    if not isinstance(current, dict) or current.get("external_google_enabled") is not True:
        raise MigrationError("targetGoogleVerificationFailed")
    expected_google = configs["source"] if copied else previous
    if any(current.get(key) != expected_google.get(key) for key in google_keys):
        raise MigrationError("targetGoogleVerificationFailed")
    # Compare every other Auth setting, including site URL and redirect allowlist.
    preserved_keys = (previous.keys() | current.keys()) - set(google_keys)
    if any(current.get(key) != previous.get(key) for key in preserved_keys):
        raise MigrationError("targetOtherAuthSettingsChanged")
    print(json.dumps({"targetGoogleCopied": copied}))


def main():
    tokens = {}
    for name in ("SUPABASE_ACCESS_TOKEN", "ROUTENOTE_MIGRATION_TOKEN"):
        value = (os.environ.get(name) or "").strip()
        if not value:
            raise MigrationError("Missing required environment variable: " + name)
        tokens[name] = value
        # The redirect helper reads the same environment; pass normalized tokens.
        os.environ[name] = value

    configs = preflight_google(tokens["SUPABASE_ACCESS_TOKEN"])
    configure_google(tokens["SUPABASE_ACCESS_TOKEN"], configs)

    source = request(
        f"https://{SOURCE}.supabase.co/functions/v1/routenote-migration-secrets",
        tokens["ROUTENOTE_MIGRATION_TOKEN"],
        {},
        "Source secret export",
        expect_json=True,
    )
    secrets = source.get("secrets") if isinstance(source, dict) else None
    if not isinstance(secrets, dict):
        raise MigrationError("Source secret export returned invalid structure")
    payload = []
    for name in SECRET_NAMES:
        value = secrets.get(name)
        if not isinstance(value, str) or not value.strip():
            raise MigrationError("Missing source secret: " + name)
        payload.append({"name": "ROUTENOTE_" + name, "value": value})

    # Bulk-create only these four names; never delete or replace other secrets.
    request(
        f"https://api.supabase.com/v1/projects/{TARGET}/secrets",
        tokens["SUPABASE_ACCESS_TOKEN"],
        payload,
        "Target secret import",
    )
    print("Copied secret names: " + ", ".join(item["name"] for item in payload))
    configure_redirects()
    print("RouteNote server settings migration completed")


if __name__ == "__main__":
    try:
        main()
    except MigrationError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Redirect setup or other unexpected failures must not leak response data.
        print("RouteNote settings migration failed: internal/setup error", file=sys.stderr)
        sys.exit(1)
