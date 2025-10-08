const DEFAULT_PARTICLE_COUNT = 50;

function getMotionPreferenceMediaQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { matches: false };
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

function toggleParticleAnimation(particles, enabled) {
  particles.forEach(particle => {
    if (!particle) return;
    particle.style.animationPlayState = enabled ? 'running' : 'paused';
  });
}

export function initMotionScene({
  scene,
  mouseXDisplay,
  mouseYDisplay,
  motionStatusLabel,
  particlesContainer,
  cards = []
} = {}) {
  const prefersReducedMotion = getMotionPreferenceMediaQuery();
  const particleElements = [];
  let parallaxEnabled = !prefersReducedMotion.matches;
  let isCardHovered = false;

  function updateMotionPreference() {
    parallaxEnabled = !prefersReducedMotion.matches;

    if (scene && !parallaxEnabled) {
      scene.style.transform = '';
    }

    if (motionStatusLabel) {
      motionStatusLabel.textContent = parallaxEnabled ? 'Active' : 'Reduced';
      motionStatusLabel.classList.toggle('reduced', !parallaxEnabled);
    }

    if (!parallaxEnabled) {
      if (mouseXDisplay) mouseXDisplay.textContent = 0;
      if (mouseYDisplay) mouseYDisplay.textContent = 0;
    }

    document.body.classList.toggle('reduced-motion', !parallaxEnabled);
    toggleParticleAnimation(particleElements, parallaxEnabled);
  }

  function handleMouseMove(event) {
    if (!parallaxEnabled) {
      if (mouseXDisplay) mouseXDisplay.textContent = 0;
      if (mouseYDisplay) mouseYDisplay.textContent = 0;
      return;
    }

    const x = (event.clientX / window.innerWidth - 0.5) * 8;
    const y = (event.clientY / window.innerHeight - 0.5) * 8;

    if (!isCardHovered && scene) {
      scene.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
    }

    if (mouseXDisplay) mouseXDisplay.textContent = Math.round(x);
    if (mouseYDisplay) mouseYDisplay.textContent = Math.round(y);
  }

  function registerCardHover(card) {
    if (!card || typeof card.addEventListener !== 'function') {
      return;
    }

    card.addEventListener('mouseenter', () => {
      isCardHovered = true;
    });

    card.addEventListener('mouseleave', () => {
      isCardHovered = false;
    });
  }

  if (particlesContainer) {
    for (let i = 0; i < DEFAULT_PARTICLE_COUNT; i += 1) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 10}s`;
      particle.style.animationDuration = `${Math.random() * 10 + 10}s`;
      particle.style.animationPlayState = parallaxEnabled ? 'running' : 'paused';
      particlesContainer.appendChild(particle);
      particleElements.push(particle);
    }
  }

  if (Array.isArray(cards) || cards instanceof NodeList) {
    cards.forEach(registerCardHover);
  }

  updateMotionPreference();
  document.addEventListener('mousemove', handleMouseMove);

  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', updateMotionPreference);
  } else if (typeof prefersReducedMotion.addListener === 'function') {
    prefersReducedMotion.addListener(updateMotionPreference);
  }

  return {
    updateMotionPreference,
    dispose() {
      document.removeEventListener('mousemove', handleMouseMove);
      if (typeof prefersReducedMotion.removeEventListener === 'function') {
        prefersReducedMotion.removeEventListener('change', updateMotionPreference);
      } else if (typeof prefersReducedMotion.removeListener === 'function') {
        prefersReducedMotion.removeListener(updateMotionPreference);
      }
    }
  };
}
