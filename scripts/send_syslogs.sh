#!/bin/bash
# ==============================================================================
# IOC Hunt - Rapid Firewall Syslog UDP Sender
# Sends real RFC-compliant FortiGate syslog packets to the target UDP receiver.
# ==============================================================================

TARGET_HOST="${1:-10.90.120.231}"
TARGET_PORT="${2:-9500}"
COUNT="${3:-5}"

echo "============================================================"
echo " Sending $COUNT real firewall syslog events to UDP $TARGET_HOST:$TARGET_PORT"
echo "============================================================"

for i in $(seq 1 "$COUNT"); do
  NOW_DATE=$(date -u +"%Y-%m-%d")
  NOW_TIME=$(date -u +"%H:%M:%S")
  EPOCH=$(date +%s)
  SESSION_ID=$((RANDOM * 1000 + RANDOM))

  case $((i % 4)) in
    0)
      # Blocked RDP Attack
      MSG="<189>date=$NOW_DATE time=$NOW_TIME devname=\"FGT-HQ-EDGE\" devid=\"FG200ETK18000001\" eventtime=$EPOCH tz=\"+0000\" logid=\"0000000013\" type=\"traffic\" subtype=\"forward\" level=\"warning\" vd=\"root\" srcip=\"185.220.101.5\" srcport=$((RANDOM % 20000 + 40000)) srcintf=\"wan1\" dstip=\"10.90.122.247\" dstport=3389 dstintf=\"lan1\" sessionid=$SESSION_ID proto=6 action=\"deny\" policyid=12 policyname=\"BLOCK-RDP-EXTERNAL\" service=\"RDP\" duration=0 sentbyte=0 rcvdbyte=0 srccountry=\"Germany\" dstcountry=\"Internal\""
      echo "[$i/$COUNT] 🔴 Denied RDP from 185.220.101.5 -> 10.90.122.247:3389"
      ;;
    1)
      # Blocked SSH Scanner
      MSG="<189>date=$NOW_DATE time=$NOW_TIME devname=\"FGT-HQ-EDGE\" devid=\"FG200ETK18000001\" eventtime=$EPOCH tz=\"+0000\" logid=\"0000000013\" type=\"traffic\" subtype=\"forward\" level=\"warning\" vd=\"root\" srcip=\"45.33.32.156\" srcport=$((RANDOM % 20000 + 40000)) srcintf=\"wan1\" dstip=\"10.90.120.50\" dstport=22 dstintf=\"dmz\" sessionid=$SESSION_ID proto=6 action=\"deny\" policyid=14 policyname=\"DEFAULT-DROP-WAN\" service=\"SSH\" duration=0 sentbyte=0 rcvdbyte=0 srccountry=\"United States\" dstcountry=\"Internal\""
      echo "[$i/$COUNT] 🔴 Denied SSH from 45.33.32.156 -> 10.90.120.50:22"
      ;;
    2)
      # Allowed HTTPS Web traffic
      MSG="<189>date=$NOW_DATE time=$NOW_TIME devname=\"FGT-HQ-EDGE\" devid=\"FG200ETK18000001\" eventtime=$EPOCH tz=\"+0000\" logid=\"0000000020\" type=\"traffic\" subtype=\"forward\" level=\"notice\" vd=\"root\" srcip=\"10.90.120.45\" srcport=$((RANDOM % 20000 + 40000)) srcintf=\"lan1\" dstip=\"142.250.190.46\" dstport=443 dstintf=\"wan1\" sessionid=$SESSION_ID proto=6 action=\"accept\" policyid=1 policyname=\"LAN-TO-WAN\" service=\"HTTPS\" duration=25 sentbyte=4120 rcvdbyte=18490 srccountry=\"Internal\" dstcountry=\"United States\""
      echo "[$i/$COUNT] 🟢 Allowed HTTPS from 10.90.120.45 -> 142.250.190.46:443"
      ;;
    3)
      # Blocked Malicious C2 / Meterpreter
      MSG="<189>date=$NOW_DATE time=$NOW_TIME devname=\"FGT-HQ-EDGE\" devid=\"FG200ETK18000001\" eventtime=$EPOCH tz=\"+0000\" logid=\"0000000013\" type=\"traffic\" subtype=\"forward\" level=\"alert\" vd=\"root\" srcip=\"10.90.120.15\" srcport=$((RANDOM % 20000 + 40000)) srcintf=\"lan1\" dstip=\"103.203.57.18\" dstport=4444 dstintf=\"wan1\" sessionid=$SESSION_ID proto=6 action=\"deny\" policyid=14 policyname=\"DEFAULT-DROP-WAN\" service=\"Meterpreter\" duration=0 sentbyte=0 rcvdbyte=0 srccountry=\"Internal\" dstcountry=\"China\""
      echo "[$i/$COUNT] 🔴 Denied C2/Meterpreter from 10.90.120.15 -> 103.203.57.18:4444"
      ;;
  esac

  echo "$MSG" | nc -u -w1 "$TARGET_HOST" "$TARGET_PORT" 2>/dev/null || true
  sleep 0.2
done

echo "============================================================"
echo "✅ Done! Refresh or check your IOC Hunt Firewall dashboard."
echo "============================================================"
