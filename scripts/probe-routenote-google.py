"""Read-only Auth config diagnostics; never print credentials or API bodies.

Format checks do not verify credentials with Google and cannot prove validity.
"""

import json
import hashlib
import os
import re
import sys
import urllib.error
import urllib.request

PROJECTS = {"source": "dewusorjwzhsdhrsrvbg", "target": "xrrdokcjhjqdfvwtbenl"}


class ProbeError(RuntimeError):
    """A safe status code without response content."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_auth_config(project, token):
    if project not in PROJECTS.values():
        raise ProbeError("projectGuardFailed")
    request = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{project}/config/auth",
        method="GET",
        headers={"Authorization": "Bearer " + token.strip(), "User-Agent": "routenote-google-readonly-probe/1.0"},
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
            try:
                config = json.load(response)
            except (ValueError, UnicodeError):
                raise ProbeError("invalidJson") from None
            if not isinstance(config, dict):
                raise ProbeError("invalidStructure")
            return config
    except urllib.error.HTTPError as error:
        raise ProbeError(f"http{error.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError("networkFailure") from None


def secret_stats(config):
    secret = config.get("external_google_secret")
    if not isinstance(secret, str):
        return {"secretLength": None, "secretPrefixGOCSPX": None, "secretHasMaskMarkers": None}
    lower = secret.lower()
    markers = ("**", "••", "●●", "redacted", "masked", "<hidden>", "[hidden]")
    return {
        "secretLength": len(secret),
        "secretPrefixGOCSPX": secret.startswith("GOCSPX-"),
        "secretHasMaskMarkers": any(marker in lower for marker in markers),
    }


def summarize(configs, statuses):
    result = {"credentialValidityVerified": False}
    for label in PROJECTS:
        config = configs.get(label)
        result[label] = {"status": statuses[label]}
        if config is not None:
            result[label].update({"enabled": config.get("external_google_enabled") is True, **secret_stats(config)})
    both = all(label in configs for label in PROJECTS)
    client_ids = [configs[label].get("external_google_client_id") for label in PROJECTS] if both else []
    secrets = [configs[label].get("external_google_secret") for label in PROJECTS] if both else []
    result["clientIdEqual"] = client_ids[0] == client_ids[1] if both and all(isinstance(value, str) for value in client_ids) else None
    result["secretEqual"] = secrets[0] == secrets[1] if both and all(isinstance(value, str) for value in secrets) else None
    for label in PROJECTS:
        secret = configs.get(label, {}).get("external_google_secret")
        result[label + "SecretIsHex64"] = bool(re.fullmatch(r"[0-9a-fA-F]{64}", secret)) if isinstance(secret, str) else None
    comparable = both and all(isinstance(value, str) for value in secrets)
    result["targetSecretIsSha256OfSourceReturnedValue"] = (
        secrets[1].lower() == hashlib.sha256(secrets[0].encode("utf-8")).hexdigest()
        if comparable else None
    )
    return result


def main():
    token = (os.environ.get("SUPABASE_ACCESS_TOKEN") or "").strip()
    if not token:
        raise ProbeError("accessTokenMissing")
    configs, statuses = {}, {}
    for label, project in PROJECTS.items():
        try:
            configs[label] = get_auth_config(project, token)
            statuses[label] = "ok"
        except ProbeError as error:
            statuses[label] = str(error)
    print(json.dumps(summarize(configs, statuses)))


if __name__ == "__main__":
    try:
        main()
    except ProbeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("probeInternalError", file=sys.stderr)
        sys.exit(1)
