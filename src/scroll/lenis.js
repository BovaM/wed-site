import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function createScroll() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lenis = new Lenis({
    duration: reducedMotion ? 0.8 : 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: !reducedMotion,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.15,
    syncTouch: false,
    autoRaf: false,
  });

  let stopped = false;

  function onScroll() {
    ScrollTrigger.update();
  }

  function raf(time) {
    if (!stopped) lenis.raf(time * 1000);
  }

  lenis.on('scroll', onScroll);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  return {
    lenis,
    stop() {
      stopped = true;
      lenis.stop();
    },
    start() {
      stopped = false;
      lenis.start();
    },
    destroy() {
      stopped = true;
      gsap.ticker.remove(raf);
      lenis.off('scroll', onScroll);
      lenis.destroy();
    },
  };
}
