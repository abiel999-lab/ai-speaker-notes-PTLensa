from pathlib import Path
import subprocess
base=Path('/home/actiaAdmin26');target=Path('/usr/local/lib/notepreso-ops');target.mkdir(mode=0o755,parents=True,exist_ok=True)
p=target/'check.py';p.write_bytes((base/'notepreso-ops-check.py').read_bytes());p.chmod(0o755)
service='''[Unit]
Description=NotePreso production health snapshot
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/lib/notepreso-ops/check.py
TimeoutStartSec=120
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/notepreso-ops
'''
timer='''[Unit]
Description=Check NotePreso health every five minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
[Install]
WantedBy=timers.target
'''
Path('/var/lib/notepreso-ops').mkdir(mode=0o700,exist_ok=True)
for name,content in [('notepreso-ops-health.service',service),('notepreso-ops-health.timer',timer)]:
 p=Path('/etc/systemd/system')/name;assert not p.exists(),'Refuse replacing existing unit';p.write_text(content)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','start','notepreso-ops-health.service'],check=True)
subprocess.run(['systemctl','enable','--now','notepreso-ops-health.timer'],check=True)
print(Path('/var/lib/notepreso-ops/latest.json').read_text())
print(subprocess.check_output(['systemctl','is-active','notepreso-ops-health.timer'],text=True))
