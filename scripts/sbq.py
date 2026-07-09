#!/usr/bin/env python3
"""Run SQL against a Supabase project via the Management API.
Usage: sbq.py <project_ref> <sql-file | -> [--token TOKEN]
Reads token from SUPABASE_ACCESS_TOKEN env or ../.env by default.
"""
import json
import os
import sys
import urllib.request


def load_token():
    tok = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if tok:
        return tok
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("SUPABASE_ACCESS_TOKEN="):
                return line.strip().split("=", 1)[1]
    raise SystemExit("no access token found")


def main():
    ref = sys.argv[1]
    src = sys.argv[2]
    sql = sys.stdin.read() if src == "-" else open(src).read()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {load_token()}",
            "Content-Type": "application/json",
            "User-Agent": "curl/8.7.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}", file=sys.stderr)
        print(e.read().decode(), file=sys.stderr)
        sys.exit(1)
    try:
        print(json.dumps(json.loads(body), indent=2))
    except json.JSONDecodeError:
        print(body)


if __name__ == "__main__":
    main()
