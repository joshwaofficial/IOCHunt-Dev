#!/usr/bin/env python3
"""
IOCHunt - Real Firewall Syslog Test Generator
Sends realistic RFC-compliant FortiGate & Palo Alto firewall syslog events over UDP.
Usage:
    python3 scripts/send_syslogs.py [--host 10.90.120.231] [--port 9500] [--count 20] [--stream]
"""

import sys
import time
import socket
import argparse
import random
from datetime import datetime, timezone

REALISTIC_FIREWALL_SCENARIOS = [
    {
        "name": "External RDP Brute Force Attempt (Blocked)",
        "devname": "FGT-HQ-EDGE-01",
        "action": "deny",
        "proto": "6",
        "service": "RDP",
        "srcip": "185.220.101.5",
        "srcport": lambda: random.randint(40000, 65000),
        "dstip": "10.90.122.247",
        "dstport": 3389,
        "policyname": "WAN-DROP-RDP",
        "srccountry": "Germany",
        "dstcountry": "Internal",
        "sentbyte": 0,
        "rcvdbyte": 0,
        "duration": 0
    },
    {
        "name": "Inbound SSH Reconnaissance Scanner (Blocked)",
        "devname": "FGT-HQ-EDGE-01",
        "action": "deny",
        "proto": "6",
        "service": "SSH",
        "srcip": "45.33.32.156",
        "srcport": lambda: random.randint(35000, 60000),
        "dstip": "10.90.120.50",
        "dstport": 22,
        "policyname": "DEFAULT-DROP-WAN",
        "srccountry": "United States",
        "dstcountry": "Internal",
        "sentbyte": 0,
        "rcvdbyte": 0,
        "duration": 0
    },
    {
        "name": "SMB Lateral Movement / WannaCry Exploit Probe (Blocked)",
        "devname": "FGT-BRANCH-FW",
        "action": "deny",
        "proto": "6",
        "service": "SMB",
        "srcip": "194.26.29.112",
        "srcport": lambda: random.randint(40000, 62000),
        "dstip": "10.90.120.100",
        "dstport": 445,
        "policyname": "ISOLATE-SMB-ZONE",
        "srccountry": "Russia",
        "dstcountry": "Internal",
        "sentbyte": 0,
        "rcvdbyte": 0,
        "duration": 0
    },
    {
        "name": "Meterpreter / Cobalt Strike C2 Outbound Beacon Blocked",
        "devname": "FGT-HQ-EDGE-01",
        "action": "deny",
        "proto": "6",
        "service": "Meterpreter",
        "srcip": "10.90.120.15",
        "srcport": lambda: random.randint(49152, 65535),
        "dstip": "103.203.57.18",
        "dstport": 4444,
        "policyname": "THREAT-BLOCK-MALICIOUS-C2",
        "srccountry": "Internal",
        "dstcountry": "China",
        "sentbyte": 128,
        "rcvdbyte": 0,
        "duration": 0
    },
    {
        "name": "MSSQL Database Unauthorized External Access (Blocked)",
        "devname": "FGT-BRANCH-FW",
        "action": "deny",
        "proto": "6",
        "service": "MSSQL",
        "srcip": "198.51.100.44",
        "srcport": lambda: random.randint(30000, 50000),
        "dstip": "10.90.120.20",
        "dstport": 1433,
        "policyname": "DATABASE-SHIELD",
        "srccountry": "Netherlands",
        "dstcountry": "Internal",
        "sentbyte": 0,
        "rcvdbyte": 0,
        "duration": 0
    },
    {
        "name": "Production Web App HTTPS Inbound (Allowed)",
        "devname": "FGT-HQ-EDGE-01",
        "action": "accept",
        "proto": "6",
        "service": "HTTPS",
        "srcip": "203.0.113.88",
        "srcport": lambda: random.randint(20000, 60000),
        "dstip": "10.90.120.231",
        "dstport": 443,
        "policyname": "DMZ-WEB-INBOUND",
        "srccountry": "India",
        "dstcountry": "Internal",
        "sentbyte": 8450,
        "rcvdbyte": 45120,
        "duration": lambda: random.randint(12, 120)
    },
    {
        "name": "Workstation Outbound Cloud SaaS Traffic (Allowed)",
        "devname": "FGT-HQ-EDGE-01",
        "action": "accept",
        "proto": "6",
        "service": "HTTPS",
        "srcip": "10.90.120.77",
        "srcport": lambda: random.randint(50000, 65000),
        "dstip": "142.250.190.46",
        "dstport": 443,
        "policyname": "LAN-TO-WAN-ACCESS",
        "srccountry": "Internal",
        "dstcountry": "United States",
        "sentbyte": 14200,
        "rcvdbyte": 89200,
        "duration": lambda: random.randint(5, 45)
    },
    {
        "name": "Internal DNS Resolution Request (Allowed)",
        "devname": "FGT-HQ-EDGE-01",
        "action": "accept",
        "proto": "17",
        "service": "DNS",
        "srcip": "10.90.120.42",
        "srcport": lambda: random.randint(51000, 62000),
        "dstip": "8.8.8.8",
        "dstport": 53,
        "policyname": "LAN-DNS-ALLOW",
        "srccountry": "Internal",
        "dstcountry": "United States",
        "sentbyte": 84,
        "rcvdbyte": 168,
        "duration": 1
    }
]

def generate_fortigate_syslog(scenario):
    now = datetime.now(timezone.utc)
    date_str = now.strftime('%Y-%m-%d')
    time_str = now.strftime('%H:%M:%S')
    epoch = int(now.timestamp())
    
    src_port = scenario["srcport"]() if callable(scenario["srcport"]) else scenario["srcport"]
    duration = scenario["duration"]() if callable(scenario["duration"]) else scenario["duration"]
    session_id = random.randint(10000000, 99999999)
    log_id = f"{random.randint(10, 99):010d}"

    # RFC 5424 / FortiGate Traffic Syslog String
    raw_msg = (
        f'<189>date={date_str} time={time_str} devname="{scenario["devname"]}" '
        f'devid="FG200ETK18000001" eventtime={epoch} tz="+0000" logid="{log_id}" '
        f'type="traffic" subtype="forward" level="warning" vd="root" '
        f'srcip="{scenario["srcip"]}" srcport={src_port} srcintf="port1" '
        f'dstip="{scenario["dstip"]}" dstport={scenario["dstport"]} dstintf="port2" '
        f'sessionid={session_id} proto={scenario["proto"]} action="{scenario["action"]}" '
        f'policyid={random.randint(1, 20)} policyname="{scenario["policyname"]}" '
        f'service="{scenario["service"]}" duration={duration} '
        f'sentbyte={scenario["sentbyte"]} rcvdbyte={scenario["rcvdbyte"]} '
        f'srccountry="{scenario["srccountry"]}" dstcountry="{scenario["dstcountry"]}"'
    )
    return raw_msg

def main():
    parser = argparse.ArgumentParser(description="Send real test firewall syslogs over UDP")
    parser.add_argument("--host", default="10.90.120.231", help="Target Syslog Server IP / Host (default: 10.90.120.231)")
    parser.add_argument("--port", type=int, default=9500, help="Target UDP Syslog Port (default: 9500)")
    parser.add_argument("--count", type=int, default=15, help="Number of test logs to send (default: 15)")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between logs in seconds (default: 0.2s)")
    parser.add_argument("--stream", action="store_true", help="Stream logs continuously until Ctrl+C")
    args = parser.parse_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    print("=" * 70)
    print(f"🚀 IOC Hunt — Real Syslog UDP Generator")
    print(f"🎯 Target Server: {args.host}")
    print(f"🔌 Target Port:   UDP {args.port}")
    print(f"📦 Mode:          {'Continuous Live Stream (Ctrl+C to stop)' if args.stream else f'Batch of {args.count} Events'}")
    print("=" * 70)

    sent_count = 0
    try:
        while True:
            scenario = random.choice(REALISTIC_FIREWALL_SCENARIOS)
            msg = generate_fortigate_syslog(scenario)
            sock.sendto(msg.encode("utf-8"), (args.host, args.port))
            sent_count += 1
            
            status_icon = "🔴 DENIED" if scenario["action"] == "deny" else "🟢 ALLOWED"
            print(f"[{sent_count:03d}] {status_icon} | {scenario['name'][:36]:<36} | {scenario['srcip']:<15} -> {scenario['dstip']}:{scenario['dstport']} ({scenario['service']})")

            if not args.stream and sent_count >= args.count:
                break

            time.sleep(args.delay)

    except KeyboardInterrupt:
        print("\n⏹ Stream stopped by user.")
    finally:
        sock.close()

    print("=" * 70)
    print(f"✅ Successfully transmitted {sent_count} syslog packet(s) to UDP {args.host}:{args.port}!")
    print(f"👉 Check your IOC Hunt dashboard at: https://{args.host}:8082/firewall")
    print("=" * 70)

if __name__ == "__main__":
    main()
