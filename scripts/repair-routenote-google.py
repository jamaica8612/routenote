"""Restore the original Google secret without logging it or modifying other Auth settings."""
import json
import os
import runpy
from pathlib import Path
import sys

helper = runpy.run_path(str(Path(__file__).with_name('migrate-routenote-settings.py')))
request = helper['request']
MigrationError = helper['MigrationError']
TARGET = 'xrrdokcjhjqdfvwtbenl'
CLIENT = '223309584721-mhs7uc6k6aac9bsu76qmk2o7m13gj55j.apps.googleusercontent.com'

def main():
    token = (os.environ.get('SUPABASE_ACCESS_TOKEN') or '').strip()
    secret = (os.environ.get('ROUTENOTE_GOOGLE_CLIENT_SECRET') or '').strip()
    if not token or not secret.startswith('GOCSPX-') or len(secret) < 25:
        raise MigrationError('missingOriginalGoogleCredential')
    url = f'https://api.supabase.com/v1/projects/{TARGET}/config/auth'
    before = request(url, token, None, 'Google preflight', expect_json=True, method='GET')
    if before.get('external_google_enabled') is not True or before.get('external_google_client_id') != CLIENT:
        raise MigrationError('googleClientGuardFailed')
    request(url, token, {'external_google_secret': secret}, 'Google credential restore', method='PATCH')
    after = request(url, token, None, 'Google verification', expect_json=True, method='GET')
    keys = (before.keys() | after.keys()) - {'external_google_secret'}
    if any(before.get(key) != after.get(key) for key in keys):
        raise MigrationError('otherAuthSettingsChanged')
    print(json.dumps({'targetId': TARGET, 'googleSecretRestored': True, 'otherAuthSettingsPreserved': True}))

if __name__ == '__main__':
    try:
        main()
    except MigrationError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('googleRepairInternalError', file=sys.stderr)
        sys.exit(1)
