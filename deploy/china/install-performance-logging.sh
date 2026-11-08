#!/usr/bin/env bash
# Scoped add-on deployment: never uploads application source or production secrets.
set -euo pipefail

if [[ "$EUID" != 0 || "$#" != 1 ]]; then
  echo "Usage (root on the verified China server): bash install-performance-logging.sh EXPECTED_PRIVATE_IP"
  exit 2
fi
expected_ip="$1"
case " $(hostname -I) " in
  *" $expected_ip "*) ;;
  *) echo "Server IP does not match the approved target"; exit 1 ;;
esac
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null
test -x /usr/sbin/logrotate
node --check "$source_dir/performance-log-preload.mjs"
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
test "$(systemctl show nekoid -p User --value)" = nekoid
test "$(systemctl show nekoid -p WorkingDirectory --value)" = /opt/nekoid/current
systemctl is-active --quiet nekoid
systemctl is-active --quiet logcollectord
curl -fsS --max-time 10 http://127.0.0.1:3000/api/ios/health >/dev/null

# Only install over the known launch command (or our own earlier installation).
launch="$(systemctl show nekoid -p ExecStart --value)"
if [[ "$launch" != *"argv[]=/usr/bin/env node .output/server/index.mjs ;"* &&
      "$launch" != *"argv[]=/usr/bin/env node --import /opt/nekoid/observability/performance-log-preload.mjs .output/server/index.mjs ;"* ]]; then
  echo "Unexpected application launch command; refusing to override it"
  exit 1
fi

sources=(performance-log-preload.mjs performance-logging.conf performance-logrotate.conf nekoid-performance-logrotate.service nekoid-performance-logrotate.timer)
targets=(/opt/nekoid/observability/performance-log-preload.mjs /etc/systemd/system/nekoid.service.d/20-performance-log.conf /etc/nekoid/performance-logrotate.conf /etc/systemd/system/nekoid-performance-logrotate.service /etc/systemd/system/nekoid-performance-logrotate.timer)
backup_dir="$(mktemp -d /var/backups/nekoid-observability-XXXXXXXX)"
chmod 0700 "$backup_dir"
existed=()
timer_enabled="$(systemctl is-enabled nekoid-performance-logrotate.timer 2>/dev/null || true)"
timer_active="$(systemctl is-active nekoid-performance-logrotate.timer 2>/dev/null || true)"
for i in "${!targets[@]}"; do
  test -f "$source_dir/${sources[$i]}"
  if [[ -e "${targets[$i]}" ]]; then
    cp -a "${targets[$i]}" "$backup_dir/$i.previous"
    existed[$i]=1
  else
    existed[$i]=0
  fi
done

rollback() {
  trap - ERR
  set +e
  systemctl disable --now nekoid-performance-logrotate.timer >/dev/null 2>&1
  for i in "${!targets[@]}"; do
    if [[ "${existed[$i]}" = 1 ]]; then
      cp -a "$backup_dir/$i.previous" "${targets[$i]}"
    elif [[ -e "${targets[$i]}" ]]; then
      mv "${targets[$i]}" "$backup_dir/$i.failed"
    fi
  done
  systemctl daemon-reload
  systemctl restart nekoid
  if [[ "$timer_enabled" = enabled ]]; then systemctl enable nekoid-performance-logrotate.timer; fi
  if [[ "$timer_active" = active ]]; then systemctl start nekoid-performance-logrotate.timer; fi
  echo "Observability deployment failed; original configuration restored. Backup: $backup_dir"
  exit 1
}
trap rollback ERR

install -d -m 0755 /opt/nekoid/observability /etc/systemd/system/nekoid.service.d
install -d -m 0750 -o nekoid -g nekoid /var/log/nekoid
install -d -m 0755 /var/lib/logrotate
for i in "${!targets[@]}"; do
  install -m 0644 -o root -g root "$source_dir/${sources[$i]}" "${targets[$i]}"
done
if [[ ! -e /var/log/nekoid/performance.jsonl ]]; then
  install -m 0640 -o nekoid -g nekoid /dev/null /var/log/nekoid/performance.jsonl
fi
runuser -u nekoid -- test -w /var/log/nekoid/performance.jsonl
/usr/sbin/logrotate --debug --state /var/lib/logrotate/nekoid-performance.status /etc/nekoid/performance-logrotate.conf
systemctl daemon-reload
systemctl restart nekoid
healthy=0
for ((i = 0; i < 30; i++)); do
  if curl -fsS --max-time 2 http://127.0.0.1:3000/api/ios/health >/dev/null; then healthy=1; break; fi
  sleep 1
done
test "$healthy" = 1
systemctl enable --now nekoid-performance-logrotate.timer
systemctl start nekoid-performance-logrotate.service
trap - ERR
echo "Performance logging installed. Backup: $backup_dir"
echo "Application release unchanged: $(readlink -f /opt/nekoid/current)"
systemctl is-active nekoid logcollectord nekoid-performance-logrotate.timer
