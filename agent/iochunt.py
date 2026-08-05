#!/usr/bin/env python3
"""
IOC Hunt — Linux/Ubuntu Security Agent v2 (Enhanced)
"""

import os, sys, re, time, json, hashlib, socket, threading, subprocess
import logging, signal, struct, fcntl, glob, stat, ipaddress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict, deque
from typing import Optional, Dict, List, Tuple

# ── Optional deps ─────────────────────────────────────────────────────────────
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False
    print("[WARN] psutil not installed. pip install psutil")

try:
    import requests
    HAS_REQUESTS = True
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    HAS_REQUESTS = False
    print("[WARN] requests not installed. pip install requests")

try:
    import pyinotify
    HAS_INOTIFY = True
except ImportError:
    HAS_INOTIFY = False

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════════
CONFIG_FILE    = "/etc/iochunt/config.json"
LOG_FILE       = "/var/log/iochunt/iochunt.log"
WHITELIST_FILE = "/etc/iochunt/whitelist.json"
BLOCKLIST_FILE = "/etc/iochunt/blocklist.json"

DEFAULT_CONFIG = {
    "central_server_url":     "",
    "central_server_key":     "",
    "central_server_label":   "",
    "central_server_enabled": False,
    "office_hours_start":     9,
    "office_hours_end":       18,
    "office_hours_days":      62,
    "failed_logon_threshold":   5,
    "failed_logon_window_mins": 10,
    "learning_mode":            True,
    "cat_modes": [3,3,3,3,3,3,3,3,2,2,2,2,2],
    "monitor_processes":    True,
    "monitor_network":      True,
    "monitor_auth":         True,
    "monitor_persistence":  True,
    "monitor_sensitive":    True,
    "monitor_rootkit":      True,
    "monitor_suid":         True,
    "monitor_usb":          True,
    "monitor_commands":     True,
    "monitor_webcam":       True,
    "monitor_ports":        True,
    "monitor_clamav":       True,
    # New toggles
    "monitor_dns":          True,
    "monitor_containers":   True,
    "monitor_fileless":     True,
    "monitor_privesc":      True,
    "monitor_correlation":  True,
    "monitor_integrity":    True,
    "clamav_log_monitor":       True,
    "clamav_on_access_scan":    False,
    "clamav_on_access_paths":   ["/home", "/tmp", "/var/tmp"],
    "clamav_scan_usb":          True,
    "clamav_quarantine":        True,
    "clamav_quarantine_dir":    "/var/lib/iochunt/quarantine",
    "email_to":       "",
    "smtp_host":      "",
    "smtp_port":      587,
    "smtp_from":      "",
    "smtp_password":  "",
    "smtp_ssl":       True,
    "setup_complete": False,
}

CAT_PROCESSES   = 0
CAT_REGISTRY    = 1
CAT_STARTUP     = 2
CAT_SERVICES    = 3
CAT_TASKS       = 4
CAT_NETWORK     = 5
CAT_CONFIG      = 6
CAT_SENSITIVE   = 7
CAT_ENUM        = 8
CAT_FAILEDLOGON = 9
CAT_OFFICEHOURS = 10
CAT_USB         = 11
CAT_WEBCAM      = 12

CAT_NAMES = [
    "Process Monitoring", "Cron/Systemd Persistence", "Startup Files",
    "System Services", "Scheduled Tasks (cron)", "Network / Shares",
    "Config Changes", "Sensitive File Access", "Enumeration Commands",
    "Failed Login Attempts", "Non-Office Hours Access",
    "USB / Removable Media", "Webcam / Microphone"
]

# ═══════════════════════════════════════════════════════════════════════════════
# GLOBAL STATE
# ═══════════════════════════════════════════════════════════════════════════════
config                = dict(DEFAULT_CONFIG)
cat_modes             = list(DEFAULT_CONFIG["cat_modes"])
whitelist             = set()
blocklist             = set()
_alert_count          = 0
_block_count          = 0
_log_lock             = threading.Lock()
_failed_logon_tracker = defaultdict(list)
_failed_logon_lock    = threading.Lock()
_after_hours_dedup    = {}
_after_hours_lock     = threading.Lock()

# ── Temporal correlation buffer ───────────────────────────────────────────────
# Stores recent events for correlation analysis
_correlation_buffer: deque = deque(maxlen=500)
_correlation_lock           = threading.Lock()

# ── Process lineage cache ─────────────────────────────────────────────────────
# pid → {name, exe, ppid, start_time}
_process_tree:  Dict[int, dict] = {}
_proc_tree_lock = threading.Lock()

os.makedirs("/var/log/iochunt", exist_ok=True)
os.makedirs("/var/lib/iochunt", exist_ok=True)
os.makedirs("/etc/iochunt",     exist_ok=True)

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(message)s"
)

# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

def log(msg: str):
    global _alert_count, _block_count
    entry = f"[{ts()}] {msg}"
    with _log_lock:
        logging.info(entry)
        print(entry)

    alert_tags = (
        "[DETECTED]","[BEHAVIORAL-IOC]","[ENUM]","[SENSITIVE]",
        "[CONFIG-CHANGE]","[FAILED-LOGON]","[AFTER-HOURS]",
        "[CLAMAV][DETECTED]","[PRIVESC]","[FILELESS]",
        "[CONTAINER-ESCAPE]","[LATERAL]","[CORRELATION]",
        "[CREDENTIAL-ACCESS]","[DEFENSE-EVASION]"
    )
    block_tags = (
        "[BLOCKED]","[NET-BLOCKED]","[AUTO-BLOCKED]",
        "[CONN-KILLED]","[QUARANTINED]"
    )
    if any(t in msg for t in alert_tags):
        _alert_count += 1
        # Feed into correlation engine
        _add_correlation_event(msg)
    if any(t in msg for t in block_tags):
        _block_count += 1

def should_log(cat: int) -> bool:
    return cat < len(cat_modes) and cat_modes[cat] != 0

def should_notify(cat: int) -> bool:
    return cat < len(cat_modes) and cat_modes[cat] >= 2

def should_act(cat: int) -> bool:
    return cat < len(cat_modes) and cat_modes[cat] >= 3

def is_office_hours() -> bool:
    now     = datetime.now(timezone.utc)
    win_day = (now.weekday() + 1) % 7
    oh_days = config.get("office_hours_days", 62)
    oh_start = config.get("office_hours_start", 9)
    oh_end   = config.get("office_hours_end", 18)
    return bool(oh_days & (1 << win_day)) and oh_start <= now.hour < oh_end

def sha256_file(path: str) -> str:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""

def is_signed(path: str) -> bool:
    if not path or not os.path.isfile(path):
        return False
    for cmd in [["dpkg", "-S", path], ["rpm", "-qf", path]]:
        try:
            result = subprocess.run(
                cmd, capture_output=True, timeout=5)
            if result.returncode == 0 and result.stdout.strip():
                return True
        except Exception:
            pass
    return False

def is_private_ip(ip: str) -> bool:
    if not ip:
        return False
    try:
        return ipaddress.ip_address(ip).is_private
    except Exception:
        return False

def run_cmd(cmd: list, timeout: int = 8) -> str:
    try:
        return subprocess.check_output(
            cmd, stderr=subprocess.DEVNULL, timeout=timeout
        ).decode(errors="replace")
    except Exception:
        return ""

def run_cmd_safe(cmd: list, timeout: int = 8) -> str:
    return run_cmd(cmd, timeout)

def _tail_file(path: str):
    """Generator yielding new lines appended to a file."""
    try:
        with open(path, "r", errors="replace") as f:
            f.seek(0, 2)
            while True:
                line = f.readline()
                if line:
                    yield line
                else:
                    time.sleep(0.5)
    except Exception as ex:
        log(f"[TAIL-ERR] {path}: {ex}")

def _read_file_safe(path: str) -> str:
    """Read a file silently, return empty string on any error."""
    try:
        return open(path, errors="replace").read().strip()
    except Exception:
        return ""

def _proc_attr(pid: int, attr: str) -> str:
    """Read a /proc/pid/* attribute safely."""
    return _read_file_safe(f"/proc/{pid}/{attr}")

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG LOAD / SAVE
# ═══════════════════════════════════════════════════════════════════════════════

def load_config():
    global config, cat_modes
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE) as f:
                loaded = json.load(f)
            config.update(loaded)
            if "cat_modes" in loaded:
                cat_modes = loaded["cat_modes"]
    except Exception as ex:
        print(f"[CONFIG-LOAD-ERR] {ex}")

def save_config():
    config["cat_modes"] = cat_modes
    try:
        os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
    except Exception as ex:
        print(f"[CONFIG-SAVE-ERR] {ex}")

def load_whitelist():
    global whitelist
    try:
        if os.path.exists(WHITELIST_FILE):
            with open(WHITELIST_FILE) as f:
                whitelist = set(json.load(f))
            log(f"[WHITELIST] Loaded {len(whitelist)} entries.")
    except Exception as ex:
        log(f"[WHITELIST-LOAD-ERR] {ex}")

def load_blocklist():
    global blocklist
    try:
        if os.path.exists(BLOCKLIST_FILE):
            with open(BLOCKLIST_FILE) as f:
                blocklist = set(json.load(f))
            log(f"[BLOCKLIST] Loaded {len(blocklist)} entries.")
    except Exception as ex:
        log(f"[BLOCKLIST-LOAD-ERR] {ex}")

# ═══════════════════════════════════════════════════════════════════════════════
# CENTRAL SERVER SHIPPING
# ═══════════════════════════════════════════════════════════════════════════════

_ship_queue      = []
_ship_queue_lock = threading.Lock()

def ship_event(tag: str, severity: str, category: str, message: str):
    if not config.get("central_server_enabled"):
        return
    event = {
        "ts":       ts(),
        "tag":      tag,
        "severity": severity,
        "category": category,
        "message":  message[:2000],
    }
    with _ship_queue_lock:
        _ship_queue.append(event)

def _flush_ship_queue():
    if not HAS_REQUESTS:
        return
    url = config.get("central_server_url", "").rstrip("/")
    key = config.get("central_server_key", "")
    if not url or not key:
        return
    with _ship_queue_lock:
        if not _ship_queue:
            return
        batch = list(_ship_queue)
        _ship_queue.clear()
    machine = socket.gethostname()
    label   = config.get("central_server_label") or machine
    payload = {"machine": machine, "label": label, "events": batch}
    try:
        resp = requests.post(
            f"{url}/api/logs",
            json=payload,
            headers={"x-api-key": key},
            timeout=15,
            verify=False,
        )
        if not resp.ok:
            log(f"[CENTRAL-ERR] HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as ex:
        log(f"[CENTRAL-SHIP-ERR] {ex}")
        with _ship_queue_lock:
            _ship_queue[:0] = batch

def start_central_shipper():
    def _loop():
        while True:
            time.sleep(60)
            try:
                _flush_ship_queue()
            except Exception as ex:
                log(f"[CENTRAL-LOOP-ERR] {ex}")
    threading.Thread(target=_loop, daemon=True, name="CentralShipper").start()

def start_policy_poller():
    def _poll():
        while True:
            try:
                if not config.get("central_server_enabled"):
                    time.sleep(15)
                    continue
                url = config.get("central_server_url", "").rstrip("/")
                key = config.get("central_server_key", "")
                if not url or not key:
                    time.sleep(15)
                    continue
                machine = socket.gethostname()

                # 1. Fetch latest policy from Central / Aggregator
                resp = requests.get(
                    f"{url}/api/policy/{machine}",
                    headers={"x-api-key": key},
                    timeout=10, verify=False,
                )
                if resp.ok:
                    data = resp.json()
                    pol  = data.get("policy") or data.get("effective_policy") or {}
                    if pol:
                        changed = False
                        if "catModes" in pol:
                            for i, v in enumerate(pol["catModes"]):
                                if i < len(cat_modes) and cat_modes[i] != int(v):
                                    cat_modes[i] = int(v)
                                    changed = True
                        for k, attr in [
                            ("officeHoursStart",     "office_hours_start"),
                            ("officeHoursEnd",       "office_hours_end"),
                            ("officeHoursDays",      "office_hours_days"),
                            ("failedLogonThreshold", "failed_logon_threshold"),
                            ("failedLogonWindowMins","failed_logon_window_mins"),
                        ]:
                            if k in pol:
                                config[attr] = pol[k]
                        if "learningMode" in pol:
                            config["learning_mode"] = bool(pol["learningMode"])
                        
                        log("[POLICY] Applied machine-specific policy.")
                        
                        # 2. Acknowledge policy application
                        requests.patch(
                            f"{url}/api/policy/{machine}/ack",
                            headers={"x-api-key": key},
                            json={"policy": {"catModes": cat_modes}},
                            timeout=5, verify=False,
                        )

                # 3. Report active running policy to Central
                try:
                    requests.post(
                        f"{url}/api/policy/{machine}/current",
                        headers={"x-api-key": key},
                        json={"policy": {"catModes": cat_modes}},
                        timeout=5, verify=False,
                    )
                except Exception as ex:
                    log(f"[POLICY-REPORT-ERR] {ex}")

            except Exception as ex:
                log(f"[POLICY-POLL-ERR] {ex}")
            
            time.sleep(20)

    threading.Thread(target=_poll, daemon=True, name="PolicyPoller").start()

# ═══════════════════════════════════════════════════════════════════════════════
# DETECTION SIGNATURES
# ═══════════════════════════════════════════════════════════════════════════════

SENSITIVE_TOOLS = {
    "mimikatz","maldump","secretsdump","lazagne","crackmapexec",
    "bloodhound","sharphound","adrecon","kerbrute","rubeus",
    "seatbelt","certify","impacket-secretsdump","impacket-smbexec",
    "responder","bettercap","msfconsole","msfvenom","metasploit",
    "nmap","masscan","zmap","hydra","medusa","john","hashcat",
    "aircrack-ng","nikto","sqlmap","burpsuite","ettercap",
    "wireshark","tcpdump","strace","ltrace","gdb","radare2","ghidra",
    "netcat","nc","ncat","socat","chisel","ligolo","frp",
    "linpeas","linenum","lse.sh","linux-exploit-suggester",
    "pspy","pspy64","pspy32",
    # Added
    "fscan","nuclei","subfinder","amass","gobuster","feroxbuster",
    "evil-winrm","crackmapexec","proxychains","proxychains4",
    "redsocks","dnscat","dnscat2","iodine","ptunnel",
    "invoke-obfuscation","powersploit","empire","covenant",
    "sliver","havoc","brute-ratel","cobalt-strike",
    "mimipenguin","mimipy","lsassy","pypykatz",
    "pwncat","pwncat-cs","impacket","impacket-wmiexec",
    "xfreerdp","rdesktop","x11vnc","vnc2swf",
    "beef-xss","setoolkit","beef",
}

HIGH_RISK_PARENTS = {
    "apache2","nginx","httpd","php","php-fpm","python","python3",
    "ruby","perl","node","java","tomcat","jetty",
    "firefox","chromium","chrome","electron",
    "mysql","postgres","psql","mongod","redis-server",
    # Added
    "php7.0","php7.4","php8.0","php8.1","php8.2",
    "uwsgi","gunicorn","unicorn","puma","thin",
    "wordpress","drupal","joomla",
    "lighttpd","caddy","traefik","haproxy",
    "dovecot","postfix","exim","sendmail",
    "vsftpd","proftpd","pure-ftpd",
}

SUSPICIOUS_CMDS_RE = re.compile(
    r"(curl|wget|fetch|nc|ncat|netcat|python.+http\.server|php.+-r|"
    r"base64.+-d|bash.+-i|sh.+-i|perl.+-e|ruby.+-e|"
    r"echo.+/dev/tcp|mkfifo|mknod|xterm.+display|"
    r"chmod.+777|chmod.+\+s|chown.+root|dd.+if=|"
    r"openssl.+enc|openssl.+s_client|"
    r"history.+-c|unset HISTFILE|export HISTSIZE=0|"
    r"iptables.+-F|ufw.+disable|"
    # Added
    r"python.+-c.+import|perl.+-e.+use\s+Socket|"
    r"ruby.+-e.+require|lua.+-e|"
    r"env.+LD_PRELOAD|export.+LD_PRELOAD|"
    r"nsenter|unshare.+--mount|unshare.+--pid|"
    r"docker.+--privileged|docker.+--cap-add|"
    r"mount.+/proc|mount.+/sys|mount.+/dev|"
    r"pivot_root|chroot|"
    r"ln.+-sf.+/etc/passwd|ln.+-sf.+/etc/shadow|"
    r"tee.+/etc/|truncate.+/etc/|"
    r"systemctl.+disable|systemctl.+mask|"
    r"journalctl.+--vacuum|rm.+/var/log|"
    r"shred|wipe|srm|"
    r"/dev/shm/|/run/shm/|"
    r"crontab.+-r|"
    r"at\s+now|echo.+\|\s*at\b|"
    r"ssh.+-R.+:\d+|ssh.+-L.+:\d+|ssh.+-D\s+\d+)",
    re.IGNORECASE
)

ENUM_CMD_RE = re.compile(
    r"\b(whoami|id|uname|hostname|ifconfig|ip\s+addr|ip\s+route|"
    r"netstat|ss\s+-|arp\s+-|route\s+-|lsof\s+-|ps\s+aux|"
    r"cat\s+/etc/passwd|cat\s+/etc/shadow|cat\s+/etc/sudoers|"
    r"find\s+/\s+-|locate\s+|which\s+|getent\s+passwd|"
    r"last\b|lastlog\b|w\b|who\b|finger\b|"
    r"ldapsearch|rpcclient|smbclient|enum4linux|"
    r"sudo\s+-l|sudo\s+--list|"
    # Added
    r"cat\s+/etc/group|cat\s+/etc/hosts|"
    r"cat\s+/proc/version|cat\s+/proc/cpuinfo|"
    r"uname\s+-a|cat\s+/etc/os-release|"
    r"env\b|printenv\b|set\b|"
    r"df\s+-|mount\b|lsblk\b|fdisk\s+-l|"
    r"ip\s+neigh|arp\s+-a|"
    r"ss\s+-tlnp|netstat\s+-tlnp|"
    r"crontab\s+-l|cat\s+/etc/crontab|"
    r"systemctl\s+list|service\s+--status-all|"
    r"dpkg\s+-l|rpm\s+-qa|pip\s+list|pip3\s+list|"
    r"find\s+/\s+.*-perm.*4000|find\s+/\s+.*suid|"
    r"getcap\s+-r|"
    r"cat\s+/proc/net/|"
    r"ls\s+-la\s+/home|ls\s+-la\s+/root|"
    r"cat\s+~/.bash_history|cat\s+/root/.bash_history|"
    r"cat\s+~/.ssh/|ls\s+~/.ssh/)\b",
    re.IGNORECASE
)

SENSITIVE_CMD_RE = re.compile(
    r"\b(passwd\s+root|usermod\s+-G\s+sudo|adduser\s+.+sudo|"
    r"visudo|chsh\s+-s\s+/bin/bash\s+root|"
    r"echo.+>>\s*/etc/passwd|echo.+>>\s*/etc/sudoers|"
    r"curl.+\|\s*bash|wget.+\|\s*bash|fetch.+\|\s*sh|"
    r"chmod\s+\+s|chmod\s+4[0-9]{3}|chown\s+root:root|"
    r"ptrace|strace\s+-p|ltrace\s+-p|"
    r"dd\s+if=/dev/mem|dd\s+if=/proc/kmem|"
    r"insmod|modprobe\s+|rmmod\s+|"
    # Added
    r"useradd|userdel|groupadd|groupdel|"
    r"usermod.+-aG|usermod.+-g\s+root|"
    r"echo.+>>\s*/root/.ssh/authorized_keys|"
    r"cat.+>>\s*/root/.ssh/authorized_keys|"
    r"tee.+authorized_keys|"
    r"ssh-keygen|ssh-keyscan|"
    r"openssl\s+genrsa|openssl\s+req\s+-new|"
    r"gpasswd\s+-a|gpasswd\s+-d|"
    r"update-alternatives|"
    r"dpkg\s+-i|rpm\s+-i|"
    r"systemctl\s+enable|systemctl\s+start\s+|"
    r"crontab\s+-u\s+root|"
    r"at\s+-f|batch\b|"
    r"sudo\s+su|su\s+root|su\s+-\s*$|"
    r"pkexec|dbus-send.*org\.freedesktop)\b",
    re.IGNORECASE
)

# ── Kernel exploitation patterns ──────────────────────────────────────────────
KERNEL_EXPLOIT_RE = re.compile(
    r"(CVE-20\d\d-\d+|"
    r"dirty[_\s]?cow|dirty[_\s]?pipe|"
    r"overlayfs|runc\s+exploit|"
    r"escalat|privilege|kernel.+exploit|"
    r"linux.+exploit|local.+exploit|"
    r"heap.+spray|stack.+smash|"
    r"use.after.free|double.free|"
    r"integer.overflow|format.string)",
    re.IGNORECASE
)

# ── C2 / Beacon patterns in cmdline ──────────────────────────────────────────
C2_PATTERN_RE = re.compile(
    r"(sleep\s+\d+.*curl|"
    r"while\s+true.*wget|"
    r"cron.*curl.*bash|"
    r"base64\s+--decode.*exec|"
    r"\$\(curl|`curl|"
    r"python.*-c.*socket.*connect|"
    r"perl.*-e.*socket|"
    r"ruby.*-e.*TCPSocket|"
    r"bash.*-c.*>&\s*/dev/tcp|"
    r"exec.*\d+<>/dev/tcp)",
    re.IGNORECASE
)

# ── DNS suspicious patterns ───────────────────────────────────────────────────
SUSPICIOUS_DNS_RE = re.compile(
    r"(\.onion$|"
    r"\.bit$|\.coin$|\.bazar$|"  # blockchain TLDs
    r"[a-z0-9]{30,}\.|"           # DGA - very long random subdomains
    r"(\w{8,}\.\w{8,}\.){3,})",   # deeply nested subdomains (DNS tunnel)
    re.IGNORECASE
)

# ═══════════════════════════════════════════════════════════════════════════════
# PORT LISTS
# ═══════════════════════════════════════════════════════════════════════════════

WATCH_PORTS_INBOUND = {
    22:    "SSH",
    23:    "Telnet",
    3389:  "RDP",
    5985:  "WinRM-HTTP",
    5986:  "WinRM-HTTPS",
    445:   "SMB",
    139:   "NetBIOS",
    2049:  "NFS",
    6000:  "X11",
    3306:  "MySQL",
    5432:  "PostgreSQL",
    6379:  "Redis",
    27017: "MongoDB",
    5900:  "VNC",
    5901:  "VNC-1",
    4444:  "Meterpreter",
    8080:  "HTTP-Alt",
    8443:  "HTTPS-Alt",
    2375:  "Docker-unencrypted",
    2376:  "Docker-TLS",
    10250: "Kubelet",
    2379:  "etcd",
    6443:  "Kubernetes-API",
}

WATCH_PORTS_OUTBOUND = {
    22:   "SSH",
    23:   "Telnet",
    3389: "RDP",
    445:  "SMB",
    5985: "WinRM-HTTP",
    5986: "WinRM-HTTPS",
    4444: "Meterpreter",
    1337: "Hacker-Port",
    8888: "Jupyter/Backdoor",
    9001: "Tor",
    9050: "Tor-Proxy",
    9150: "Tor-Browser",
    6667: "IRC",
    6697: "IRC-SSL",
    1080: "SOCKS-Proxy",
    3128: "Squid-Proxy",
    4443: "Alt-HTTPS-C2",
    2222: "Alt-SSH",
    1234: "Common-Backdoor",
    5555: "ADB-Android",
    31337: "Elite-Backdoor",
}

# ═══════════════════════════════════════════════════════════════════════════════
# SENSITIVE FILES — ENHANCED
# ═══════════════════════════════════════════════════════════════════════════════

SENSITIVE_FILES_STATIC = {
    # Credentials
    "/etc/passwd":                          "Password database",
    "/etc/shadow":                          "Password hashes",
    "/etc/gshadow":                         "Group password hashes",
    "/etc/group":                           "Group memberships",
    # Privilege escalation
    "/etc/sudoers":                         "Sudo configuration",
    "/etc/security/access.conf":            "PAM login access control",
    "/etc/security/limits.conf":            "User resource limits",
    "/etc/login.defs":                      "Login defaults",
    # PAM — entire auth stack
    "/etc/pam.d/sshd":                      "PAM SSH auth rules",
    "/etc/pam.d/sudo":                      "PAM sudo auth rules",
    "/etc/pam.d/su":                        "PAM su auth rules",
    "/etc/pam.d/login":                     "PAM console login rules",
    "/etc/pam.d/common-auth":               "PAM shared auth (Debian/Ubuntu)",
    "/etc/pam.d/system-auth":               "PAM shared auth (RHEL/CentOS)",
    "/etc/pam.d/passwd":                    "PAM password change rules",
    # SSH
    "/etc/ssh/sshd_config":                 "SSH daemon config",
    "/etc/ssh/ssh_config":                  "SSH client config",
    "/root/.ssh/authorized_keys":           "Root SSH authorized keys",
    "/root/.ssh/id_rsa":                    "Root SSH private key",
    "/root/.ssh/id_ed25519":                "Root SSH private key (ed25519)",
    "/root/.ssh/id_ecdsa":                  "Root SSH private key (ecdsa)",
    # Network
    "/etc/hosts":                           "Hosts file — DNS spoofing vector",
    "/etc/resolv.conf":                     "DNS resolver config",
    "/etc/nsswitch.conf":                   "Name service switch",
    "/etc/hosts.allow":                     "TCP wrappers allow list",
    "/etc/hosts.deny":                      "TCP wrappers deny list",
    "/etc/gai.conf":                        "IPv6/IPv4 address selection",
    # Firewall
    "/etc/iptables/rules.v4":               "iptables IPv4 rules",
    "/etc/iptables/rules.v6":               "iptables IPv6 rules",
    "/etc/ufw/user.rules":                  "UFW user rules",
    "/etc/ufw/user6.rules":                 "UFW user IPv6 rules",
    "/etc/nftables.conf":                   "nftables firewall config",
    # Bootloader
    "/boot/grub/grub.cfg":                  "GRUB bootloader config",
    "/boot/grub2/grub.cfg":                 "GRUB2 bootloader config",
    "/etc/default/grub":                    "GRUB default parameters",
    # Kernel / rootkit
    "/etc/sysctl.conf":                     "Kernel parameters",
    "/etc/modules":                         "Auto-loaded kernel modules",
    "/etc/ld.so.preload":                   "LD_PRELOAD rootkit vector",
    "/etc/ld.so.conf":                      "Linker config",
    "/proc/sys/kernel/modules_disabled":    "Kernel module loading",
    "/proc/sys/kernel/randomize_va_space":  "ASLR setting",
    "/proc/sys/net/ipv4/ip_forward":        "IP forwarding",
    "/proc/sys/kernel/dmesg_restrict":      "Kernel log restriction",
    "/proc/sys/kernel/yama/ptrace_scope":   "ptrace restriction",
    "/proc/sys/kernel/unprivileged_bpf_disabled": "Unprivileged eBPF",
    "/proc/sys/net/core/bpf_jit_harden":   "BPF JIT hardening",
    # Package management
    "/etc/apt/sources.list":                "APT package sources",
    "/etc/apt/trusted.gpg":                 "APT trusted GPG keys",
    "/etc/yum.conf":                        "YUM config",
    "/etc/dnf/dnf.conf":                    "DNF config",
    # Shell environment
    "/etc/environment":                     "System-wide environment variables",
    "/etc/hostname":                        "Hostname",
    "/etc/shells":                          "Valid login shells",
    # Certificates
    "/etc/ca-certificates.conf":            "Trusted CA list",
    # Cron
    "/etc/crontab":                         "System crontab",
    "/var/spool/cron/crontabs/root":        "Root crontab",
    # Docker / containers
    "/etc/docker/daemon.json":              "Docker daemon config",
    "/run/containerd/containerd.sock":      "containerd socket",
    # Logging
    "/etc/rsyslog.conf":                    "Syslog config",
    "/etc/logrotate.conf":                  "Log rotation config",
    # Time — manipulating time hides forensic trails
    "/etc/ntp.conf":                        "NTP config",
    "/etc/chrony.conf":                     "Chrony NTP config",
    # Crypto / PKI
    "/etc/ssl/openssl.cnf":                 "OpenSSL config",
}

def _get_dynamic_sensitive_files() -> dict:
    """Build runtime-discovered sensitive file paths."""
    files = {}
    try:
        import pwd
        for p in pwd.getpwall():
            if p.pw_uid >= 500 and os.path.isdir(p.pw_dir):
                for rel, desc in [
                    (".ssh/authorized_keys",  f"SSH authorized keys ({p.pw_name})"),
                    (".ssh/id_rsa",           f"SSH private key ({p.pw_name})"),
                    (".ssh/id_ed25519",       f"SSH private key ed25519 ({p.pw_name})"),
                    (".ssh/id_ecdsa",         f"SSH private key ecdsa ({p.pw_name})"),
                    (".bashrc",               f"Bash config ({p.pw_name})"),
                    (".bash_profile",         f"Bash profile ({p.pw_name})"),
                    (".profile",              f"Shell profile ({p.pw_name})"),
                    (".config/autostart",     f"Autostart dir ({p.pw_name})"),
                    (".gnupg/trustdb.gpg",    f"GPG trustdb ({p.pw_name})"),
                ]:
                    full = os.path.join(p.pw_dir, rel)
                    if os.path.exists(full):
                        files[full] = desc
    except Exception:
        pass

    # /etc/sudoers.d/* drop-ins
    for f in glob.glob("/etc/sudoers.d/*"):
        if os.path.isfile(f) and not f.endswith("~"):
            files[f] = "Sudoers drop-in"

    # /etc/sysctl.d/*.conf
    for f in glob.glob("/etc/sysctl.d/*.conf"):
        files[f] = "Kernel parameter drop-in"

    # /etc/modprobe.d/*.conf (can alias modules to rootkits)
    for f in glob.glob("/etc/modprobe.d/*.conf"):
        files[f] = "Module option config"

    # /etc/apt/sources.list.d/*
    for f in glob.glob("/etc/apt/sources.list.d/*.list"):
        files[f] = "APT source drop-in"

    # /etc/ssh/sshd_config.d/* (Ubuntu 22+)
    for f in glob.glob("/etc/ssh/sshd_config.d/*.conf"):
        files[f] = "SSHD config drop-in"

    # /etc/cron.d/*
    for f in glob.glob("/etc/cron.d/*"):
        if os.path.isfile(f):
            files[f] = "Cron drop-in"

    # User crontabs
    for f in glob.glob("/var/spool/cron/crontabs/*"):
        if os.path.isfile(f):
            user = os.path.basename(f)
            files[f] = f"Crontab for {user}"

    # Systemd service drop-in overrides
    for f in glob.glob("/etc/systemd/system/*.d/override.conf"):
        files[f] = "Systemd service override"

    # /etc/logrotate.d/*
    for f in glob.glob("/etc/logrotate.d/*"):
        if os.path.isfile(f):
            files[f] = "Log rotation drop-in"

    return files

def get_all_sensitive_files() -> dict:
    files = dict(SENSITIVE_FILES_STATIC)
    files.update(_get_dynamic_sensitive_files())
    return files

# ── Kernel runtime values to check ───────────────────────────────────────────
KERNEL_CHECKS = [
    # (path, expected_value, description, severity)
    ("/proc/sys/kernel/randomize_va_space",  "2",
     "ASLR disabled — memory layout predictable", "critical"),
    ("/proc/sys/net/ipv4/ip_forward",        "0",
     "IP forwarding enabled — machine may be pivot", "high"),
    ("/proc/sys/kernel/dmesg_restrict",      "1",
     "Kernel log unrestricted — info leak", "medium"),
    ("/proc/sys/kernel/yama/ptrace_scope",   "1",
     "ptrace unrestricted — process memory readable", "high"),
    ("/proc/sys/kernel/unprivileged_bpf_disabled", "1",
     "Unprivileged eBPF enabled — kernel attack surface", "high"),
    ("/proc/sys/net/core/bpf_jit_harden",   "2",
     "BPF JIT hardening disabled", "medium"),
    ("/proc/sys/net/ipv4/conf/all/accept_redirects", "0",
     "ICMP redirects accepted — routing table can be poisoned", "high"),
    ("/proc/sys/net/ipv4/conf/all/rp_filter", "1",
     "Reverse path filtering disabled", "medium"),
    ("/proc/sys/kernel/kptr_restrict",       "2",
     "Kernel pointer leak — symbols exposed", "medium"),
    ("/proc/sys/kernel/perf_event_paranoid", "3",
     "Perf events unrestricted — side-channel", "medium"),
    ("/proc/sys/net/ipv4/tcp_syncookies",    "1",
     "SYN cookies disabled — SYN flood vulnerable", "medium"),
]

# ═══════════════════════════════════════════════════════════════════════════════
# TEMPORAL CORRELATION ENGINE
# Tracks events over a short window to detect attack chains
# ═══════════════════════════════════════════════════════════════════════════════

_CORR_WINDOW_SECS = 120   # events within 2 minutes are correlated

def _add_correlation_event(msg: str):
    """Add an event to the correlation buffer."""
    with _correlation_lock:
        _correlation_buffer.append({
            "ts":  datetime.now(timezone.utc),
            "msg": msg,
        })

def _get_recent_events(window_secs: int = _CORR_WINDOW_SECS) -> list:
    """Return events from the last N seconds."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_secs)
    with _correlation_lock:
        return [e for e in _correlation_buffer if e["ts"] >= cutoff]

def start_correlation_monitor():
    """
    Detects attack chains by correlating events over a time window.
    Fires when multiple suspicious events occur close together,
    even if each individual event seems low-severity.
    """
    if not config.get("monitor_correlation"):
        return

    # Attack chain signatures:
    # Each is a list of tags that together indicate an attack chain
    CHAINS = [
        {
            "name":     "Reconnaissance followed by credential access",
            "requires": ["[ENUM]", "[SENSITIVE]"],
            "severity": "critical",
        },
        {
            "name":     "Failed login followed by successful login (possible brute force success)",
            "requires": ["[FAILED-LOGON]", "[AFTER-HOURS]"],
            "severity": "high",
        },
        {
            "name":     "New process from risky path with outbound connection",
            "requires": ["[DETECTED][UNSIGNED-UNSAFE-PATH]", "[OUTBOUND-LATERAL]"],
            "severity": "critical",
        },
        {
            "name":     "Sensitive file read followed by network exfil",
            "requires": ["[SENSITIVE]", "[OUTBOUND-LATERAL]"],
            "severity": "critical",
        },
        {
            "name":     "New SUID file with privilege escalation commands",
            "requires": ["[SENSITIVE][SUID]", "[PRIVESC]"],
            "severity": "critical",
        },
        {
            "name":     "Kernel module load with hidden process",
            "requires": ["[SENSITIVE][KERNEL-MODULE]", "[SENSITIVE][HIDDEN-PROCESS]"],
            "severity": "critical",
        },
        {
            "name":     "Persistence followed by enumeration (post-exploitation pattern)",
            "requires": ["[PERSISTENCE]", "[ENUM]"],
            "severity": "high",
        },
        {
            "name":     "Multiple sensitive file modifications (attacker covering tracks)",
            "requires": ["[SENSITIVE][FILE-MODIFIED]",
                         "[SENSITIVE][FILE-MODIFIED]"],
            "severity": "high",
        },
        {
            "name":     "Fileless execution with C2 connection",
            "requires": ["[FILELESS]", "[OUTBOUND-LATERAL]"],
            "severity": "critical",
        },
        {
            "name":     "Container escape attempt with privilege escalation",
            "requires": ["[CONTAINER-ESCAPE]", "[PRIVESC]"],
            "severity": "critical",
        },
    ]

    # Dedup: don't re-fire same chain within 5 minutes
    _chain_dedup: dict = {}
    _dedup_lock         = threading.Lock()

    def _check():
        while True:
            time.sleep(30)
            try:
                recent = _get_recent_events()
                if len(recent) < 2:
                    continue

                recent_tags = [e["msg"] for e in recent]

                for chain in CHAINS:
                    required = chain["requires"]
                    # Check all required tags appear in recent events
                    matched = all(
                        any(tag in msg for msg in recent_tags)
                        for tag in required
                    )
                    if not matched:
                        continue

                    # Dedup
                    key = chain["name"]
                    with _dedup_lock:
                        last = _chain_dedup.get(key)
                        if last and (datetime.now(timezone.utc) - last).seconds < 300:
                            continue
                        _chain_dedup[key] = datetime.now(timezone.utc)

                    msg = (f"[CORRELATION] Attack chain detected: '{chain['name']}' "
                           f"| {len(recent)} events in {_CORR_WINDOW_SECS}s window "
                           f"| Severity: {chain['severity'].upper()}")
                    log(msg)
                    ship_event("[CORRELATION]", chain["severity"], "CORRELATION", msg)

            except Exception as ex:
                log(f"[CORRELATION-ERR] {ex}")

    threading.Thread(target=_check, daemon=True, name="CorrelationMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# PROCESS LINEAGE TRACKER
# Tracks full process trees, not just one parent level
# ═══════════════════════════════════════════════════════════════════════════════

def _build_process_tree():
    """Snapshot the current process tree."""
    if not HAS_PSUTIL:
        return
    tree = {}
    try:
        for proc in psutil.process_iter(
                ["pid","name","exe","ppid","cmdline","uids","gids","create_time"]):
            try:
                info = proc.info
                tree[info["pid"]] = {
                    "name":        info.get("name") or "",
                    "exe":         info.get("exe")  or "",
                    "ppid":        info.get("ppid") or 0,
                    "cmdline":     " ".join(info.get("cmdline") or []),
                    "uid":         (info.get("uids") or [0])[0],
                    "gid":         (info.get("gids") or [0])[0],
                    "create_time": info.get("create_time") or 0,
                }
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    with _proc_tree_lock:
        _process_tree.clear()
        _process_tree.update(tree)

def get_process_chain(pid: int, max_depth: int = 8) -> list:
    """
    Return the full ancestor chain for a PID.
    Returns list of (pid, name, exe) from oldest ancestor to process.
    """
    chain = []
    visited = set()
    current = pid
    with _proc_tree_lock:
        while current and current not in visited and len(chain) < max_depth:
            visited.add(current)
            info = _process_tree.get(current)
            if not info:
                break
            chain.append((current, info["name"], info["exe"]))
            current = info["ppid"]
    chain.reverse()
    return chain

def format_chain(chain: list) -> str:
    return " → ".join(
        f"{name}({pid})" for pid, name, exe in chain
    )

def is_chain_suspicious(chain: list) -> Tuple[bool, str]:
    """
    Check if a process chain contains a suspicious pattern.
    Returns (is_suspicious, reason).
    """
    names = [n.lower() for _, n, _ in chain]
    exes  = [e.lower() for _, _, e in chain]

    # Web server / interpreter → shell — always suspicious
    for i, name in enumerate(names):
        if name in {n.lower() for n in HIGH_RISK_PARENTS}:
            for j in range(i + 1, len(names)):
                if names[j] in {"bash","sh","dash","zsh","ksh","fish","csh"}:
                    return (True,
                        f"High-risk parent {name} → shell {names[j]}")

    # Shell → curl/wget/nc — download or C2
    shell_names = {"bash","sh","dash","zsh","ksh","fish"}
    net_tools   = {"curl","wget","nc","ncat","netcat","socat"}
    for i, name in enumerate(names):
        if name in shell_names:
            for j in range(i + 1, len(names)):
                if names[j] in net_tools:
                    return (True,
                        f"Shell {name} → network tool {names[j]}")

    # Python/perl/ruby spawning shell
    interpreters = {"python","python3","perl","ruby","php","lua","node"}
    for i, name in enumerate(names[:-1]):
        if any(name.startswith(i) for i in interpreters):
            if names[i + 1] in shell_names:
                return (True,
                    f"Interpreter {name} → shell {names[i+1]}")

    # Process from /tmp, /dev/shm, /var/tmp
    risky = ["/tmp/","/dev/shm/","/var/tmp/","/run/user/"]
    for pid, name, exe in chain:
        if exe and any(exe.startswith(r) for r in risky):
            return (True, f"Process {name} executing from risky path {exe}")

    return (False, "")

# ═══════════════════════════════════════════════════════════════════════════════
# PROCESS MONITOR — ENHANCED
# ═══════════════════════════════════════════════════════════════════════════════

def classify_process(pid, name, cmdline, ppid, parent_name, exe,
                     uid=None, gid=None) -> Optional[dict]:
    name_lower = os.path.basename(name or "").lower()

    # Known attack tools
    if name_lower in SENSITIVE_TOOLS:
        return {
            "tag": "[SENSITIVE]", "severity": "critical", "category": "SENSITIVE",
            "message": (f"[SENSITIVE] Known attack tool: '{name}' PID:{pid} "
                        f"Parent:'{parent_name}' CMD:{cmdline[:200]}"),
        }

    # C2 beacon patterns
    if C2_PATTERN_RE.search(cmdline or ""):
        return {
            "tag": "[FILELESS][C2-BEACON]", "severity": "critical",
            "category": "SENSITIVE",
            "message": (f"[FILELESS][C2-BEACON] C2 beacon pattern: PID:{pid} "
                        f"'{name}' CMD:{cmdline[:300]}"),
        }

    # Suspicious command patterns
    if SUSPICIOUS_CMDS_RE.search(cmdline or ""):
        return {
            "tag": "[CMD-EXEC][DETECTED]", "severity": "high",
            "category": "PROCESSES",
            "message": (f"[CMD-EXEC][DETECTED] Suspicious command: PID:{pid} '{name}' "
                        f"Parent:'{parent_name}' CMD:{cmdline[:300]}"),
        }

    # High-risk parent spawning shell
    if parent_name in HIGH_RISK_PARENTS and name_lower in {
        "bash","sh","dash","zsh","ksh","csh","tcsh","fish"
    }:
        return {
            "tag": "[CMD-EXEC][HIGH-RISK-PARENT]", "severity": "critical",
            "category": "PROCESSES",
            "message": (f"[CMD-EXEC][HIGH-RISK-PARENT] '{parent_name}' spawned shell "
                        f"'{name}' PID:{pid} CMD:{cmdline[:200]}"),
        }

    # Kernel exploit patterns in cmdline
    if KERNEL_EXPLOIT_RE.search(cmdline or "") or \
       KERNEL_EXPLOIT_RE.search(name or ""):
        return {
            "tag": "[PRIVESC][KERNEL-EXPLOIT]", "severity": "critical",
            "category": "SENSITIVE",
            "message": (f"[PRIVESC][KERNEL-EXPLOIT] Possible kernel exploit: "
                        f"PID:{pid} '{name}' CMD:{cmdline[:200]}"),
        }

    # Reverse shell patterns
    if re.search(r"/dev/tcp|/dev/udp|\bexec\b.*\b(bash|sh)\b",
                 cmdline or ""):
        return {
            "tag": "[SENSITIVE][REVERSE-SHELL]", "severity": "critical",
            "category": "SENSITIVE",
            "message": f"[SENSITIVE][REVERSE-SHELL] PID:{pid} CMD:{cmdline[:200]}",
        }

    # Process from risky paths
    risky_paths = ["/tmp/", "/dev/shm/", "/var/tmp/", "/run/user/"]
    if exe and any(exe.startswith(p) for p in risky_paths):
        return {
            "tag": "[DETECTED][UNSIGNED-UNSAFE-PATH]", "severity": "high",
            "category": "PROCESSES",
            "message": (f"[DETECTED][UNSIGNED-UNSAFE-PATH] Process from risky path: "
                        f"PID:{pid} '{name}' exe:'{exe}' CMD:{cmdline[:150]}"),
        }

    # Full process chain analysis
    chain = get_process_chain(pid)
    if len(chain) > 1:
        suspicious, reason = is_chain_suspicious(chain)
        if suspicious:
            return {
                "tag": "[BEHAVIORAL-IOC][CHAIN]", "severity": "high",
                "category": "PROCESSES",
                "message": (f"[BEHAVIORAL-IOC][CHAIN] Suspicious process chain: "
                            f"{format_chain(chain)} | {reason}"),
            }

    return None

def start_process_monitor():
    if not config.get("monitor_processes") or not HAS_PSUTIL:
        return

    # Baseline the process tree first
    _build_process_tree()

    def _monitor():
        seen_pids = {}
        # Track UID/GID per pid for privilege escalation detection
        pid_uids: Dict[int, int] = {}

        log("[MONITOR] Process monitor starting...")
        for proc in psutil.process_iter(["pid","name","cmdline","ppid","exe","uids"]):
            try:
                info = proc.info
                seen_pids[info["pid"]] = info.get("cmdline") or []
                uids = info.get("uids")
                if uids:
                    pid_uids[info["pid"]] = uids[0]
            except Exception:
                pass
        log(f"[MONITOR] Process monitor running. Seeded {len(seen_pids)} processes.")

        cycle = 0
        while True:
            time.sleep(2)
            cycle += 1
            try:
                current_pids = {}
                for proc in psutil.process_iter(
                        ["pid","name","cmdline","ppid","exe","uids","gids"]):
                    try:
                        info    = proc.info
                        pid     = info["pid"]
                        cmdline = info.get("cmdline") or []
                        current_pids[pid] = cmdline
                        uids = info.get("uids")
                        current_uid = uids[0] if uids else None

                        # ── Privilege escalation: UID transition ──────────────
                        if pid in pid_uids and current_uid is not None:
                            prev_uid = pid_uids[pid]
                            if prev_uid != 0 and current_uid == 0:
                                msg = (f"[PRIVESC][UID-TRANSITION] Process '{info.get('name')}' "
                                       f"PID:{pid} transitioned UID:{prev_uid}→0 (ROOT) "
                                       f"CMD:{' '.join(cmdline)[:150]}")
                                log(msg)
                                ship_event("[PRIVESC]", "critical", "SENSITIVE", msg)

                        if current_uid is not None:
                            pid_uids[pid] = current_uid

                        if pid in seen_pids or not should_log(CAT_PROCESSES):
                            continue

                        name    = info.get("name") or ""
                        cmd_str = " ".join(cmdline)
                        ppid    = info.get("ppid") or 0
                        exe     = info.get("exe") or ""
                        parent_name = ""
                        try:
                            parent_name = psutil.Process(ppid).name()
                        except Exception:
                            pass

                        # Update process tree
                        with _proc_tree_lock:
                            _process_tree[pid] = {
                                "name":        name,
                                "exe":         exe,
                                "ppid":        ppid,
                                "cmdline":     cmd_str,
                                "uid":         current_uid or 0,
                                "gid":         0,
                                "create_time": time.time(),
                            }

                        alert = classify_process(
                            pid, name, cmd_str, ppid,
                            parent_name, exe, current_uid)
                        if alert:
                            log(alert["message"])
                            ship_event(alert["tag"], alert["severity"],
                                       alert["category"], alert["message"])
                            if should_act(CAT_PROCESSES) and \
                               not config.get("learning_mode"):
                                try:
                                    proc.kill()
                                    log(f"[AUTO-BLOCKED] Killed PID:{pid} '{name}'")
                                except Exception:
                                    pass

                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                # Clean up dead PIDs from uid tracker
                dead = set(pid_uids.keys()) - set(current_pids.keys())
                for pid in dead:
                    pid_uids.pop(pid, None)

                seen_pids = current_pids

                # Rebuild process tree every 30 cycles (~60s)
                if cycle % 30 == 0:
                    _build_process_tree()

            except Exception as ex:
                log(f"[PROCESS-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="ProcessMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# FILELESS MALWARE MONITOR
# Detects execution from memory without touching disk
# ═══════════════════════════════════════════════════════════════════════════════

def start_fileless_monitor():
    """
    Detects fileless malware techniques:
      - memfd_create anonymous file execution
      - Processes with deleted exe (/proc/pid/exe → path (deleted))
      - /dev/shm executables
      - Processes with no exe path but active network connections
      - Executable anonymous memory mappings (rwx without file backing)
    """
    if not config.get("monitor_fileless") or not HAS_PSUTIL:
        return

    def _monitor():
        known_memfd:   set = set()
        known_deleted: set = set()
        log("[MONITOR] Fileless malware monitor starting...")

        while True:
            time.sleep(5)
            try:
                for entry in os.scandir("/proc"):
                    if not entry.name.isdigit():
                        continue
                    pid = int(entry.name)
                    try:
                        # ── Check 1: memfd_create execution ──────────────────
                        # exe symlink contains "memfd:" for anonymous execution
                        exe_path = ""
                        try:
                            exe_path = os.readlink(f"/proc/{pid}/exe")
                        except Exception:
                            pass

                        if "memfd:" in exe_path and pid not in known_memfd:
                            known_memfd.add(pid)
                            cmdline = _proc_attr(pid, "cmdline").replace(
                                "\x00", " ").strip()
                            comm    = _proc_attr(pid, "comm").strip()
                            msg = (f"[FILELESS][MEMFD] Process executing from "
                                   f"anonymous memory (memfd_create): "
                                   f"PID:{pid} comm:'{comm}' "
                                   f"exe:'{exe_path}' CMD:{cmdline[:150]}")
                            log(msg)
                            ship_event("[FILELESS][MEMFD]", "critical",
                                       "SENSITIVE", msg)

                        # ── Check 2: Deleted executable ───────────────────────
                        # Malware deletes itself after exec to avoid detection
                        if exe_path.endswith("(deleted)") and pid not in known_deleted:
                            known_deleted.add(pid)
                            comm    = _proc_attr(pid, "comm").strip()
                            cmdline = _proc_attr(pid, "cmdline").replace(
                                "\x00", " ").strip()
                            # Skip kernel threads and known patterns
                            if comm not in {"kworker","ksoftirqd","migration",
                                            "rcu_sched","watchdog","cpuhp"}:
                                msg = (f"[FILELESS][DELETED-EXE] Process running from "
                                       f"deleted file: PID:{pid} comm:'{comm}' "
                                       f"exe:'{exe_path}' CMD:{cmdline[:150]}")
                                log(msg)
                                ship_event("[FILELESS][DELETED-EXE]", "high",
                                           "SENSITIVE", msg)

                        # ── Check 3: RWX anonymous memory mappings ────────────
                        # Shellcode injected as anonymous rwx mappings
                        try:
                            maps_content = open(
                                f"/proc/{pid}/maps", errors="replace").read()
                            rwx_anon = re.findall(
                                r"[0-9a-f]+-[0-9a-f]+\s+rwxp\s+\S+\s+\S+\s+\S+\s*$",
                                maps_content, re.MULTILINE)
                            if rwx_anon:
                                comm = _proc_attr(pid, "comm").strip()
                                # Skip known JIT engines
                                jit_processes = {
                                    "java","node","python","python3","ruby",
                                    "firefox","chrome","chromium","electron"
                                }
                                if comm.lower() not in jit_processes:
                                    dedup_key = f"rwx|{pid}"
                                    if dedup_key not in known_memfd:
                                        known_memfd.add(dedup_key)
                                        msg = (f"[FILELESS][RWX-ANON] Process has "
                                               f"anonymous RWX memory mapping "
                                               f"(shellcode indicator): "
                                               f"PID:{pid} comm:'{comm}' "
                                               f"regions:{len(rwx_anon)}")
                                        log(msg)
                                        ship_event("[FILELESS][RWX-ANON]",
                                                   "high", "SENSITIVE", msg)
                        except Exception:
                            pass

                    except Exception:
                        pass

                # Clean up dead PIDs from tracking sets
                live_pids = set()
                try:
                    live_pids = {
                        int(e.name) for e in os.scandir("/proc")
                        if e.name.isdigit()
                    }
                except Exception:
                    pass
                known_memfd   &= live_pids | {k for k in known_memfd
                                               if isinstance(k, str)}
                known_deleted &= live_pids

                # ── Check 4: Executables in /dev/shm ─────────────────────────
                _check_shm_executables()

            except Exception as ex:
                log(f"[FILELESS-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="FilelessMonitor").start()

_shm_known: set = set()
_shm_lock        = threading.Lock()

def _check_shm_executables():
    """Detect executable files placed in /dev/shm (common malware staging)."""
    for shm_dir in ["/dev/shm", "/run/shm"]:
        if not os.path.isdir(shm_dir):
            continue
        try:
            for entry in os.scandir(shm_dir):
                if not entry.is_file():
                    continue
                with _shm_lock:
                    if entry.path in _shm_known:
                        continue
                    _shm_known.add(entry.path)
                try:
                    # Check if file is executable or has ELF magic
                    mode = entry.stat().st_mode
                    is_exec = bool(mode & 0o111)
                    magic   = b""
                    try:
                        with open(entry.path, "rb") as f:
                            magic = f.read(4)
                    except Exception:
                        pass
                    is_elf    = magic == b"\x7fELF"
                    is_script = magic[:2] == b"#!"
                    if is_exec or is_elf or is_script:
                        sha = sha256_file(entry.path)
                        msg = (f"[FILELESS][SHM-EXEC] Executable in shared memory: "
                               f"'{entry.path}' | ELF:{is_elf} Script:{is_script} "
                               f"SHA256:{sha[:16]}...")
                        log(msg)
                        ship_event("[FILELESS][SHM-EXEC]", "critical",
                                   "SENSITIVE", msg)
                except Exception:
                    pass
        except Exception:
            pass

# ═══════════════════════════════════════════════════════════════════════════════
# PRIVILEGE ESCALATION MONITOR
# ═══════════════════════════════════════════════════════════════════════════════

def start_privesc_monitor():
    """
    Detects privilege escalation attempts:
      - sudo -l (checking what we can run)
      - su/sudo to root
      - SUID binary execution from unexpected locations
      - Capability abuse (CAP_SYS_ADMIN, CAP_NET_ADMIN, etc.)
      - Namespace escape (user namespaces)
      - pkexec / polkit abuse
    """
    if not config.get("monitor_privesc") or not HAS_PSUTIL:
        return

    # Dangerous Linux capabilities
    DANGEROUS_CAPS = {
        "cap_sys_admin",    # equivalent to root for many purposes
        "cap_sys_ptrace",   # debug any process
        "cap_sys_module",   # load kernel modules
        "cap_net_admin",    # network config
        "cap_net_raw",      # raw sockets / packet sniffing
        "cap_dac_override", # bypass file permissions
        "cap_dac_read_search",  # read any file
        "cap_setuid",       # set any UID
        "cap_setgid",       # set any GID
        "cap_chown",        # change file ownership
        "cap_fowner",       # bypass ownership checks
        "cap_sys_chroot",   # chroot — container escape
    }

    _seen_caps:    dict = {}
    _caps_lock          = threading.Lock()

    def _monitor():
        log("[MONITOR] Privilege escalation monitor starting...")
        while True:
            time.sleep(5)
            try:
                for entry in os.scandir("/proc"):
                    if not entry.name.isdigit():
                        continue
                    pid = int(entry.name)
                    try:
                        status = _proc_attr(pid, "status")
                        if not status:
                            continue

                        # ── Check capabilities ────────────────────────────────
                        # Parse CapEff (effective capabilities) from /proc/pid/status
                        cap_match = re.search(
                            r"CapEff:\s+([0-9a-f]+)", status, re.IGNORECASE)
                        if cap_match:
                            cap_hex  = int(cap_match.group(1), 16)
                            if cap_hex == 0:
                                continue
                            with _caps_lock:
                                prev_cap = _seen_caps.get(pid, 0)
                                if cap_hex == prev_cap:
                                    continue
                                _seen_caps[pid] = cap_hex

                            # Decode which capabilities are set
                            cap_names = []
                            cap_definitions = {
                                0:  "cap_chown",
                                1:  "cap_dac_override",
                                2:  "cap_dac_read_search",
                                3:  "cap_fowner",
                                4:  "cap_fsetid",
                                5:  "cap_kill",
                                6:  "cap_setgid",
                                7:  "cap_setuid",
                                8:  "cap_setpcap",
                                9:  "cap_linux_immutable",
                                10: "cap_net_bind_service",
                                11: "cap_net_broadcast",
                                12: "cap_net_admin",
                                13: "cap_net_raw",
                                14: "cap_ipc_lock",
                                21: "cap_sys_admin",
                                22: "cap_sys_boot",
                                23: "cap_sys_nice",
                                24: "cap_sys_resource",
                                25: "cap_sys_time",
                                26: "cap_sys_tty_config",
                                27: "cap_mknod",
                                19: "cap_sys_ptrace",
                                16: "cap_sys_module",
                                17: "cap_sys_rawio",
                                18: "cap_sys_chroot",
                            }
                            for bit, name in cap_definitions.items():
                                if cap_hex & (1 << bit):
                                    cap_names.append(name)

                            dangerous = [c for c in cap_names
                                         if c in DANGEROUS_CAPS]
                            if dangerous:
                                try:
                                    comm = _proc_attr(pid, "comm").strip()
                                    cmdline = _proc_attr(pid, "cmdline")\
                                        .replace("\x00", " ").strip()
                                    uid_match = re.search(
                                        r"Uid:\s+(\d+)", status)
                                    uid = int(uid_match.group(1)) \
                                        if uid_match else -1
                                    # Don't alert on root-owned system processes
                                    # with expected caps
                                    trusted_with_caps = {
                                        "ping","ping6","sudo","su",
                                        "newgrp","passwd","chsh","chfn",
                                        "polkit","pkexec","dbus-daemon",
                                        "systemd","NetworkManager",
                                    }
                                    if uid != 0 and comm not in trusted_with_caps:
                                        msg = (f"[PRIVESC][CAPABILITIES] "
                                               f"Non-root process with dangerous "
                                               f"capabilities: PID:{pid} "
                                               f"comm:'{comm}' UID:{uid} "
                                               f"Caps:{','.join(dangerous)} "
                                               f"CMD:{cmdline[:120]}")
                                        log(msg)
                                        ship_event("[PRIVESC]", "critical",
                                                   "SENSITIVE", msg)
                                except Exception:
                                    pass

                        # ── Check for namespace escapes ───────────────────────
                        # User namespace changes can indicate container escape
                        ns_userns = ""
                        try:
                            ns_userns = os.readlink(f"/proc/{pid}/ns/user")
                        except Exception:
                            pass
                        # Additional namespace escape checks can go here

                    except Exception:
                        pass
            except Exception as ex:
                log(f"[PRIVESC-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="PrivEscMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# CONTAINER ESCAPE MONITOR
# ═══════════════════════════════════════════════════════════════════════════════

def start_container_monitor():
    """
    Detects container escape attempts:
      - Running inside a container (/.dockerenv, cgroup v1)
      - Docker socket access from container processes
      - Dangerous container flags (privileged, host network, host pid)
      - Mount namespace anomalies
      - Writable /proc, /sys from inside container
      - runc escape patterns
    """
    if not config.get("monitor_containers"):
        return

    def _is_in_container() -> bool:
        return (os.path.exists("/.dockerenv") or
                os.path.exists("/.containerenv") or
                "docker" in _read_file_safe("/proc/1/cgroup") or
                "lxc"    in _read_file_safe("/proc/1/cgroup") or
                "kubepods" in _read_file_safe("/proc/1/cgroup"))

    in_container = _is_in_container()
    if in_container:
        log("[CONTAINER] Running inside a container — "
            "container escape detection active.")

    _docker_sock_alert = threading.Event()

    def _monitor():
        log("[MONITOR] Container escape monitor starting...")
        _reported_procs: set = set()

        while True:
            time.sleep(10)
            try:
                # ── Check 1: Docker socket access ─────────────────────────────
                for sock_path in ["/var/run/docker.sock",
                                   "/run/docker.sock"]:
                    if not os.path.exists(sock_path):
                        continue
                    if not HAS_PSUTIL:
                        continue
                    for proc in psutil.process_iter(["pid","name","uids"]):
                        try:
                            for f in proc.open_files():
                                if f.path == sock_path:
                                    uid = (proc.info.get("uids") or [0])[0]
                                    key = (proc.pid, sock_path)
                                    if key in _reported_procs:
                                        continue
                                    _reported_procs.add(key)
                                    # Docker socket access from non-root
                                    # non-docker-daemon process is suspicious
                                    trusted = {"dockerd","containerd",
                                               "docker","podman"}
                                    if proc.info.get("name","") not in trusted:
                                        msg = (f"[CONTAINER-ESCAPE][DOCKER-SOCK] "
                                               f"Process accessing Docker socket: "
                                               f"'{proc.info.get('name')}' "
                                               f"PID:{proc.pid} UID:{uid}")
                                        log(msg)
                                        ship_event("[CONTAINER-ESCAPE]",
                                                   "critical", "SENSITIVE", msg)
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass

                # ── Check 2: Privileged container indicators ──────────────────
                if in_container:
                    # Can we write to /proc/sys? (privileged container)
                    try:
                        test_path = "/proc/sys/kernel/hostname"
                        if os.access(test_path, os.W_OK):
                            if not _docker_sock_alert.is_set():
                                _docker_sock_alert.set()
                                msg = ("[CONTAINER-ESCAPE][PRIVILEGED] "
                                       "Container appears to be running in "
                                       "privileged mode — /proc/sys is writable. "
                                       "Host escape is possible.")
                                log(msg)
                                ship_event("[CONTAINER-ESCAPE]", "critical",
                                           "SENSITIVE", msg)
                    except Exception:
                        pass

                    # Check if host /proc is mounted
                    mounts = _read_file_safe("/proc/mounts")
                    if "proc /proc" in mounts and "proc /host/proc" in mounts:
                        msg = ("[CONTAINER-ESCAPE][HOST-PROC] "
                               "Host /proc appears to be mounted inside container.")
                        log(msg)
                        ship_event("[CONTAINER-ESCAPE]", "critical",
                                   "SENSITIVE", msg)

                # ── Check 3: Namespace manipulation ──────────────────────────
                # nsenter / unshare from unexpected contexts
                if HAS_PSUTIL:
                    for proc in psutil.process_iter(["pid","name","cmdline"]):
                        try:
                            name = proc.info.get("name","").lower()
                            cmd  = " ".join(proc.info.get("cmdline") or [])
                            if name in ("nsenter","unshare"):
                                key = proc.pid
                                if key in _reported_procs:
                                    continue
                                _reported_procs.add(key)
                                msg = (f"[CONTAINER-ESCAPE][NAMESPACE] "
                                       f"Namespace manipulation: '{name}' "
                                       f"PID:{proc.pid} CMD:{cmd[:150]}")
                                log(msg)
                                ship_event("[CONTAINER-ESCAPE]", "high",
                                           "SENSITIVE", msg)
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass

            except Exception as ex:
                log(f"[CONTAINER-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="ContainerMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# DNS MONITOR
# Detects C2 via DNS, DGA domains, DNS tunneling
# ═══════════════════════════════════════════════════════════════════════════════

def start_dns_monitor():
    """
    Monitor DNS queries by watching /proc/net/dns or tailing resolve logs.
    Primary method: watch processes that open :53 connections.
    Secondary method: monitor /var/log/syslog for DNS queries if dnscrypt/pihole.
    """
    if not config.get("monitor_dns") or not HAS_PSUTIL:
        return

    _seen_dns: dict = {}   # domain → first_seen
    _dns_lock        = threading.Lock()
    _dns_burst: dict = defaultdict(list)  # pid → [timestamps] for tunnel detect

    def _check_dns_connections():
        """Watch for processes making large numbers of DNS queries (tunneling)."""
        while True:
            time.sleep(10)
            try:
                now = datetime.now(timezone.utc)
                for conn in psutil.net_connections(kind="udp"):
                    if not conn.raddr:
                        continue
                    if conn.raddr.port != 53:
                        continue
                    pid = conn.pid or 0
                    if pid == 0:
                        continue
                    with _dns_lock:
                        _dns_burst[pid].append(now)
                        # Keep only last 30 seconds
                        cutoff = now - timedelta(seconds=30)
                        _dns_burst[pid] = [
                            t for t in _dns_burst[pid] if t >= cutoff
                        ]
                        count = len(_dns_burst[pid])

                    # More than 20 DNS queries in 30s = possible tunneling
                    if count >= 20:
                        try:
                            proc = psutil.Process(pid)
                            name = proc.name()
                            cmd  = " ".join(proc.cmdline())[:150]
                            with _dns_lock:
                                if f"tunnel|{pid}" not in _seen_dns:
                                    _seen_dns[f"tunnel|{pid}"] = now
                                    msg = (f"[NETWORK][DNS-TUNNEL] "
                                           f"Possible DNS tunneling: "
                                           f"'{name}' PID:{pid} "
                                           f"{count} DNS queries/30s "
                                           f"CMD:{cmd}")
                                    log(msg)
                                    ship_event("[NETWORK][DNS-TUNNEL]",
                                               "high", "NETWORK", msg)
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass

            except Exception as ex:
                log(f"[DNS-MONITOR-ERR] {ex}")

    def _watch_dns_logs():
        """Watch syslog/systemd journal for suspicious domain lookups."""
        log_paths = [
            "/var/log/syslog",
            "/var/log/messages",
            "/var/log/dnsmasq.log",
        ]
        log_path = next((p for p in log_paths if os.path.exists(p)), None)
        if not log_path:
            return

        log(f"[MONITOR] DNS log monitor on {log_path}")
        # Pattern matches dnsmasq, bind, systemd-resolved query logs
        dns_re = re.compile(
            r"query\[A+\]\s+(\S+)\s+from|"
            r"QUERY:\s+(\S+)\s+IN\s+A|"
            r"resolve\.conf.*(\S+\.\S+)",
            re.IGNORECASE
        )
        for line in _tail_file(log_path):
            try:
                m = dns_re.search(line)
                if not m:
                    continue
                domain = next((g for g in m.groups() if g), None)
                if not domain:
                    continue
                domain = domain.rstrip(".").lower()

                # Check against suspicious patterns
                if SUSPICIOUS_DNS_RE.search(domain):
                    with _dns_lock:
                        if domain in _seen_dns:
                            continue
                        _seen_dns[domain] = datetime.now(timezone.utc)
                    msg = (f"[NETWORK][SUSPICIOUS-DNS] Suspicious DNS query: "
                           f"'{domain}' — possible C2/DGA/tunnel domain")
                    log(msg)
                    ship_event("[NETWORK][SUSPICIOUS-DNS]",
                               "high", "NETWORK", msg)

                # High-entropy domain (DGA indicator)
                if _is_high_entropy_domain(domain):
                    with _dns_lock:
                        key = f"entropy|{domain}"
                        if key in _seen_dns:
                            continue
                        _seen_dns[key] = datetime.now(timezone.utc)
                    msg = (f"[NETWORK][DGA-DOMAIN] High-entropy domain "
                           f"(possible DGA C2): '{domain}'")
                    log(msg)
                    ship_event("[NETWORK][DGA-DOMAIN]", "medium",
                               "NETWORK", msg)

            except Exception:
                pass

    threading.Thread(target=_check_dns_connections, daemon=True,
                     name="DNSConnMonitor").start()
    threading.Thread(target=_watch_dns_logs, daemon=True,
                     name="DNSLogMonitor").start()

def _is_high_entropy_domain(domain: str) -> bool:
    """
    Detect algorithmically generated domains (DGA) using entropy.
    DGA domains have high character entropy in the hostname part.
    """
    import math
    parts = domain.split(".")
    if len(parts) < 2:
        return False
    hostname = parts[-2]  # second-level domain
    if len(hostname) < 8:
        return False
    # Shannon entropy
    freq = defaultdict(int)
    for c in hostname:
        freq[c] += 1
    entropy = -sum(
        (n / len(hostname)) * math.log2(n / len(hostname))
        for n in freq.values()
    )
    # High entropy + no vowels = likely DGA
    vowels = sum(1 for c in hostname if c in "aeiou")
    vowel_ratio = vowels / len(hostname)
    # Legitimate domains tend to have entropy < 3.5 and vowel ratio > 0.2
    return entropy > 3.8 and vowel_ratio < 0.15 and len(hostname) > 12

# ═══════════════════════════════════════════════════════════════════════════════
# SSH KEY INJECTION MONITOR
# Detects backdoor SSH key additions in real time
# ═══════════════════════════════════════════════════════════════════════════════

def start_ssh_key_monitor():
    """
    Watches all authorized_keys files for additions.
    Also watches for new private keys appearing in .ssh directories.
    More targeted and faster than the general sensitive file monitor.
    """
    if not config.get("monitor_sensitive"):
        return

    _key_baselines: dict = {}  # path → set of key fingerprints

    def _get_key_fingerprints(path: str) -> set:
        """Extract public key fingerprints from authorized_keys."""
        fps = set()
        try:
            for line in open(path, errors="replace"):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                # Key format: [options] keytype base64 [comment]
                parts = line.split()
                for i, part in enumerate(parts):
                    if part in ("ssh-rsa","ssh-ed25519","ssh-ecdsa",
                                "ecdsa-sha2-nistp256","sk-ssh-ed25519@openssh.com"):
                        if i + 1 < len(parts):
                            # Use first 20 chars of base64 as fingerprint
                            fps.add(parts[i + 1][:20])
                        break
        except Exception:
            pass
        return fps

    def _get_all_auth_keys() -> list:
        """Find all authorized_keys files on the system."""
        paths = ["/root/.ssh/authorized_keys"]
        try:
            import pwd
            for p in pwd.getpwall():
                if p.pw_uid >= 500 and os.path.isdir(p.pw_dir):
                    ak = os.path.join(p.pw_dir, ".ssh", "authorized_keys")
                    if os.path.exists(ak):
                        paths.append(ak)
        except Exception:
            pass
        return list(set(paths))

    def _monitor():
        log("[MONITOR] SSH key injection monitor starting...")

        # Baseline all existing authorized_keys
        for path in _get_all_auth_keys():
            _key_baselines[path] = _get_key_fingerprints(path)

        while True:
            time.sleep(5)
            try:
                current_paths = _get_all_auth_keys()

                for path in current_paths:
                    current_fps = _get_key_fingerprints(path)
                    baseline    = _key_baselines.get(path, set())

                    new_keys = current_fps - baseline
                    if new_keys:
                        count = len(new_keys)
                        msg = (f"[SENSITIVE][SSH-KEY-INJECT] "
                               f"New SSH key(s) added to '{path}': "
                               f"{count} new key(s) detected")
                        log(msg)
                        ship_event("[SENSITIVE][SSH-KEY-INJECT]",
                                   "critical", "SENSITIVE", msg)

                    _key_baselines[path] = current_fps

                # New authorized_keys files that didn't exist before
                for path in current_paths:
                    if path not in _key_baselines:
                        _key_baselines[path] = _get_key_fingerprints(path)
                        msg = (f"[SENSITIVE][SSH-KEY-FILE-CREATED] "
                               f"New authorized_keys file created: '{path}'")
                        log(msg)
                        ship_event("[SENSITIVE][SSH-KEY-FILE-CREATED]",
                                   "critical", "SENSITIVE", msg)

            except Exception as ex:
                log(f"[SSH-KEY-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="SSHKeyMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# /ETC/PASSWD NEW USER MONITOR
# Detects new user accounts added to the system
# ═══════════════════════════════════════════════════════════════════════════════

def start_user_account_monitor():
    """
    Monitors /etc/passwd and /etc/group for new entries.
    The general sensitive file monitor only catches mtime changes —
    this actually parses the file and alerts on specific additions.
    """

    def _parse_passwd() -> dict:
        users = {}
        try:
            for line in open("/etc/passwd", errors="replace"):
                parts = line.strip().split(":")
                if len(parts) >= 4:
                    users[parts[0]] = {
                        "uid":   int(parts[2]) if parts[2].isdigit() else -1,
                        "gid":   int(parts[3]) if parts[3].isdigit() else -1,
                        "home":  parts[5] if len(parts) > 5 else "",
                        "shell": parts[6] if len(parts) > 6 else "",
                    }
        except Exception:
            pass
        return users

    def _parse_group() -> dict:
        groups = {}
        try:
            for line in open("/etc/group", errors="replace"):
                parts = line.strip().split(":")
                if len(parts) >= 4:
                    groups[parts[0]] = {
                        "gid":     int(parts[2]) if parts[2].isdigit() else -1,
                        "members": parts[3].split(",") if parts[3] else [],
                    }
        except Exception:
            pass
        return groups

    def _is_login_shell(shell: str) -> bool:
        nologin = {"/sbin/nologin", "/usr/sbin/nologin",
                   "/bin/false", "/usr/bin/false", ""}
        return shell not in nologin

    # Privileged groups
    PRIV_GROUPS = {
        "sudo", "wheel", "admin", "root",
        "docker",    # docker group = root equivalent
        "lxd",       # lxd group = root equivalent
        "adm",       # read system logs
        "shadow",    # read /etc/shadow
        "disk",      # raw disk access
        "video",     # gpu/framebuffer
        "staff",     # /usr/local write
    }

    def _monitor():
        log("[MONITOR] User account monitor starting...")
        passwd_baseline = _parse_passwd()
        group_baseline  = _parse_group()

        while True:
            time.sleep(10)
            try:
                # ── New/modified users ────────────────────────────────────────
                current_passwd = _parse_passwd()
                for uname, info in current_passwd.items():
                    if uname not in passwd_baseline:
                        uid      = info["uid"]
                        shell    = info["shell"]
                        is_login = _is_login_shell(shell)
                        sev      = "critical" if is_login or uid == 0 else "high"
                        msg = (f"[CONFIG-CHANGE][NEW-USER] New user account: "
                               f"'{uname}' UID:{uid} Shell:{shell} "
                               f"Home:{info['home']} "
                               f"LoginShell:{is_login}")
                        log(msg)
                        ship_event("[CONFIG-CHANGE][NEW-USER]",
                                   sev, "CONFIG", msg)

                    elif passwd_baseline[uname] != info:
                        changes = []
                        old = passwd_baseline[uname]
                        if old["uid"] != info["uid"]:
                            changes.append(f"UID:{old['uid']}→{info['uid']}")
                        if old["shell"] != info["shell"]:
                            changes.append(f"Shell:{old['shell']}→{info['shell']}")
                        if old["home"] != info["home"]:
                            changes.append(f"Home:{old['home']}→{info['home']}")
                        if changes:
                            msg = (f"[CONFIG-CHANGE][USER-MODIFIED] "
                                   f"User account modified: '{uname}' "
                                   f"Changes:{', '.join(changes)}")
                            log(msg)
                            ship_event("[CONFIG-CHANGE][USER-MODIFIED]",
                                       "high", "CONFIG", msg)

                passwd_baseline = current_passwd

                # ── Group membership changes ──────────────────────────────────
                current_group = _parse_group()
                for gname, info in current_group.items():
                    if gname not in group_baseline:
                        if gname in PRIV_GROUPS:
                            msg = (f"[CONFIG-CHANGE][NEW-PRIV-GROUP] "
                                   f"New privileged group: '{gname}' "
                                   f"GID:{info['gid']} "
                                   f"Members:{info['members']}")
                            log(msg)
                            ship_event("[CONFIG-CHANGE][NEW-PRIV-GROUP]",
                                       "high", "CONFIG", msg)
                        continue

                    old_members = set(group_baseline[gname]["members"])
                    new_members = set(info["members"])
                    added   = new_members - old_members - {""}
                    removed = old_members - new_members - {""}

                    if added:
                        sev = "critical" if gname in PRIV_GROUPS else "medium"
                        msg = (f"[CONFIG-CHANGE][GROUP-MEMBER-ADDED] "
                               f"Users added to group '{gname}': "
                               f"{', '.join(added)} "
                               f"PrivilegedGroup:{gname in PRIV_GROUPS}")
                        log(msg)
                        ship_event("[CONFIG-CHANGE][GROUP-MEMBER-ADDED]",
                                   sev, "CONFIG", msg)
                    if removed:
                        msg = (f"[CONFIG-CHANGE][GROUP-MEMBER-REMOVED] "
                               f"Users removed from group '{gname}': "
                               f"{', '.join(removed)}")
                        log(msg)
                        ship_event("[CONFIG-CHANGE][GROUP-MEMBER-REMOVED]",
                                   "low", "CONFIG", msg)

                group_baseline = current_group

            except Exception as ex:
                log(f"[USER-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="UserAccountMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED SENSITIVE FILE MONITOR
# Adds: permission changes, ownership changes, deletion, read access,
#       kernel parameter checking, dynamic file list
# ═══════════════════════════════════════════════════════════════════════════════

def start_sensitive_file_monitor():
    if not config.get("monitor_sensitive"):
        return

    def _build_snapshot(files: dict) -> dict:
        snap = {}
        for p in files:
            try:
                if os.path.exists(p):
                    st = os.stat(p)
                    snap[p] = {
                        "mtime": st.st_mtime,
                        "size":  st.st_size,
                        "mode":  st.st_mode,
                        "uid":   st.st_uid,
                        "gid":   st.st_gid,
                    }
            except Exception:
                pass
        return snap

    def _monitor():
        global _sensitive_baseline
        all_files = get_all_sensitive_files()
        baseline  = _build_snapshot(all_files)
        log(f"[MONITOR] Sensitive file monitor: watching {len(baseline)} files.")

        cycle = 0
        while True:
            time.sleep(10)
            cycle += 1
            try:
                # Rebuild dynamic file list every minute
                if cycle % 6 == 0:
                    all_files = get_all_sensitive_files()

                current = _build_snapshot(all_files)

                for path, desc in all_files.items():
                    cur = current.get(path)
                    old = baseline.get(path)

                    if cur is None and old is not None:
                        # File was deleted
                        msg = (f"[SENSITIVE][FILE-DELETED] "
                               f"Sensitive file deleted: '{path}' ({desc})")
                        log(msg)
                        ship_event("[SENSITIVE][FILE-DELETED]",
                                   "critical", "SENSITIVE", msg)
                        baseline.pop(path, None)
                        continue

                    if cur is None:
                        continue

                    if old is None:
                        # New file appeared
                        msg = (f"[SENSITIVE][FILE-CREATED] "
                               f"New sensitive file: '{path}' ({desc})")
                        log(msg)
                        ship_event("[SENSITIVE][FILE-CREATED]",
                                   "high", "SENSITIVE", msg)
                        baseline[path] = cur
                        continue

                    # Content changed
                    if cur["mtime"] != old["mtime"] or \
                       cur["size"]  != old["size"]:
                        msg = (f"[SENSITIVE][FILE-MODIFIED] "
                               f"'{path}' content changed ({desc})")
                        log(msg)
                        ship_event("[SENSITIVE][FILE-MODIFIED]",
                                   "critical", "SENSITIVE", msg)

                    # Permissions changed
                    if cur["mode"] != old["mode"]:
                        msg = (f"[SENSITIVE][PERM-CHANGED] "
                               f"'{path}' permissions {oct(old['mode'])} → "
                               f"{oct(cur['mode'])} ({desc})")
                        log(msg)
                        ship_event("[SENSITIVE][PERM-CHANGED]",
                                   "critical", "SENSITIVE", msg)

                    # Ownership changed
                    if cur["uid"] != old["uid"] or cur["gid"] != old["gid"]:
                        msg = (f"[SENSITIVE][OWNER-CHANGED] '{path}' ownership "
                               f"uid:{old['uid']}→{cur['uid']} "
                               f"gid:{old['gid']}→{cur['gid']} ({desc})")
                        log(msg)
                        ship_event("[SENSITIVE][OWNER-CHANGED]",
                                   "critical", "SENSITIVE", msg)

                    baseline[path] = cur

                # Check kernel runtime values every 6 cycles (60s)
                if cycle % 6 == 0:
                    _check_kernel_params()

            except Exception as ex:
                log(f"[SENSITIVE-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="SensitiveFileMonitor").start()

    # Also start inotify read monitor if available
    if HAS_INOTIFY:
        start_read_access_monitor()

_kernel_param_alerted: set = set()

def _check_kernel_params():
    """Spot-check critical kernel parameters for attacker modifications."""
    for path, expected, description, severity in KERNEL_CHECKS:
        try:
            if not os.path.exists(path):
                continue
            actual = _read_file_safe(path)
            if actual == expected:
                # Value restored — clear any previous alert
                _kernel_param_alerted.discard(path)
                continue
            if path in _kernel_param_alerted:
                continue
            _kernel_param_alerted.add(path)
            msg = (f"[SENSITIVE][KERNEL-PARAM] '{path}' = '{actual}' "
                   f"(expected '{expected}') — {description}")
            log(msg)
            ship_event("[SENSITIVE][KERNEL-PARAM]", severity,
                       "SENSITIVE", msg)
        except Exception:
            pass

# ═══════════════════════════════════════════════════════════════════════════════
# INOTIFY READ ACCESS MONITOR
# Catches reads of credential files — cat /etc/shadow etc.
# ═══════════════════════════════════════════════════════════════════════════════

def start_read_access_monitor():
    """
    Detect READ access on credential files using inotify IN_ACCESS.
    Only works as root. Pyinotify is already imported.
    """
    if not HAS_INOTIFY or os.geteuid() != 0:
        return

    HIGH_VALUE_READS = {
        "/etc/shadow":              "Password hashes",
        "/etc/gshadow":             "Group hashes",
        "/etc/sudoers":             "Sudo config",
        "/root/.ssh/id_rsa":        "Root private key",
        "/root/.ssh/id_ed25519":    "Root private key",
    }

    # Add all user private keys
    try:
        import pwd
        for p in pwd.getpwall():
            if p.pw_uid >= 500 and os.path.isdir(p.pw_dir):
                for key in ["id_rsa","id_ed25519","id_ecdsa"]:
                    kp = os.path.join(p.pw_dir, ".ssh", key)
                    if os.path.exists(kp):
                        HIGH_VALUE_READS[kp] = f"Private key ({p.pw_name})"
    except Exception:
        pass

    _read_dedup: dict = {}
    _read_lock         = threading.Lock()

    def _monitor():
        try:
            wm   = pyinotify.WatchManager()
            mask = pyinotify.IN_ACCESS | pyinotify.IN_OPEN

            class ReadHandler(pyinotify.ProcessEvent):
                def process_IN_ACCESS(self, event):
                    path = event.pathname
                    desc = HIGH_VALUE_READS.get(path, "Credential file")
                    with _read_lock:
                        last = _read_dedup.get(path)
                        now  = datetime.now(timezone.utc)
                        if last and (now - last).seconds < 30:
                            return
                        _read_dedup[path] = now

                    accessor = _find_file_accessor(path)
                    msg = (f"[CREDENTIAL-ACCESS][FILE-READ] "
                           f"'{path}' was READ ({desc}) "
                           f"— Accessor: {accessor}")
                    log(msg)
                    ship_event("[CREDENTIAL-ACCESS]",
                               "high", "SENSITIVE", msg)

            notifier = pyinotify.Notifier(wm, ReadHandler())
            watched  = 0
            for path in HIGH_VALUE_READS:
                if os.path.exists(path):
                    wm.add_watch(path, mask)
                    watched += 1

            log(f"[MONITOR] Read access monitor: watching {watched} "
                f"credential files.")
            notifier.loop()
        except Exception as ex:
            log(f"[READ-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="ReadAccessMonitor").start()

def _find_file_accessor(path: str) -> str:
    """Find the process currently holding a file open."""
    if not HAS_PSUTIL:
        return "unknown"
    try:
        for proc in psutil.process_iter(["pid","name","cmdline"]):
            try:
                for f in proc.open_files():
                    if f.path == path:
                        cmd = " ".join(proc.info.get("cmdline") or [])[:80]
                        return (f"PID:{proc.pid} '{proc.info['name']}' "
                                f"CMD:{cmd}")
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    return "unknown"

# ═══════════════════════════════════════════════════════════════════════════════
# CRON CONTENT MONITOR
# Checks actual content of cron jobs, not just file changes
# ═══════════════════════════════════════════════════════════════════════════════

def start_cron_content_monitor():
    """
    Parses cron job contents for suspicious commands.
    The persistence monitor detects file changes, but doesn't read the content.
    This monitor actually checks what the cron jobs do.
    """
    CRON_PATHS = [
        "/etc/crontab",
        "/etc/cron.d/",
        "/var/spool/cron/",
        "/var/spool/cron/crontabs/",
    ]

    # Commands in cron that are always suspicious
    SUSPICIOUS_CRON_RE = re.compile(
        r"(curl|wget)\s+.*\|\s*(bash|sh|python|perl)|"
        r"base64\s+--decode|"
        r"/dev/tcp/|/dev/udp/|"
        r"nc\s+-[el]|ncat\s+-[el]|"
        r"python\s+-c|perl\s+-e|ruby\s+-e|"
        r"bash\s+-i|sh\s+-i|"
        r"rm\s+-rf\s+/|"
        r"chmod\s+777|"
        r"useradd|adduser|"
        r"echo.*>>.*/etc/passwd|"
        r"echo.*>>.*/etc/sudoers|"
        r"iptables\s+-F|"
        r"systemctl\s+stop|systemctl\s+disable|"
        r"/tmp/[a-zA-Z0-9_]{4,}\s|"
        r"/dev/shm/",
        re.IGNORECASE
    )

    _cron_content_hash: dict = {}  # path → sha256

    def _check_cron_files():
        """Scan all cron files for suspicious content."""
        for base in CRON_PATHS:
            try:
                if os.path.isfile(base):
                    _check_single_cron(base)
                elif os.path.isdir(base):
                    for f in os.listdir(base):
                        fp = os.path.join(base, f)
                        if os.path.isfile(fp):
                            _check_single_cron(fp)
            except Exception:
                pass

    def _check_single_cron(path: str):
        try:
            content = open(path, errors="replace").read()
            content_hash = hashlib.sha256(
                content.encode()).hexdigest()

            # Only re-check if content changed
            if _cron_content_hash.get(path) == content_hash:
                return
            _cron_content_hash[path] = content_hash

            for lineno, line in enumerate(content.splitlines(), 1):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                # Skip time fields for crontab format
                fields = line.split()
                if len(fields) < 6:
                    continue
                # The command part starts at index 5 (after 5 time fields)
                cmd = " ".join(fields[5:]) if len(fields) > 5 else ""

                if SUSPICIOUS_CRON_RE.search(cmd):
                    msg = (f"[PERSISTENCE][CRON-SUSPICIOUS] "
                           f"Suspicious cron command in '{path}' "
                           f"line {lineno}: {cmd[:200]}")
                    log(msg)
                    ship_event("[PERSISTENCE][CRON-SUSPICIOUS]",
                               "critical", "TASKS", msg)

                # Cron running from /tmp or /dev/shm
                risky_dirs = ["/tmp/", "/dev/shm/", "/var/tmp/"]
                if any(d in cmd for d in risky_dirs):
                    msg = (f"[PERSISTENCE][CRON-RISKY-PATH] "
                           f"Cron job executing from risky path "
                           f"in '{path}' line {lineno}: {cmd[:200]}")
                    log(msg)
                    ship_event("[PERSISTENCE][CRON-RISKY-PATH]",
                               "high", "TASKS", msg)

        except Exception:
            pass

    def _monitor():
        log("[MONITOR] Cron content monitor starting...")
        _check_cron_files()  # Initial check

        while True:
            time.sleep(60)
            try:
                _check_cron_files()
            except Exception as ex:
                log(f"[CRON-CONTENT-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="CronContentMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# ENVIRONMENT VARIABLE MONITOR
# Detects LD_PRELOAD / LD_LIBRARY_PATH in running processes
# ═══════════════════════════════════════════════════════════════════════════════

def start_env_monitor():
    """
    Scans /proc/pid/environ for dangerous environment variables.
    LD_PRELOAD in a running process is a live rootkit indicator.
    """
    if not HAS_PSUTIL:
        return

    _reported: set = set()

    DANGEROUS_ENV_VARS = {
        "LD_PRELOAD":       "Library injection — rootkit vector",
        "LD_LIBRARY_PATH":  "Library path hijacking",
        "DYLD_INSERT_LIBRARIES": "macOS library injection",
        "LD_AUDIT":         "Audit library injection",
        "LD_DEBUG":         "Dynamic linker debug — info leak",
        "PYTHONPATH":       "Python module hijacking",
        "PERL5LIB":         "Perl library hijacking",
        "RUBYLIB":          "Ruby library hijacking",
        "NODE_PATH":        "Node.js module hijacking",
        "JAVA_TOOL_OPTIONS":"JVM agent injection",
        "_JAVA_OPTIONS":    "JVM options injection",
    }

    def _monitor():
        log("[MONITOR] Environment variable monitor starting...")
        while True:
            time.sleep(15)
            try:
                for entry in os.scandir("/proc"):
                    if not entry.name.isdigit():
                        continue
                    pid = int(entry.name)
                    try:
                        env_raw = open(
                            f"/proc/{pid}/environ", "rb"
                        ).read().decode(errors="replace")
                        env_vars = dict(
                            kv.split("=", 1) if "=" in kv else (kv, "")
                            for kv in env_raw.split("\x00")
                            if kv
                        )

                        for var, desc in DANGEROUS_ENV_VARS.items():
                            if var not in env_vars:
                                continue
                            value = env_vars[var]
                            if not value:
                                continue
                            key = f"{pid}|{var}|{value[:30]}"
                            if key in _reported:
                                continue
                            _reported.add(key)

                            comm = _proc_attr(pid, "comm").strip()

                            # LD_PRELOAD pointing to /tmp or /dev/shm is
                            # always critical — that's the rootkit pattern
                            risky = any(
                                r in value
                                for r in ["/tmp/","/dev/shm/","/var/tmp/"]
                            )
                            sev = "critical" if risky else "high"

                            msg = (f"[DEFENSE-EVASION][ENV-INJECT] "
                                   f"{var}={value[:80]} in process "
                                   f"'{comm}' PID:{pid} — {desc}")
                            log(msg)
                            ship_event("[DEFENSE-EVASION][ENV-INJECT]",
                                       sev, "SENSITIVE", msg)

                    except (PermissionError, FileNotFoundError):
                        pass
                    except Exception:
                        pass

                # Clean up dead PIDs
                if len(_reported) > 2000:
                    _reported.clear()

            except Exception as ex:
                log(f"[ENV-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="EnvMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEMD TIMER ABUSE MONITOR
# ═══════════════════════════════════════════════════════════════════════════════

def start_systemd_monitor():
    """
    Detects new systemd services and timers that could be persistence mechanisms.
    More targeted than the general persistence monitor.
    """

    _known_units: set = set()

    def _get_enabled_units() -> set:
        units = set()
        try:
            out = run_cmd(["systemctl", "list-unit-files",
                           "--state=enabled", "--no-pager", "--no-legend"])
            for line in out.splitlines():
                parts = line.split()
                if parts:
                    units.add(parts[0])
        except Exception:
            pass
        return units

    def _get_active_timers() -> list:
        timers = []
        try:
            out = run_cmd(["systemctl", "list-timers",
                           "--no-pager", "--no-legend"])
            for line in out.splitlines():
                if ".timer" in line:
                    timers.append(line.strip())
        except Exception:
            pass
        return timers

    def _check_unit_content(unit_name: str):
        """Check the content of a systemd unit for suspicious commands."""
        search_dirs = [
            "/etc/systemd/system/",
            "/usr/lib/systemd/system/",
            f"/home/{os.environ.get('USER','')}"
            f"/.config/systemd/user/",
        ]
        for d in search_dirs:
            path = os.path.join(d, unit_name)
            if not os.path.exists(path):
                continue
            try:
                content = open(path, errors="replace").read()
                # Check ExecStart for suspicious commands
                exec_match = re.findall(
                    r"ExecStart\s*=\s*(.+)", content, re.IGNORECASE)
                for cmd in exec_match:
                    if SUSPICIOUS_CMDS_RE.search(cmd):
                        msg = (f"[PERSISTENCE][SYSTEMD-SUSPICIOUS] "
                               f"Suspicious systemd unit '{unit_name}': "
                               f"ExecStart={cmd[:200]}")
                        log(msg)
                        ship_event("[PERSISTENCE][SYSTEMD-SUSPICIOUS]",
                                   "critical", "SERVICES", msg)

                    # Executing from /tmp, /dev/shm etc.
                    risky_dirs = ["/tmp/","/dev/shm/","/var/tmp/"]
                    if any(r in cmd for r in risky_dirs):
                        msg = (f"[PERSISTENCE][SYSTEMD-RISKY-PATH] "
                               f"Systemd unit '{unit_name}' executes "
                               f"from risky path: {cmd[:150]}")
                        log(msg)
                        ship_event("[PERSISTENCE][SYSTEMD-RISKY-PATH]",
                                   "high", "SERVICES", msg)
            except Exception:
                pass

    def _monitor():
        log("[MONITOR] Systemd monitor starting...")
        _known_units.update(_get_enabled_units())

        while True:
            time.sleep(30)
            try:
                current_units = _get_enabled_units()
                new_units     = current_units - _known_units

                for unit in new_units:
                    is_timer   = unit.endswith(".timer")
                    is_service = unit.endswith(".service")
                    cat        = "timer" if is_timer else "service"

                    msg = (f"[PERSISTENCE][SYSTEMD-NEW-{cat.upper()}] "
                           f"New systemd {cat} enabled: '{unit}'")
                    log(msg)
                    ship_event(f"[PERSISTENCE][SYSTEMD-NEW-{cat.upper()}]",
                               "high", "SERVICES", msg)

                    # Check the unit file content
                    _check_unit_content(unit)

                _known_units.update(new_units)

            except Exception as ex:
                log(f"[SYSTEMD-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="SystemdMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# CORE DUMP MONITOR
# Credential leakage via core dumps
# ═══════════════════════════════════════════════════════════════════════════════

def start_core_dump_monitor():
    """
    Core dumps can contain plaintext credentials, keys, and tokens.
    Alert whenever a new core dump is created anywhere on the system.
    """
    CORE_DIRS = ["/tmp", "/var/tmp", "/var/crash",
                 "/var/lib/systemd/coredump", "/proc/sys/kernel"]
    CORE_PATTERNS = ["core", "core.*", "*.core", "coredump-*"]

    _known_cores: set = set()

    def _find_cores() -> set:
        cores = set()
        for d in CORE_DIRS:
            if not os.path.isdir(d):
                continue
            try:
                for f in os.listdir(d):
                    if re.match(r"^core($|\.|dump)", f, re.IGNORECASE):
                        cores.add(os.path.join(d, f))
            except Exception:
                pass
        # Also check coredumpctl if available
        try:
            out = run_cmd(["coredumpctl", "list", "--no-pager",
                           "--no-legend", "-q"])
            for line in out.splitlines():
                if line.strip():
                    cores.add(f"coredumpctl:{line[:80]}")
        except Exception:
            pass
        return cores

    def _monitor():
        log("[MONITOR] Core dump monitor starting...")
        _known_cores.update(_find_cores())

        while True:
            time.sleep(15)
            try:
                current_cores = _find_cores()
                new_cores     = current_cores - _known_cores
                for core in new_cores:
                    size = ""
                    try:
                        if not core.startswith("coredumpctl:"):
                            size = f" Size:{os.path.getsize(core)}B"
                    except Exception:
                        pass
                    msg = (f"[CREDENTIAL-ACCESS][CORE-DUMP] "
                           f"New core dump created: '{core}'{size} — "
                           f"may contain plaintext passwords, keys, tokens. "
                           f"Delete immediately if unexpected.")
                    log(msg)
                    ship_event("[CREDENTIAL-ACCESS][CORE-DUMP]",
                               "high", "SENSITIVE", msg)
                _known_cores.update(new_cores)
            except Exception as ex:
                log(f"[CORE-DUMP-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="CoreDumpMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRITY CHECK ON STARTUP
# Checks system against known-good state indicators
# ═══════════════════════════════════════════════════════════════════════════════

def run_startup_integrity_check():
    """
    Runs on startup to look for signs of a pre-compromised system.
    Checks things that wouldn't be caught by the real-time monitors
    because they were set before IOC Hunt started.
    """
    if not config.get("monitor_integrity"):
        return

    log("[INTEGRITY] Running startup integrity check...")
    findings = []

    # 1. LD_PRELOAD set in environment
    ld_preload = os.environ.get("LD_PRELOAD", "")
    if ld_preload:
        findings.append(
            f"[INTEGRITY] LD_PRELOAD is set in environment: '{ld_preload}'")

    # 2. /etc/ld.so.preload exists and is non-empty
    if os.path.exists("/etc/ld.so.preload"):
        content = _read_file_safe("/etc/ld.so.preload")
        if content:
            findings.append(
                f"[INTEGRITY] /etc/ld.so.preload non-empty: '{content[:200]}' "
                f"— rootkit indicator")

    # 3. Check ASLR
    aslr = _read_file_safe("/proc/sys/kernel/randomize_va_space")
    if aslr != "2":
        findings.append(
            f"[INTEGRITY] ASLR is disabled (value={aslr})")

    # 4. IP forwarding enabled
    ip_fwd = _read_file_safe("/proc/sys/net/ipv4/ip_forward")
    if ip_fwd == "1":
        findings.append(
            "[INTEGRITY] IP forwarding is enabled — "
            "machine may be used as network pivot")

    # 5. Unexpected SUID files in /tmp, /dev/shm
    for risky_dir in ["/tmp", "/dev/shm", "/var/tmp"]:
        if not os.path.isdir(risky_dir):
            continue
        try:
            for f in os.listdir(risky_dir):
                fp = os.path.join(risky_dir, f)
                try:
                    mode = os.stat(fp).st_mode
                    if mode & 0o4000:
                        findings.append(
                            f"[INTEGRITY] SUID file in risky location: '{fp}'")
                except Exception:
                    pass
        except Exception:
            pass

    # 6. Executables in /dev/shm
    if os.path.isdir("/dev/shm"):
        try:
            for f in os.listdir("/dev/shm"):
                fp = os.path.join("/dev/shm", f)
                try:
                    if os.path.isfile(fp) and os.access(fp, os.X_OK):
                        findings.append(
                            f"[INTEGRITY] Executable in /dev/shm: '{fp}'")
                except Exception:
                    pass
        except Exception:
            pass

    # 7. Check for known rootkit files
    ROOTKIT_INDICATORS = [
        "/etc/ld.so.preload",
        "/dev/.initramfs",
        "/dev/initctl",
        "/dev/shm/.x",
        "/tmp/.font-unix/.bash_history",
        "/usr/lib/libprocesshider.so",
        "/usr/local/lib/libprocesshider.so",
    ]
    for path in ROOTKIT_INDICATORS:
        if os.path.exists(path):
            findings.append(
                f"[INTEGRITY] Known rootkit indicator file: '{path}'")

    # 8. Processes running from deleted files
    try:
        for entry in os.scandir("/proc"):
            if not entry.name.isdigit():
                continue
            try:
                exe = os.readlink(f"/proc/{entry.name}/exe")
                if "(deleted)" in exe:
                    comm = _proc_attr(int(entry.name), "comm").strip()
                    if comm not in {"kworker","ksoftirqd","migration","rcu"}:
                        findings.append(
                            f"[INTEGRITY] Process running from deleted exe: "
                            f"PID:{entry.name} comm:{comm} exe:{exe}")
            except Exception:
                pass
    except Exception:
        pass

    # 9. Check sudoers for NOPASSWD entries
    try:
        sudoers_content = open("/etc/sudoers", errors="replace").read()
        nopasswd = re.findall(
            r"^[^#].*NOPASSWD.*$", sudoers_content, re.MULTILINE)
        if nopasswd:
            findings.append(
                f"[INTEGRITY] NOPASSWD in sudoers: "
                f"{', '.join(nopasswd[:3])}")
    except Exception:
        pass

    # 10. World-writable files in /etc
    try:
        out = run_cmd(["find", "/etc", "-maxdepth", "2",
                       "-writable", "-not", "-type", "l"])
        world_writable = [
            f for f in out.splitlines()
            if f and not f.endswith(".swp")
        ]
        if world_writable:
            findings.append(
                f"[INTEGRITY] World-writable files in /etc: "
                f"{', '.join(world_writable[:5])}")
    except Exception:
        pass

    # 11. Check crontabs for suspicious entries at startup
    for path in ["/etc/crontab"] + glob.glob("/etc/cron.d/*"):
        try:
            content = open(path, errors="replace").read()
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("#") or not line:
                    continue
                if re.search(r"/tmp/|/dev/shm/|curl.*\|.*bash|"
                             r"wget.*\|.*sh|base64.*decode",
                             line, re.IGNORECASE):
                    findings.append(
                        f"[INTEGRITY] Suspicious cron entry in {path}: "
                        f"{line[:150]}")
        except Exception:
            pass

    # Report findings
    if findings:
        log(f"[INTEGRITY] ⚠ Startup check found {len(findings)} issue(s):")
        for f in findings:
            log(f)
            ship_event("[INTEGRITY]", "critical", "SENSITIVE", f)
    else:
        log("[INTEGRITY] ✔ Startup integrity check passed.")

# ═══════════════════════════════════════════════════════════════════════════════
# NETWORK MONITOR — unchanged from original but shown for completeness
# ═══════════════════════════════════════════════════════════════════════════════

def get_connections():
    if not HAS_PSUTIL:
        return []
    try:
        return [c for c in psutil.net_connections(kind="inet")
                if c.status == "ESTABLISHED" and c.raddr]
    except Exception:
        return []

def start_network_monitor():
    if not config.get("monitor_network"):
        return

    def _monitor():
        known_inbound  = set()
        known_outbound = set()
        log("[MONITOR] Network monitor starting...")
        for c in get_connections():
            known_inbound.add((c.raddr.ip, c.laddr.port, c.pid))
            known_outbound.add((c.laddr.ip, c.raddr.port, c.pid))
        log("[MONITOR] Network monitor running.")

        while True:
            time.sleep(4)
            try:
                current = get_connections()
                current_in  = set()
                current_out = set()
                for c in current:
                    rip   = c.raddr.ip
                    rport = c.raddr.port
                    lport = c.laddr.port
                    pid   = c.pid or 0

                    if lport in WATCH_PORTS_INBOUND:
                        key = (rip, lport, pid)
                        current_in.add(key)
                        if key not in known_inbound:
                            proto    = WATCH_PORTS_INBOUND[lport]
                            proc_name = ""
                            try:
                                proc_name = psutil.Process(pid).name() if pid else ""
                            except Exception:
                                pass
                            src_type = "LAN" if is_private_ip(rip) else "EXTERNAL"
                            msg = (f"[DETECTED][NETWORK] Inbound {proto} "
                                   f"[{src_type}] from {rip}:{rport} → "
                                   f"port {lport} | PID:{pid} "
                                   f"Process:'{proc_name}'")
                            log(msg)
                            if should_notify(CAT_NETWORK):
                                ship_event("[DETECTED][NETWORK]",
                                           "medium", "NETWORK", msg)

                    if rport in WATCH_PORTS_OUTBOUND and \
                       not is_private_ip(rip):
                        key = (rip, rport, pid)
                        current_out.add(key)
                        if key not in known_outbound:
                            proto    = WATCH_PORTS_OUTBOUND[rport]
                            proc_name = ""
                            try:
                                proc_name = psutil.Process(pid).name() if pid else ""
                            except Exception:
                                pass
                            sev = "critical" if proto in (
                                "Meterpreter","Hacker-Port","Tor","Tor-Proxy"
                            ) else "high"
                            msg = (f"[OUTBOUND-LATERAL] Outbound {proto} "
                                   f"to {rip}:{rport} | PID:{pid} "
                                   f"Process:'{proc_name}'")
                            log(msg)
                            ship_event("[OUTBOUND-LATERAL]",
                                       sev, "NETWORK", msg)

                known_inbound  = current_in
                known_outbound = current_out
            except Exception as ex:
                log(f"[NETWORK-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="NetworkMonitor").start()

def start_port_monitor():
    if not config.get("monitor_ports"):
        return

    def _get_listeners():
        ports = set()
        try:
            out = run_cmd(["ss", "-tlnp"])
            for line in out.splitlines()[1:]:
                m = re.search(r':(\d+)\s+', line)
                if m:
                    ports.add(int(m.group(1)))
        except Exception:
            pass
        return ports

    def _monitor():
        known = _get_listeners()
        log(f"[MONITOR] Port monitor: {len(known)} known listening ports.")
        while True:
            time.sleep(30)
            try:
                current   = _get_listeners()
                new_ports = current - known
                for port in new_ports:
                    msg = (f"[NETWORK][NEW-LISTENER] New listening port: "
                           f"{port} — possible backdoor or C2")
                    log(msg)
                    ship_event("[NETWORK][NEW-LISTENER]",
                               "high", "NETWORK", msg)
                known = current
            except Exception as ex:
                log(f"[PORT-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="PortMonitor").start()

# ═══════════════════════════════════════════════════════════════════════════════
# AUTH LOG MONITOR — fixed regex fallback bug
# ═══════════════════════════════════════════════════════════════════════════════

AUTH_LOG_PATHS = [
    "/var/log/auth.log",
    "/var/log/secure",
    "/var/log/messages",
]

FAILED_LOGIN_RE = re.compile(
    r"(Failed password|authentication failure|Invalid user|"
    r"FAILED LOGIN|Failed publickey|pam_unix.*auth.*failure)",
    re.IGNORECASE
)

SUCCESS_LOGIN_RE = re.compile(
    r"(Accepted password|Accepted publickey|"
    r"session opened for user|New session \d+ of user)",
    re.IGNORECASE
)

USER_RE = re.compile(r"(?:user|for)\s+(\w+)", re.IGNORECASE)
IP_RE   = re.compile(r"from\s+([\d\.a-f:]+)", re.IGNORECASE)

def _extract_user(line: str) -> str:
    m = USER_RE.search(line)
    return m.group(1) if m else "unknown"

def _extract_ip(line: str) -> str:
    m = IP_RE.search(line)
    return m.group(1) if m else ""

def start_auth_log_monitor():
    if not config.get("monitor_auth"):
        return

    auth_log = next((p for p in AUTH_LOG_PATHS if os.path.exists(p)), None)
    if not auth_log:
        log("[MONITOR-WARN] No auth log found — failed login monitor disabled.")
        return

    # Brute-force detection per user/IP pair
    _brute_tracker:    dict = defaultdict(list)
    _brute_lock              = threading.Lock()

    # Password spray detection: same IP, many different users
    _spray_tracker:    dict = defaultdict(list)  # ip → [usernames]
    _spray_lock              = threading.Lock()

    def _monitor():
        log(f"[MONITOR] Auth log monitor on {auth_log}")
        threshold = config.get("failed_logon_threshold", 5)
        window    = config.get("failed_logon_window_mins", 10)

        for line in _tail_file(auth_log):
            try:
                now = datetime.now(timezone.utc)

                if FAILED_LOGIN_RE.search(line):
                    if not should_log(CAT_FAILEDLOGON):
                        continue
                    user = _extract_user(line)
                    ip   = _extract_ip(line)
                    key  = f"{user}|{ip}"

                    # Brute force: same user/IP
                    with _brute_lock:
                        _brute_tracker[key].append(now)
                        cutoff = now - timedelta(minutes=window)
                        _brute_tracker[key] = [
                            t for t in _brute_tracker[key] if t >= cutoff
                        ]
                        count = len(_brute_tracker[key])

                    log(f"[FAILED-LOGON] User:'{user}' "
                        f"From:{ip} Count:{count}/{threshold}")

                    if count >= threshold:
                        with _brute_lock:
                            _brute_tracker[key] = []
                        msg = (f"[FAILED-LOGON][BRUTE] {count} failed logins "
                               f"for '{user}' from {ip} "
                               f"in {window} minutes")
                        log(msg)
                        ship_event("[FAILED-LOGON]", "high", "LOGON", msg)
                        if should_act(CAT_FAILEDLOGON):
                            _block_ip_ssh(ip)

                    # Password spray: same IP, different users
                    if ip:
                        with _spray_lock:
                            _spray_tracker[ip].append((now, user))
                            cutoff = now - timedelta(minutes=window)
                            _spray_tracker[ip] = [
                                (t, u) for t, u in _spray_tracker[ip]
                                if t >= cutoff
                            ]
                            unique_users = len(set(
                                u for _, u in _spray_tracker[ip]
                            ))
                            total_attempts = len(_spray_tracker[ip])

                        # Same IP targeting 10+ different users = spray
                        if unique_users >= 10:
                            spray_key = f"spray|{ip}"
                            with _spray_lock:
                                pass
                            msg = (f"[FAILED-LOGON][SPRAY] Password spray "
                                   f"from {ip}: {unique_users} different users "
                                   f"in {window} minutes "
                                   f"({total_attempts} attempts)")
                            log(msg)
                            ship_event("[FAILED-LOGON][SPRAY]",
                                       "critical", "LOGON", msg)
                            if should_act(CAT_FAILEDLOGON):
                                _block_ip_ssh(ip)
                            # Reset after alerting
                            with _spray_lock:
                                _spray_tracker[ip] = []

                elif SUCCESS_LOGIN_RE.search(line):
                    if not should_log(CAT_OFFICEHOURS):
                        continue
                    user = _extract_user(line)
                    ip   = _extract_ip(line)

                    # Dedup: one alert per user/ip per hour
                    dedup_key = f"login|{user}|{ip}"
                    with _after_hours_lock:
                        last = _after_hours_dedup.get(dedup_key)
                        if last and (now - last).total_seconds() < 3600:
                            continue
                        _after_hours_dedup[dedup_key] = now

                    src_type = "LAN" if is_private_ip(ip) else "EXTERNAL"
                    in_hours = is_office_hours()
                    tag      = "[LOGIN]" if in_hours else "[AFTER-HOURS]"
                    sev      = "medium" if in_hours else "high"
                    msg = (f"{tag} SSH login — User:'{user}' "
                           f"From:{ip} [{src_type}] Time:{ts()}")
                    log(msg)
                    ship_event(tag, sev, "LOGON", msg)

                    # Check if there were recent failed logins from this IP
                    # (possible brute force success)
                    brute_key = f"{user}|{ip}"
                    with _brute_lock:
                        recent_fails = len(_brute_tracker.get(brute_key, []))
                    if recent_fails > 0:
                        msg = (f"[LATERAL][BRUTE-SUCCESS] "
                               f"Successful login for '{user}' from {ip} "
                               f"after {recent_fails} failed attempts — "
                               f"possible brute force success")
                        log(msg)
                        ship_event("[LATERAL][BRUTE-SUCCESS]",
                                   "critical", "LOGON", msg)

            except Exception as ex:
                log(f"[AUTH-LOG-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="AuthLogMonitor").start()

def _block_ip_ssh(ip: str):
    if not ip or ip in ("unknown", ""):
        return
    try:
        subprocess.run(
            ["iptables", "-I", "INPUT", "-s", ip, "-j", "DROP",
             "-m", "comment", "--comment", f"IOCHunt-Block-{ip}"],
            timeout=5, check=True
        )
        msg = f"[NET-BLOCKED] iptables DROP added for {ip}"
        log(msg)
        ship_event("[NET-BLOCKED]", "high", "NETWORK", msg)
    except Exception as ex:
        log(f"[BLOCK-IP-ERR] {ip}: {ex}")

# ═══════════════════════════════════════════════════════════════════════════════
# REMAINING ORIGINAL MONITORS — unchanged
# ═══════════════════════════════════════════════════════════════════════════════

def start_persistence_monitor():
    PERSISTENCE_PATHS = [
        "/etc/cron.d/", "/etc/cron.daily/", "/etc/cron.hourly/",
        "/etc/cron.weekly/", "/etc/cron.monthly/",
        "/var/spool/cron/", "/var/spool/cron/crontabs/",
        "/etc/systemd/system/", "/usr/lib/systemd/system/",
        "/run/systemd/system/",
        "/etc/rc.local", "/etc/rc.d/", "/etc/init.d/",
        "/etc/profile.d/", "/etc/profile", "/etc/bash.bashrc",
        "/root/.bashrc", "/root/.bash_profile", "/root/.profile",
        "/etc/xdg/autostart/",
    ]
    if not config.get("monitor_persistence"):
        return

    def _get_paths():
        paths = list(PERSISTENCE_PATHS)
        try:
            import pwd
            for p in pwd.getpwall():
                if p.pw_uid >= 1000 and os.path.isdir(p.pw_dir):
                    for rel in [".bashrc",".bash_profile",".profile",
                                ".config/autostart/",
                                ".local/share/systemd/user/"]:
                        paths.append(os.path.join(p.pw_dir, rel))
        except Exception:
            pass
        return paths

    def _snapshot():
        snap = {}
        for p in _get_paths():
            try:
                if os.path.isfile(p):
                    st = os.stat(p)
                    snap[p] = (st.st_mtime, st.st_size)
                elif os.path.isdir(p):
                    for e in os.scandir(p):
                        if e.is_file():
                            snap[e.path] = (
                                e.stat().st_mtime, e.stat().st_size)
            except Exception:
                pass
        return snap

    def _monitor():
        baseline = _snapshot()
        log(f"[MONITOR] Persistence monitor: watching {len(baseline)} files.")
        while True:
            time.sleep(15)
            try:
                current = _snapshot()
                for path, stat_v in current.items():
                    if path not in baseline:
                        _handle_new_persistence(path)
                    elif stat_v != baseline[path]:
                        _handle_modified_persistence(path)
                baseline = current
            except Exception as ex:
                log(f"[PERSIST-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="PersistenceMonitor").start()

def _handle_new_persistence(path: str):
    if not should_log(CAT_STARTUP):
        return
    signed = is_signed(path)
    sev    = "high" if not signed else "medium"
    tag    = "[PERSISTENCE][STARTUP]"
    cat    = "STARTUP"
    if "systemd" in path or path.endswith(".service"):
        tag, cat = "[PERSISTENCE][SERVICE]", "SERVICES"
    elif "cron" in path:
        tag, cat = "[PERSISTENCE][TASK]", "TASKS"
    msg = f"{tag} New persistence file: '{path}' Signed:{signed}"
    log(msg)
    ship_event(tag, sev, cat, msg)

def _handle_modified_persistence(path: str):
    if not should_log(CAT_CONFIG):
        return
    sensitive = ("/etc/passwd","/etc/shadow","/etc/sudoers",
                 "/etc/ssh/sshd_config","/root/.ssh/authorized_keys")
    sev = "high" if any(
        path.startswith(s) or path == s for s in sensitive) else "medium"
    msg = f"[CONFIG-CHANGE] Persistence file modified: '{path}'"
    log(msg)
    ship_event("[CONFIG-CHANGE]", sev, "CONFIG", msg)

def start_rootkit_monitor():
    if not config.get("monitor_rootkit"):
        return

    def _monitor():
        last_lsmod = set()
        log("[MONITOR] Rootkit monitor starting...")
        try:
            out = run_cmd(["lsmod"])
            last_lsmod = {
                l.split()[0] for l in out.splitlines()[1:] if l.strip()
            }
        except Exception:
            pass

        while True:
            time.sleep(30)
            try:
                out = run_cmd(["lsmod"])
                current = {
                    l.split()[0] for l in out.splitlines()[1:] if l.strip()
                }
                for mod in current - last_lsmod:
                    msg = (f"[SENSITIVE][KERNEL-MODULE] "
                           f"New kernel module: '{mod}'")
                    log(msg)
                    ship_event("[SENSITIVE][KERNEL-MODULE]",
                               "high", "SENSITIVE", msg)
                last_lsmod = current

                # LD_PRELOAD check
                if os.path.exists("/etc/ld.so.preload"):
                    content = _read_file_safe("/etc/ld.so.preload")
                    if content:
                        msg = (f"[SENSITIVE][LD-PRELOAD] "
                               f"/etc/ld.so.preload non-empty: "
                               f"'{content[:200]}'")
                        log(msg)
                        ship_event("[SENSITIVE][LD-PRELOAD]",
                                   "critical", "SENSITIVE", msg)

                # Hidden process check
                if HAS_PSUTIL:
                    proc_pids = set()
                    for e in os.scandir("/proc"):
                        if e.name.isdigit():
                            proc_pids.add(int(e.name))
                    ps_pids = {p.pid for p in psutil.process_iter(["pid"])}
                    for pid in proc_pids - ps_pids - {0}:
                        try:
                            cp = f"/proc/{pid}/cmdline"
                            if os.path.exists(cp):
                                cmd = open(cp,"rb").read()\
                                    .replace(b"\x00",b" ")\
                                    .decode(errors="replace")
                                msg = (f"[SENSITIVE][HIDDEN-PROCESS] "
                                       f"PID:{pid} visible in /proc "
                                       f"but not ps: '{cmd[:100]}'")
                                log(msg)
                                ship_event(
                                    "[SENSITIVE][HIDDEN-PROCESS]",
                                    "critical", "SENSITIVE", msg)
                        except Exception:
                            pass

                # /proc/modules vs lsmod cross-check
                proc_modules = set()
                try:
                    for line in open("/proc/modules", errors="replace"):
                        parts = line.split()
                        if parts:
                            proc_modules.add(parts[0])
                except Exception:
                    pass
                hidden_mods = proc_modules - current
                for mod in hidden_mods:
                    msg = (f"[SENSITIVE][HIDDEN-MODULE] "
                           f"Module '{mod}' in /proc/modules "
                           f"but not in lsmod — rootkit indicator!")
                    log(msg)
                    ship_event("[SENSITIVE][HIDDEN-MODULE]",
                               "critical", "SENSITIVE", msg)

            except Exception as ex:
                log(f"[ROOTKIT-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="RootkitMonitor").start()

def _find_suid_files() -> set:
    suids = set()
    for base in ["/usr/bin","/usr/sbin","/bin","/sbin",
                 "/usr/local/bin","/usr/local/sbin",
                 "/tmp","/var/tmp"]:
        try:
            for root, dirs, files in os.walk(base):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    try:
                        mode = os.stat(fpath).st_mode
                        if mode & 0o4000 or mode & 0o2000:
                            suids.add(fpath)
                    except Exception:
                        pass
        except Exception:
            pass
    return suids

def start_suid_monitor():
    if not config.get("monitor_suid"):
        return

    def _monitor():
        last = _find_suid_files()
        log(f"[MONITOR] SUID monitor: {len(last)} known SUID files.")
        while True:
            time.sleep(120)
            try:
                current = _find_suid_files()
                for path in current - last:
                    msg = (f"[SENSITIVE][SUID] New SUID/SGID: '{path}'")
                    log(msg)
                    ship_event("[SENSITIVE][SUID]", "critical",
                               "SENSITIVE", msg)
                last = current
            except Exception as ex:
                log(f"[SUID-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="SuidMonitor").start()

def start_usb_monitor():
    if not config.get("monitor_usb"):
        return

    def _monitor():
        known_devs = set()
        log("[MONITOR] USB monitor starting...")
        try:
            for p in Path("/sys/block").iterdir():
                if any(p.name.startswith(pfx)
                       for pfx in ("sd","sr","mmcblk","nvme")):
                    known_devs.add(p.name)
        except Exception:
            pass

        while True:
            time.sleep(5)
            try:
                current_devs = set()
                for p in Path("/sys/block").iterdir():
                    if any(p.name.startswith(pfx)
                           for pfx in ("sd","sr","mmcblk")):
                        current_devs.add(p.name)
                for dev in current_devs - known_devs:
                    if not should_log(CAT_USB):
                        continue
                    vendor = removable = ""
                    try:
                        vp = f"/sys/block/{dev}/device/vendor"
                        if os.path.exists(vp):
                            vendor = open(vp).read().strip()
                        rp = f"/sys/block/{dev}/removable"
                        if os.path.exists(rp):
                            removable = open(rp).read().strip()
                    except Exception:
                        pass
                    msg = (f"[USB] Device: /dev/{dev} "
                           f"Vendor:'{vendor}' Removable:{removable}")
                    log(msg)
                    ship_event("[USB]", "low", "USB", msg)
                    if removable == "1":
                        _scan_usb_device(dev)
                known_devs = current_devs
            except Exception as ex:
                log(f"[USB-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="UsbMonitor").start()

def _scan_usb_device(dev: str):
    mount_point = None
    try:
        mounts = open("/proc/mounts").read()
        for line in mounts.splitlines():
            parts = line.split()
            if len(parts) >= 2 and f"/dev/{dev}" in parts[0]:
                mount_point = parts[1]
                break
    except Exception:
        pass
    if not mount_point:
        return

    log(f"[USB-SCAN] Scanning {dev} at {mount_point}")
    suspicious = []
    try:
        for root, dirs, files in os.walk(mount_point):
            for fname in files:
                fpath = os.path.join(root, fname)
                ext   = os.path.splitext(fname)[1].lower()
                if ext in (".sh",".py",".pl",".rb",".elf",""):
                    try:
                        magic = open(fpath,"rb").read(4)
                        if magic[:2] == b"#!" or magic == b"\x7fELF":
                            suspicious.append(fpath)
                    except Exception:
                        pass
    except Exception as ex:
        log(f"[USB-SCAN-ERR] {ex}")

    if suspicious:
        msg = (f"[USB][SUSPICIOUS] {len(suspicious)} executable(s) "
               f"on /dev/{dev}: {', '.join(suspicious[:3])}")
        log(msg)
        ship_event("[USB][SUSPICIOUS]", "high", "USB", msg)

    if config.get("clamav_scan_usb"):
        run_clamav_scan(mount_point)

def start_clamav_monitor():
    CLAMAV_LOG_PATHS = [
        "/var/log/clamav/clamav.log",
        "/var/log/clamav/freshclam.log",
        "/var/log/clamd.log",
    ]
    CLAMAV_FOUND_RE = re.compile(r"(.+):\s+(.+FOUND)", re.IGNORECASE)
    CLAMAV_ERROR_RE = re.compile(r"(ERROR|FAILED|cannot|unable)", re.IGNORECASE)
    CLAMAV_DB_RE    = re.compile(r"(Database updated|Downloading|outdated)", re.IGNORECASE)

    if not config.get("monitor_clamav"):
        return

    if config.get("clamav_log_monitor"):
        clamav_log = next(
            (p for p in CLAMAV_LOG_PATHS if os.path.exists(p)), None)
        if clamav_log:
            def _log_monitor():
                log(f"[MONITOR] ClamAV log monitor on {clamav_log}")
                for line in _tail_file(clamav_log):
                    try:
                        line = line.strip()
                        if not line:
                            continue
                        m = CLAMAV_FOUND_RE.search(line)
                        if m:
                            filepath    = m.group(1).strip()
                            threat_name = m.group(2).strip()
                            msg = (f"[CLAMAV][DETECTED] '{threat_name}' "
                                   f"in '{filepath}'")
                            log(msg)
                            ship_event("[CLAMAV][DETECTED]", "critical",
                                       "SENSITIVE", msg)
                            if config.get("clamav_quarantine"):
                                _quarantine_file(filepath)
                        elif CLAMAV_ERROR_RE.search(line):
                            log(f"[CLAMAV][ERROR] {line[:200]}")
                        elif CLAMAV_DB_RE.search(line):
                            log(f"[CLAMAV] {line[:150]}")
                    except Exception:
                        pass
            threading.Thread(target=_log_monitor, daemon=True,
                             name="ClamAVLog").start()

def run_clamav_scan(path: str):
    CLAMAV_FOUND_RE = re.compile(r"(.+):\s+(.+FOUND)", re.IGNORECASE)
    if not run_cmd(["which", "clamscan"]).strip():
        return
    def _scan():
        try:
            out = subprocess.check_output(
                ["clamscan","--recursive","--infected",
                 "--no-summary", path],
                stderr=subprocess.DEVNULL, timeout=300
            ).decode(errors="replace")
            for line in out.splitlines():
                m = CLAMAV_FOUND_RE.search(line)
                if m:
                    filepath    = m.group(1).strip()
                    threat_name = m.group(2).strip()
                    msg = (f"[CLAMAV][SCAN-DETECTED] '{threat_name}' "
                           f"in '{filepath}'")
                    log(msg)
                    ship_event("[CLAMAV][SCAN-DETECTED]", "critical",
                               "SENSITIVE", msg)
                    if config.get("clamav_quarantine"):
                        _quarantine_file(filepath)
        except Exception as ex:
            log(f"[CLAMAV-SCAN-ERR] {ex}")
    threading.Thread(target=_scan, daemon=True, name="ClamAVScan").start()

def _quarantine_file(filepath: str):
    qdir = config.get("clamav_quarantine_dir",
                      "/var/lib/iochunt/quarantine")
    try:
        os.makedirs(qdir, exist_ok=True)
        if os.path.exists(filepath):
            fname = os.path.basename(filepath)
            dest  = os.path.join(
                qdir, f"{fname}_{int(time.time())}.quarantine")
            os.rename(filepath, dest)
            msg = f"[CLAMAV][QUARANTINED] '{filepath}' → '{dest}'"
            log(msg)
            ship_event("[CLAMAV][QUARANTINED]", "high", "SENSITIVE", msg)
    except Exception as ex:
        log(f"[QUARANTINE-ERR] {filepath}: {ex}")

def start_command_monitor():
    if not config.get("monitor_commands"):
        return
    has_ausearch = bool(run_cmd(["which", "ausearch"]).strip())
    if has_ausearch:
        _start_audit_monitor()
    else:
        _start_proc_cmdline_monitor()

def _start_audit_monitor():
    audit_log = "/var/log/audit/audit.log"
    if not os.path.exists(audit_log):
        _start_proc_cmdline_monitor()
        return

    def _monitor():
        log(f"[MONITOR] Audit log command monitor on {audit_log}")
        for line in _tail_file(audit_log):
            try:
                if "EXECVE" not in line and "SYSCALL" not in line:
                    continue
                m = re.search(r'a0="([^"]+)"', line)
                if not m:
                    continue
                cmd = m.group(1)
                if SENSITIVE_CMD_RE.search(cmd):
                    msg = (f"[SENSITIVE][AUDIT] Sensitive command: "
                           f"'{cmd[:300]}'")
                    log(msg)
                    ship_event("[SENSITIVE]", "critical", "SENSITIVE", msg)
                elif ENUM_CMD_RE.search(cmd):
                    msg = (f"[ENUM][AUDIT] Enumeration: '{cmd[:200]}'")
                    log(msg)
                    if should_notify(CAT_ENUM):
                        ship_event("[ENUM]", "medium", "ENUM", msg)
            except Exception:
                pass

    threading.Thread(target=_monitor, daemon=True,
                     name="AuditMonitor").start()

def _start_proc_cmdline_monitor():
    if not HAS_PSUTIL:
        return

    def _monitor():
        # Use a dict with TTL instead of a growing set
        # key → expiry timestamp
        seen_cmds: Dict[tuple, float] = {}
        log("[MONITOR] Process cmdline monitor (audit fallback).")

        while True:
            time.sleep(5)
            try:
                now = time.time()
                # Expire entries older than 5 minutes
                expired = [k for k, t in seen_cmds.items() if now - t > 300]
                for k in expired:
                    del seen_cmds[k]

                for proc in psutil.process_iter(["pid","cmdline","name"]):
                    try:
                        cmdline = " ".join(proc.info.get("cmdline") or [])
                        if not cmdline:
                            continue
                        key = (proc.pid, cmdline[:100])
                        if key in seen_cmds:
                            continue
                        seen_cmds[key] = now

                        if SENSITIVE_CMD_RE.search(cmdline):
                            msg = (f"[SENSITIVE][CMD-EXEC] PID:{proc.pid} "
                                   f"'{proc.info.get('name')}' "
                                   f"CMD:{cmdline[:300]}")
                            log(msg)
                            ship_event("[SENSITIVE]", "critical",
                                       "SENSITIVE", msg)
                        elif ENUM_CMD_RE.search(cmdline):
                            msg = (f"[ENUM][CMD-EXEC] PID:{proc.pid} "
                                   f"'{proc.info.get('name')}' "
                                   f"CMD:{cmdline[:200]}")
                            log(msg)
                            if should_notify(CAT_ENUM):
                                ship_event("[ENUM]", "medium",
                                           "ENUM", msg)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

            except Exception as ex:
                log(f"[CMDMON-PROC-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="CmdMonProc").start()

def start_webcam_monitor():
    if not config.get("monitor_webcam") or not HAS_PSUTIL:
        return

    def _monitor():
        alerted = set()
        log("[MONITOR] Webcam/Microphone monitor starting...")
        while True:
            time.sleep(5)
            try:
                for proc in psutil.process_iter(
                        ["pid","name","open_files"]):
                    try:
                        for fd in (proc.info.get("open_files") or []):
                            path   = getattr(fd, "path", str(fd))
                            is_cam = re.match(r"/dev/video\d+", path)
                            is_mic = re.match(r"/dev/snd/(pcm|audio)\S*",
                                             path)
                            if (is_cam or is_mic) and should_log(CAT_WEBCAM):
                                key = (proc.pid, path)
                                if key not in alerted:
                                    alerted.add(key)
                                    device = "Webcam" if is_cam \
                                        else "Microphone"
                                    msg = (f"[WEBCAM] {device} accessed "
                                           f"by '{proc.info.get('name')}' "
                                           f"PID:{proc.pid} Device:{path}")
                                    log(msg)
                                    ship_event("[WEBCAM]", "medium",
                                               "WEBCAM", msg)
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                if len(alerted) > 1000:
                    alerted.clear()
            except Exception as ex:
                log(f"[WEBCAM-MONITOR-ERR] {ex}")

    threading.Thread(target=_monitor, daemon=True,
                     name="WebcamMonitor").start()

def generate_baseline_report():
    report_path = (
        f"/tmp/iochunt_baseline_"
        f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.txt"
    )
    lines = [
        "=" * 70,
        "IOC Hunt — Linux Baseline Security Report",
        f"Generated: {ts()} UTC",
        f"Hostname:  {socket.gethostname()}",
        "=" * 70, "",
        "[ SUID / SGID Files ]",
    ]
    for path in sorted(_find_suid_files()):
        lines.append(f"  SUID: {path}")
    lines += [
        "", "[ Listening Ports ]",
        run_cmd(["ss","-tlnp"]) or "(unavailable)",
        "", "[ Kernel Modules ]",
        run_cmd(["lsmod"]) or "(unavailable)",
        "", "[ Local Users ]",
    ]
    try:
        for line in open("/etc/passwd"):
            parts = line.strip().split(":")
            if len(parts) >= 7 and parts[6] not in (
                "/sbin/nologin","/bin/false","/usr/sbin/nologin"
            ):
                lines.append(
                    f"  User: {parts[0]} UID:{parts[2]} Shell:{parts[6]}")
    except Exception:
        pass
    lines += [
        "", "[ Enabled Systemd Services ]",
        run_cmd(["systemctl","list-unit-files",
                 "--state=enabled","--no-pager"])[:3000]
        or "(unavailable)",
        "", "[ Last 20 Auth Events ]",
        run_cmd(["last","-n","20"]) or "(unavailable)",
        "", "[ LD_PRELOAD Check ]",
    ]
    if os.path.exists("/etc/ld.so.preload"):
        content = _read_file_safe("/etc/ld.so.preload")
        lines.append(f"  WARNING: non-empty: {content}")
    else:
        lines.append("  OK — /etc/ld.so.preload does not exist")

    # New additions to baseline report
    lines += ["", "[ Kernel Security Parameters ]"]
    for path, expected, desc, _ in KERNEL_CHECKS:
        actual = _read_file_safe(path)
        status = "✔" if actual == expected else "⚠ UNEXPECTED"
        lines.append(f"  {status} {path} = {actual!r} (expected {expected!r})")

    lines += ["", "[ Processes with Dangerous Capabilities ]"]
    try:
        out = run_cmd(["getcap", "-r", "/usr/bin", "/usr/sbin",
                       "/bin", "/sbin"])
        lines.append(out or "  None found")
    except Exception:
        pass

    lines += ["", "[ World-Writable /etc Files ]"]
    try:
        out = run_cmd(["find", "/etc", "-maxdepth", "2",
                       "-writable", "-not", "-type", "l"])
        lines.append(out or "  None found")
    except Exception:
        pass

    with open(report_path, "w") as f:
        f.write("\n".join(lines))
    log(f"[BASELINE-REPORT] Saved to {report_path}")
    return report_path

def _setup_audit_rules():
    rules = [
        ["-a","always,exit","-F","arch=b64","-S","execve",
         "-k","iochunt_exec"],
        ["-w","/etc/passwd",          "-p","wa","-k","iochunt_passwd"],
        ["-w","/etc/shadow",          "-p","wa","-k","iochunt_shadow"],
        ["-w","/etc/sudoers",         "-p","wa","-k","iochunt_sudoers"],
        ["-w","/etc/ssh/sshd_config", "-p","wa","-k","iochunt_ssh"],
        ["-w","/root/.ssh",           "-p","wa","-k","iochunt_rootssh"],
        ["-w","/etc/cron.d",          "-p","wa","-k","iochunt_cron"],
        ["-w","/etc/ld.so.preload",   "-p","wa","-k","iochunt_preload"],
        ["-a","always,exit","-F","arch=b64",
         "-S","init_module","-S","finit_module",
         "-k","iochunt_module"],
        ["-a","always,exit","-F","arch=b64",
         "-S","ptrace","-k","iochunt_ptrace"],
        # New rules
        ["-w","/etc/group",           "-p","wa","-k","iochunt_group"],
        ["-w","/etc/gshadow",         "-p","wa","-k","iochunt_gshadow"],
        ["-w","/etc/pam.d",           "-p","wa","-k","iochunt_pam"],
        ["-w","/etc/sudoers.d",       "-p","wa","-k","iochunt_sudoers_d"],
        ["-w","/etc/hosts",           "-p","wa","-k","iochunt_hosts"],
        ["-w","/etc/resolv.conf",     "-p","wa","-k","iochunt_dns"],
        ["-w","/boot",                "-p","wa","-k","iochunt_boot"],
        ["-a","always,exit","-F","arch=b64",
         "-S","memfd_create",         "-k","iochunt_memfd"],
        ["-a","always,exit","-F","arch=b64",
         "-S","setuid","-S","setgid",
         "-S","setreuid","-S","setregid",
         "-k","iochunt_setuid"],
        ["-a","always,exit","-F","arch=b64",
         "-S","open","-F","path=/etc/shadow",
         "-F","perm=r",              "-k","iochunt_shadow_read"],
        ["-w","/var/log",             "-p","wa","-k","iochunt_logs"],
        ["-w","/etc/crontab",         "-p","wa","-k","iochunt_crontab"],
        ["-a","always,exit","-F","arch=b64",
         "-S","create_module","-S","finit_module",
         "-S","delete_module",       "-k","iochunt_modules"],
    ]
    try:
        for rule in rules:
            subprocess.run(["auditctl"] + rule,
                           capture_output=True, timeout=5)
        log("[AUDIT] auditd rules installed.")
    except FileNotFoundError:
        log("[AUDIT-WARN] auditctl not found.")
    except Exception as ex:
        log(f"[AUDIT-SETUP-ERR] {ex}")

# ═══════════════════════════════════════════════════════════════════════════════
# SETUP WIZARD — abbreviated (same as original)
# ═══════════════════════════════════════════════════════════════════════════════

def _ask(prompt: str, default: str = "") -> str:
    disp = f" [{default}]" if default else ""
    try:
        val = input(f"  {prompt}{disp}: ").strip()
        return val if val else default
    except (EOFError, KeyboardInterrupt):
        return default

def _ask_bool(prompt: str, default: bool = True) -> bool:
    disp = "Y/n" if default else "y/N"
    try:
        val = input(f"  {prompt} [{disp}]: ").strip().lower()
        if not val:
            return default
        return val in ("y","yes","1","true")
    except (EOFError, KeyboardInterrupt):
        return default

def _ask_int(prompt: str, default: int) -> int:
    try:
        val = input(f"  {prompt} [{default}]: ").strip()
        return int(val) if val else default
    except (ValueError, EOFError, KeyboardInterrupt):
        return default

def _section(title: str):
    print(f"\n{'─'*60}\n  {title}\n{'─'*60}")

def run_setup_wizard():
    global config, cat_modes
    print("\n" + "═"*60)
    print("  IOC Hunt Linux Agent — First-Run Setup Wizard")
    print("═"*60)

    _section("1. Central Server")
    config["central_server_enabled"] = _ask_bool(
        "Enable central server shipping?", False)
    if config["central_server_enabled"]:
        config["central_server_url"]   = _ask("Server URL", "")
        config["central_server_key"]   = _ask("API key")
        config["central_server_label"] = _ask("Machine label",
                                               socket.gethostname())

    _section("2. Office Hours")
    config["office_hours_start"] = _ask_int("Start hour (0-23)", 9)
    config["office_hours_end"]   = _ask_int("End hour (0-23)", 18)
    config["office_hours_days"]  = _ask_int("Office days bitmask (Mon-Fri=62)", 62)

    _section("3. Detection Thresholds")
    config["failed_logon_threshold"]   = _ask_int("Failed login threshold", 5)
    config["failed_logon_window_mins"] = _ask_int("Failed login window (mins)", 10)
    config["learning_mode"]            = _ask_bool(
        "Learning mode (alerts only, no auto-block)?", True)

    _section("4. Monitor Modules")
    monitors = [
        ("monitor_processes",   "Process creation & tool detection"),
        ("monitor_network",     "Network connections"),
        ("monitor_auth",        "Auth log (failed logins, brute force)"),
        ("monitor_persistence", "File persistence (cron, systemd, bashrc)"),
        ("monitor_sensitive",   "Sensitive file changes"),
        ("monitor_rootkit",     "Rootkit indicators"),
        ("monitor_suid",        "SUID/SGID changes"),
        ("monitor_usb",         "USB/removable media"),
        ("monitor_commands",    "Command execution"),
        ("monitor_webcam",      "Webcam & microphone"),
        ("monitor_ports",       "New listening ports"),
        ("monitor_clamav",      "ClamAV antivirus"),
        ("monitor_dns",         "DNS monitoring (DGA/tunneling)"),
        ("monitor_containers",  "Container escape detection"),
        ("monitor_fileless",    "Fileless malware (memfd/deleted exe)"),
        ("monitor_privesc",     "Privilege escalation"),
        ("monitor_correlation", "Event correlation engine"),
        ("monitor_integrity",   "Startup integrity check"),
    ]
    for key, desc in monitors:
        config[key] = _ask_bool(f"{desc}?", True)

    config["setup_complete"] = True
    save_config()
    print(f"\n  ✔ Config saved to {CONFIG_FILE}")
    print("  Starting IOC Hunt...\n")

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    if os.geteuid() != 0:
        print("[WARN] Not running as root — some monitors will be limited.")

    load_config()

    if not config.get("setup_complete") or "--setup" in sys.argv:
        run_setup_wizard()
        load_config()

    log("=" * 60)
    log("=== IOC Hunt Linux Agent v2 Enhanced Started ===")
    log(f"[INFO] Root:{os.geteuid()==0} Host:{socket.gethostname()}")
    log(f"[INFO] psutil:{HAS_PSUTIL} inotify:{HAS_INOTIFY} "
        f"requests:{HAS_REQUESTS}")

    load_whitelist()
    load_blocklist()

    if os.geteuid() == 0:
        _setup_audit_rules()

    # Startup integrity check (before monitors start)
    run_startup_integrity_check()

    # Build initial process tree
    _build_process_tree()

    # ── Start all monitors ────────────────────────────────────────────────────
    start_process_monitor()
    start_network_monitor()
    start_port_monitor()
    start_auth_log_monitor()
    start_persistence_monitor()
    start_sensitive_file_monitor()      # enhanced
    start_rootkit_monitor()             # enhanced (hidden module detection)
    start_suid_monitor()
    start_usb_monitor()
    start_command_monitor()             # fixed TTL bug
    start_webcam_monitor()
    start_clamav_monitor()
    # New monitors
    start_fileless_monitor()
    start_privesc_monitor()
    start_container_monitor()
    start_dns_monitor()
    start_ssh_key_monitor()
    start_user_account_monitor()
    start_cron_content_monitor()
    start_env_monitor()
    start_systemd_monitor()
    start_core_dump_monitor()
    start_correlation_monitor()         # must be last — reads from all others

    if config.get("central_server_enabled") and \
       config.get("central_server_url"):
        start_central_shipper()
        start_policy_poller()
        log(f"[CENTRAL] Shipping to: {config['central_server_url']}")
    else:
        log("[CENTRAL] Central shipping disabled.")

    active = [
        k.replace("monitor_","")
        for k in config
        if k.startswith("monitor_") and config.get(k)
    ]
    log(f"[INFO] Active monitors: {', '.join(sorted(active))}")
    log("[INFO] All monitors active. Ctrl+C to stop.")

    # Daily baseline report
    def _baseline_loop():
        while True:
            time.sleep(86400)
            try:
                generate_baseline_report()
            except Exception as ex:
                log(f"[BASELINE-ERR] {ex}")
    threading.Thread(target=_baseline_loop, daemon=True,
                     name="BaselineReport").start()

    def _shutdown(signum, frame):
        log("[INFO] Shutdown signal.")
        _flush_ship_queue()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT,  _shutdown)

    while True:
        time.sleep(60)
        log(f"[INFO] Heartbeat — "
            f"alerts:{_alert_count} blocks:{_block_count} "
            f"corr_buffer:{len(_correlation_buffer)}")


if __name__ == "__main__":
    main()
