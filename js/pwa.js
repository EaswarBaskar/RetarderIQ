if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(error => {
    console.warn('[PWA] Service worker registration failed:', error);
  }));
}
