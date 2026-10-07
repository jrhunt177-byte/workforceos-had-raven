#!/usr/bin/env python3
"""Offline tracked-file checks. Findings are leads, not a full security audit."""
import json
import re
import subprocess
import sys
from pathlib import PurePosixPath

PATTERNS = {
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'),
    'github-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{50,255})\b'),
    'stripe-live-key': re.compile(rb'\b[rs]k_live_[A-Za-z0-9]{20,255}\b'),
    'aws-access-id': re.compile(rb'\bAKIA[0-9A-Z]{16}\b'),
    'openai-project-key': re.compile(rb'\bsk-proj-[A-Za-z0-9_-]{40,255}\b'),
}

def inspect(path, data):
    p = PurePosixPath(path)
    findings = []
    name = p.name.lower()
    template = name.endswith(('.example', '.template', '.sample'))
    if ((name == '.env' or name.startswith('.env.')) and not template) or name in {'id_rsa','id_ed25519','credentials.json','service-account.json'}:
        findings.append({'path':path,'rule':'credential-file','line':None})
    if b'\0' not in data:
        for rule, pattern in PATTERNS.items():
            for match in pattern.finditer(data):
                findings.append({'path':path,'rule':rule,'line':data.count(b'\n',0,match.start())+1})
    return findings

def main():
    paths = subprocess.check_output(['git','ls-files','-z']).split(b'\0')
    findings = []
    scanned = 0
    for raw in filter(None, paths):
        path = raw.decode('utf-8', errors='surrogateescape')
        # Read the index blob; never dereference working-tree symlinks into host files.
        data = subprocess.check_output(['git','show',':'+path])
        findings.extend(inspect(path,data))
        scanned += 1
    print(json.dumps({'check':'tracked-file-security-baseline','files_scanned':scanned,'findings':findings,'coverage':'Tracked credential filenames and selected credential signatures only; not authorization, dependency, history, runtime or penetration testing.'},indent=2))
    return 1 if findings else 0

if __name__ == '__main__':
    sys.exit(main())
