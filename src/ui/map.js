import { CONFIG } from '../config.js';

export function initMapModal({ onOpen, onClose } = {}) {
  const modal = document.getElementById('place-modal');
  const mapElement = document.getElementById('modal-map');
  const title = document.getElementById('modal-title');
  const kicker = document.getElementById('modal-kicker');
  const coords = document.getElementById('modal-coords');
  const yandex = document.getElementById('modal-yandex');
  const closeButton = modal?.querySelector('.modal__close');
  if (!modal || !mapElement || !title || !coords || !yandex) {
    return { open() {}, close() {}, destroy() {} };
  }

  let map = null;
  let marker = null;
  let mapPromise = null;
  let leaflet = null;
  let activePlace = null;
  let lastFocus = null;
  let openToken = 0;
  let isOpen = false;

  function buildMarkerIcon() {
    return leaflet.divIcon({
      className: 'place-marker-icon',
      html: '<span class="place-marker" aria-hidden="true"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  async function ensureMap() {
    if (map) return map;
    if (mapPromise) return mapPromise;

    mapPromise = (async () => {
      await import('leaflet/dist/leaflet.css');
      const module = await import('leaflet');
      leaflet = module.default ?? module;

      map = leaflet.map(mapElement, {
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: false,
        zoomSnap: 0.25,
        preferCanvas: true,
      });

      // Leaflet 1.9.4 вшивает украинский флаг в префикс атрибуции.
      // Оставляем только атрибуцию тайлов OpenStreetMap.
      leaflet.control.attribution({ prefix: false }).addTo(map);
      mapElement
        .querySelectorAll('.leaflet-attribution-flag')
        .forEach((node) => node.remove());

      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          subdomains: 'abc',
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        })
        .addTo(map);

      marker = leaflet
        .marker([CONFIG.places.zags.lat, CONFIG.places.zags.lng], {
          icon: buildMarkerIcon(),
          keyboard: false,
        })
        .addTo(map);

      return map;
    })();

    return mapPromise;
  }

  function placeContent(key) {
    const place = CONFIG.places[key];
    if (!place) return;

    activePlace = key;
    title.textContent = place.name;
    kicker.textContent = key === 'zags' ? '[ карта · церемония ]' : '[ карта · праздник ]';
    coords.textContent = `[ ${place.lat.toFixed(6)} · ${place.lng.toFixed(6)} ]`;
    yandex.href = place.yandexUrl;
    yandex.setAttribute('aria-label', `Открыть «${place.name}» в Яндекс.Картах`);
  }

  async function showMap() {
    const place = CONFIG.places[activePlace];
    if (!place) return;
    const token = openToken;
    try {
      await ensureMap();
      if (!isOpen || token !== openToken) return;

      marker.setLatLng([place.lat, place.lng]);
      map.setView([place.lat, place.lng], 16, { animate: false });
      window.setTimeout(() => {
        if (isOpen) map.invalidateSize();
      }, 80);
    } catch (error) {
      console.error('[map] не удалось загрузить карту', error);
      mapElement.classList.add('is-error');
    }
  }

  function open(key) {
    if (!CONFIG.places[key]) return;
    if (isOpen && activePlace === key) return;

    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    placeContent(key);
    isOpen = true;
    openToken += 1;
    modal.classList.add('is-open');
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    onOpen?.();

    window.setTimeout(() => closeButton?.focus({ preventScroll: true }), 260);
    showMap();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    openToken += 1;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    document.body.classList.remove('is-locked');
    onClose?.();

    if (lastFocus && document.contains(lastFocus)) {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  function onDocumentKeydown(event) {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = [
      ...modal.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const buttons = [...document.querySelectorAll('[data-place]')];
  const listeners = buttons.map((button) => {
    const handler = () => open(button.dataset.place);
    button.addEventListener('click', handler);
    return () => button.removeEventListener('click', handler);
  });

  const closeTargets = [...modal.querySelectorAll('[data-close]')];
  const closeListeners = closeTargets.map((element) => {
    const handler = () => close();
    element.addEventListener('click', handler);
    return () => element.removeEventListener('click', handler);
  });

  const onResize = () => {
    if (isOpen && map) map.invalidateSize();
  };

  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('resize', onResize, { passive: true });

  return {
    open,
    close,
    destroy() {
      close();
      listeners.forEach((remove) => remove());
      closeListeners.forEach((remove) => remove());
      document.removeEventListener('keydown', onDocumentKeydown);
      window.removeEventListener('resize', onResize);
      map?.remove();
      map = null;
      marker = null;
    },
  };
}
