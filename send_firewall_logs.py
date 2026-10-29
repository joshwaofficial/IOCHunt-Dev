#!/usr/bin/env python3
"""
IOCHunt — Enterprise Firewall Log Simulator (10,000 Logs)

Total logs:             10,000
Clean enterprise logs:   9,500
Injected threat logs:      500
  - C2 IP traffic:         250
  - Malicious DNS:         250

Target: HTTPS ingestion API, tenant google.
"""

import time
import random
import json
import urllib.request
import urllib.error
import ssl
from datetime import datetime, timezone

TARGET_HOST = "10.90.120.231"
TARGET_PORT = 8082
TENANT_ID = "google"

TOTAL_LOGS = 10_000
THREAT_IP_LOGS = 250
THREAT_DNS_LOGS = 250
CLEAN_LOGS = TOTAL_LOGS - THREAT_IP_LOGS - THREAT_DNS_LOGS
BATCH_SIZE = 100

BAD_IPS = [
    "119.189.215.19", "112.250.33.233", "58.65.210.234",
    "123.4.146.128", "27.44.144.193", "61.53.118.64",
    "61.54.174.83", "115.57.232.118", "123.190.7.34",
    "182.112.8.123", "170.238.123.2", "201.110.154.252",
    "105.184.91.132", "103.249.199.3", "105.225.114.70",
    "114.226.118.172", "27.207.230.96", "162.127.70.195",
    "222.208.112.63", "162.116.15.173", "121.226.201.250",
    "23.238.80.171", "38.60.227.210", "47.92.105.234",
    "84.32.149.191", "185.220.101.5", "45.33.32.156",
    "194.26.29.112", "89.248.163.77", "91.240.118.172",
    "162.243.128.50", "198.51.100.44", "103.152.220.3",
    "193.142.146.88", "179.43.175.66"
]

BAD_DOMAINS = [
    "k0v5zt7p.verticalrewards.com",
    "shebei.sellingate.com",
    "eromeofficial.us",
    "loax1ots.eromeofficial.us",
    "brooke60.workers.dev",
    "host5-81-11-10.range5-81.btcentralplus.com",
    "labellavitamarissa.com",
    "acayenne-651-1-31-206.w80-12.abo.wanadoo.fr",
    "joe-shields.com"
]

CLEAN_DEST = [
    ("142.250.190.46", "HTTPS", 443, "United States"),
    ("172.217.16.206", "HTTPS", 443, "United States"),
    ("104.16.132.229", "HTTPS", 443, "United States"),
    ("20.190.159.0", "HTTPS", 443, "United States"),
    ("52.95.120.1", "HTTPS", 443, "United States"),
    ("140.82.121.4", "HTTPS", 443, "United States"),
    ("17.253.144.10", "HTTPS", 443, "United States"),
    ("198.51.100.99", "HTTP", 80, "United Kingdom"),
    ("216.239.35.0", "NTP", 123, "United States"),
    ("10.90.120.1", "DNS", 53, "Internal")
]

CLEAN_DOMAINS = [
    "google.com", "microsoft.com", "github.com",
    "office.com", "cloudflare.com", "apple.com",
    "slack.com", "zoom.us", "aws.amazon.com"
]


def hdr():
    now = datetime.now(timezone.utc)
    return (
        f'<189>date={now:%Y-%m-%d} time={now:%H:%M:%S} '
        f'eventtime={int(time.time())} tz="+0000" '
        'type="traffic" subtype="forward" level="notice" vd="root"'
    )


def generate_logs():
    logs = []

    # 250 C2-IP traffic events
    for i in range(THREAT_IP_LOGS):
        ip = BAD_IPS[i % len(BAD_IPS)]
        src = f"10.90.120.{random.randint(15, 220)}"

        logs.append(
            f'{hdr()} devname="FGT-HQ-EDGE" '
            f'srcip="{src}" srcport={random.randint(32000, 61000)} '
            f'dstip="{ip}" dstport=443 action="accept" proto=6 '
            'service="HTTPS" policyname="LAN-TO-WAN" '
            'srccountry="Internal" sentbyte=5000 rcvdbyte=12000 duration=15'
        )

    # 250 malicious DNS events
    for i in range(THREAT_DNS_LOGS):
        domain = BAD_DOMAINS[i % len(BAD_DOMAINS)]
        src = f"10.90.120.{random.randint(15, 220)}"

        logs.append(
            f'{hdr()} devname="FGT-HQ-EDGE" '
            f'srcip="{src}" srcport={random.randint(40000, 64000)} '
            'dstip="8.8.8.8" dstport=53 action="accept" proto=17 '
            'service="DNS" policyname="LAN-DNS" srccountry="Internal" '
            f'cfgobj="{domain}" sentbyte=72 rcvdbyte=144 duration=1'
        )

    # 9,500 clean enterprise traffic events
    for _ in range(CLEAN_LOGS // 2):
        ip, service, port, country = random.choice(CLEAN_DEST)
        src = f"10.90.120.{random.randint(10, 240)}"
        proto = 17 if service in ("DNS", "NTP") else 6

        logs.append(
            f'{hdr()} devname="FGT-HQ-EDGE" '
            f'srcip="{src}" srcport={random.randint(30000, 64000)} '
            f'dstip="{ip}" dstport={port} action="accept" proto={proto} '
            f'service="{service}" policyname="LAN-TO-WAN" '
            f'srccountry="Internal" dstcountry="{country}" '
            'sentbyte=3000 rcvdbyte=8000 duration=5'
        )

    for _ in range(CLEAN_LOGS - CLEAN_LOGS // 2):
        domain = random.choice(CLEAN_DOMAINS)
        src = f"10.90.120.{random.randint(10, 240)}"

        logs.append(
            f'{hdr()} devname="FGT-HQ-EDGE" '
            f'srcip="{src}" srcport={random.randint(40000, 64000)} '
            'dstip="8.8.8.8" dstport=53 action="accept" proto=17 '
            'service="DNS" policyname="LAN-DNS" srccountry="Internal" '
            f'cfgobj="{domain}" sentbyte=68 rcvdbyte=138 duration=1'
        )

    random.shuffle(logs)
    assert len(logs) == TOTAL_LOGS
    return logs


def send_via_https():
    url = f"https://{TARGET_HOST}:{TARGET_PORT}/api/firewall/ingest"

    print("=" * 68)
    print("IOCHunt Firewall Simulator — 10,000 Logs")
    print(f"Target: https://{TARGET_HOST}:{TARGET_PORT}")
    print(f"Tenant: {TENANT_ID}")
    print(f"Clean events: {CLEAN_LOGS}")
    print(f"Threat events: {THREAT_IP_LOGS + THREAT_DNS_LOGS}")
    print("=" * 68)

    logs = generate_logs()

    # For a self-signed certificate in a trusted test lab only.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    confirmed = 0
    failed_batches = 0
    started = time.time()

    for start in range(0, TOTAL_LOGS, BATCH_SIZE):
        chunk = logs[start:start + BATCH_SIZE]
        payload = json.dumps({"logs": chunk}).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Tenant-ID": TENANT_ID,
                "User-Agent": "IOCHunt-Simulator/3.0"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, context=ctx, timeout=30) as res:
                body = json.loads(res.read().decode("utf-8"))

                # Count only the server's reported ingestion count.
                ingested = body.get("ingested")
                if res.status == 200 and isinstance(ingested, int):
                    confirmed += ingested
                else:
                    failed_batches += 1
                    print(f"\nUnexpected response for batch {start}: {body}")

        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            failed_batches += 1
            print(f"\nBatch {start + 1}-{start + len(chunk)} failed: {exc}")

        completed = min(start + len(chunk), TOTAL_LOGS)
        print(
            f"\rRequests processed: {completed:,}/{TOTAL_LOGS:,} "
            f"| server-confirmed ingested: {confirmed:,}",
            end="",
            flush=True
        )

        # Keep pressure on the ingestion service moderate.
        time.sleep(0.05)

    print("\n" + "=" * 68)
    print(f"Server-confirmed ingested: {confirmed:,}/{TOTAL_LOGS:,}")
    print(f"Failed/unconfirmed batches: {failed_batches}")
    print(f"Elapsed: {time.time() - started:.1f} seconds")
    print(f"Generated clean events: {CLEAN_LOGS:,}")
    print(f"Generated C2-IP events: {THREAT_IP_LOGS:,}")
    print(f"Generated malicious-DNS events: {THREAT_DNS_LOGS:,}")
    print("=" * 68)
    print("Note: HTTP ingestion confirmation does not prove database persistence")
    print("or IOC detection. Verify database counts and threat matches separately.")


if __name__ == "__main__":
    send_via_https()