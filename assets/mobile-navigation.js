// Route links should open at the top on small screens, rather than retaining
// the previous page's deep scroll position. Leave back/forward restoration alone.
document.addEventListener('click', (event) => {
  if (!window.matchMedia('(max-width: 1023px)').matches || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
  const destination = new URL(link.href, location.href);
  if (destination.origin !== location.origin || destination.pathname === location.pathname || destination.hash) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (location.pathname === destination.pathname) window.scrollTo({top: 0, left: 0, behavior: 'instant'});
  }));
}, {capture: true});
