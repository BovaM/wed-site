function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

export function initCountdown(eventDate) {
  const root = document.getElementById('countdown');
  const past = document.getElementById('countdown-past');
  if (!root || !past) return;

  const target = new Date(eventDate).getTime();
  const units = {
    days: root.querySelector('[data-unit="days"]'),
    hours: root.querySelector('[data-unit="hours"]'),
    minutes: root.querySelector('[data-unit="minutes"]'),
    seconds: root.querySelector('[data-unit="seconds"]'),
  };

  if (!Number.isFinite(target)) {
    console.warn('[countdown] некорректная дата', eventDate);
    return;
  }

  let timeout = 0;
  let finished = false;

  function render() {
    const remaining = target - Date.now();

    if (remaining <= 0) {
      finished = true;
      root.hidden = true;
      past.hidden = false;
      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    units.days.textContent = pad(days, days > 99 ? 3 : 2);
    units.hours.textContent = pad(hours);
    units.minutes.textContent = pad(minutes);
    units.seconds.textContent = pad(seconds);
  }

  function schedule() {
    window.clearTimeout(timeout);
    if (finished) return;
    render();
    if (finished) return;
    const delay = 1000 - (Date.now() % 1000) + 20;
    timeout = window.setTimeout(schedule, delay);
  }

  function onVisibilityChange() {
    if (!document.hidden && !finished) {
      window.clearTimeout(timeout);
      schedule();
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  schedule();

  return () => {
    finished = true;
    window.clearTimeout(timeout);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
