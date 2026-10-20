const NEAR_VIEWPORT_MARGIN = "0px 0px 100% 0px";

export function nearViewport(node: Element, onNear: () => void) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      onNear();
      observer.unobserve(node);
      observer.observe(node);
    },
    { rootMargin: NEAR_VIEWPORT_MARGIN },
  );
  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
