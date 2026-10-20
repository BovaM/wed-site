function splitChars(element) {
  const text = element.textContent ?? '';
  element.setAttribute('aria-label', text);
  element.textContent = '';

  const fragment = document.createDocumentFragment();
  [...text].forEach((char, index) => {
    if (char === ' ') {
      fragment.appendChild(document.createTextNode(' '));
      return;
    }
    const span = document.createElement('span');
    span.className = 'split-char';
    span.setAttribute('aria-hidden', 'true');
    span.style.setProperty('--char-index', String(index));
    span.textContent = char;
    fragment.appendChild(span);
  });

  element.appendChild(fragment);
}

export function initReveal() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splitTargets = [...document.querySelectorAll('[data-split="chars"]')];
  const revealTargets = [...document.querySelectorAll('[data-reveal]')];

  splitTargets.forEach(splitChars);

  revealTargets.forEach((element, index) => {
    if (element.hasAttribute('data-split')) return;
    element.style.setProperty('--reveal-delay', String((index % 4) * 65));
  });

  if (reducedMotion) {
    [...splitTargets, ...revealTargets].forEach((element) => {
      element.classList.add('is-inview');
    });
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-inview');
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: '0px 0px -7% 0px',
      threshold: 0.12,
    },
  );

  [...splitTargets, ...revealTargets].forEach((element) => observer.observe(element));

  return () => observer.disconnect();
}
