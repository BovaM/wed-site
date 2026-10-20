import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function createSceneTimeline({ trigger, onUpdate }) {
  const state = { progress: 0 };

  const tween = gsap.to(state, {
    progress: 1,
    ease: 'none',
    onUpdate: () => onUpdate(state.progress),
    scrollTrigger: {
      trigger,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });

  function refresh() {
    ScrollTrigger.refresh();
  }

  function destroy() {
    tween.scrollTrigger?.kill();
    tween.kill();
  }

  return {
    state,
    refresh,
    destroy,
    trigger: tween.scrollTrigger,
  };
}
