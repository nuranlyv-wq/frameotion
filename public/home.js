import './locale.js';
// Previously shared generation URLs still open the motion workspace.
const run = new URLSearchParams(location.search).get('run');
if (run && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(run)) {
  location.replace(`/motion.html?run=${encodeURIComponent(run)}`);
}
if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.studio-visual video').forEach(video => {
    video.autoplay = false;
    video.pause();
  });
}
