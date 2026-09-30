"""Delete only the explicitly verified old EventBot project after fresh checks.

API: https://supabase.com/docs/reference/api/v1-delete-a-project
This script never prints API bodies, user data, configuration, or credentials.
"""

import json
import os
import sys
import urllib.error
import urllib.request

SOURCE = "dewusorjwzhsdhrsrvbg"
TARGET = "xrrdokcjhjqdfvwtbenl"
SOURCE_ORG = "hrcopmelbfvtzcmrwjqd"
SOURCE_NAME = "jamaica8612's Project"
TABLES = (
    "routenote_announcement_comments", "routenote_announcements",
    "routenote_location_share_requests", "routenote_market_buildings",
    "routenote_market_route_map_cell_history", "routenote_market_route_map_cells",
    "routenote_market_route_map_settings", "routenote_market_stall_history",
    "routenote_market_stalls", "routenote_notifications", "routenote_profiles",
    "routenote_push_subscriptions", "routenote_route_path_points",
    "routenote_route_paths", "routenote_route_tip_history", "routenote_route_tip_photos",
    "routenote_route_tips", "routenote_route_zone_photos", "routenote_route_zones",
    "routenote_tip_comments", "routenote_tip_likes",
)


class DeletionError(RuntimeError):
    """Only controlled non-sensitive error codes may leave this script."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def guard_project_ids():
    if SOURCE != "dewusorjwzhsdhrsrvbg" or TARGET != "xrrdokcjhjqdfvwtbenl" or SOURCE == TARGET:
        raise DeletionError("projectIdGuardFailed")


def request(project, token, method="GET", path="", payload=None, expect_json=True):
    guard_project_ids()
    if project not in (SOURCE, TARGET) or (method == "DELETE" and (project != SOURCE or path or payload is not None)):
        raise DeletionError("requestTargetGuardFailed")
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/" + project + path,
        data=None if payload is None else json.dumps(payload).encode("utf-8"),
        method=method,
        headers={
            "Authorization": "Bearer " + token.strip(),
            "Content-Type": "application/json",
            "User-Agent": "eventbot-verified-retirement/1.0",
        },
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as response:
            if expect_json:
                try:
                    return json.load(response)
                except (ValueError, UnicodeError):
                    raise DeletionError("invalidApiJson") from None
            response.read()
    except urllib.error.HTTPError as error:
        raise DeletionError(f"apiHttp{error.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise DeletionError("apiNetworkFailure") from None


def verify_source(project):
    if not isinstance(project, dict) or project.get("id") != SOURCE:
        raise DeletionError("sourceIdMismatch")
    if project.get("organization_id") != SOURCE_ORG:
        raise DeletionError("sourceOrgMismatch")
    if project.get("name") != SOURCE_NAME:
        raise DeletionError("sourceNameMismatch")
    if project.get("status") != "ACTIVE_HEALTHY":
        raise DeletionError("sourceNotHealthy")


def verification_sql():
    counts = " UNION ALL ".join(f"SELECT '{name}'::text AS name, count(*)::bigint AS rows FROM public.{name}" for name in TABLES)
    # Aggregates only: no rows, object names, identifiers, emails, or photo URLs.
    return f"""WITH row_counts AS ({counts})
SELECT
 (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND starts_with(table_name, 'routenote_')) AS table_count,
 (SELECT sum(rows)::bigint FROM row_counts) AS total_rows,
 (SELECT rows FROM row_counts WHERE name = 'routenote_profiles') AS profiles,
 (SELECT rows FROM row_counts WHERE name = 'routenote_route_zones') AS zones,
 (SELECT rows FROM row_counts WHERE name = 'routenote_route_tips') AS tips,
 (SELECT rows FROM row_counts WHERE name = 'routenote_route_tip_history') AS history,
 (SELECT count(*) FROM storage.objects WHERE bucket_id = 'routenote-photos') AS photos,
 (SELECT count(*) FROM public.quickflex_note_zones) AS flexnote_zones,
 (SELECT count(*) FROM public.quickflex_note_tips) AS flexnote_tips,
 (SELECT count(*) FROM public.quickflex_note_photos) AS flexnote_tip_photos,
 (SELECT count(*) FROM public.quickflex_note_zone_photos) AS flexnote_zone_photos;"""


def verify_counts(result):
    expected = {"table_count": 21, "total_rows": 3510, "profiles": 8, "zones": 49,
                "tips": 149, "history": 207, "photos": 83,
                "flexnote_zones": 31, "flexnote_tips": 140,
                "flexnote_tip_photos": 2, "flexnote_zone_photos": 68}
    if not isinstance(result, list) or len(result) != 1 or not isinstance(result[0], dict):
        raise DeletionError("migrationCountResponseInvalid")
    if any(result[0].get(key) != value for key, value in expected.items()):
        raise DeletionError("migrationCountMismatch")


def main():
    guard_project_ids()
    if (os.environ.get("EVENTBOT_MIGRATION_VERIFIED") or "").strip() != SOURCE:
        raise DeletionError("backupDeploymentGateMissing")
    token = (os.environ.get("SUPABASE_ACCESS_TOKEN") or "").strip()
    if not token:
        raise DeletionError("accessTokenMissing")
    verify_source(request(SOURCE, token))
    target = request(TARGET, token)
    if not isinstance(target, dict) or target.get("id") != TARGET or target.get("status") != "ACTIVE_HEALTHY":
        raise DeletionError("targetNotHealthy")
    verify_counts(request(TARGET, token, "POST", "/database/query", {"query": verification_sql()}))
    # Recheck source identity immediately before the sole destructive request.
    verify_source(request(SOURCE, token))
    request(SOURCE, token, "DELETE", expect_json=False)
    print(json.dumps({"sourceId": SOURCE, "success": True}))


if __name__ == "__main__":
    try:
        main()
    except DeletionError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("deletionInternalError", file=sys.stderr)
        sys.exit(1)
