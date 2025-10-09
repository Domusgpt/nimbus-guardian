const DEFAULT_PARTICLE_COUNT = 50;

function getMotionPreferenceMediaQuery(matchMedia) {
  if (typeof matchMedia === 'function') {
    return matchMedia('(prefers-reduced-motion: reduce)');
  }

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
  cards = [],
  particleCount = DEFAULT_PARTICLE_COUNT,
  documentRef = typeof document !== 'undefined' ? document : undefined,
  matchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : undefined
} = {}) {
  const prefersReducedMotion = getMotionPreferenceMediaQuery(matchMedia);
  const particleElements = [];
  const cardListeners = [];
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

    if (documentRef?.body?.classList?.toggle) {
      documentRef.body.classList.toggle('reduced-motion', !parallaxEnabled);
    }

    toggleParticleAnimation(particleElements, parallaxEnabled);
  }

  function handleMouseMove(event) {
    if (!parallaxEnabled) {
      if (mouseXDisplay) mouseXDisplay.textContent = 0;
      if (mouseYDisplay) mouseYDisplay.textContent = 0;
      return;
    }

    const width = typeof window !== 'undefined' ? window.innerWidth : documentRef?.documentElement?.clientWidth || 1;
    const height = typeof window !== 'undefined' ? window.innerHeight : documentRef?.documentElement?.clientHeight || 1;

    const x = (event.clientX / width - 0.5) * 8;
    const y = (event.clientY / height - 0.5) * 8;

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

    const handleEnter = () => {
      isCardHovered = true;
    };

    const handleLeave = () => {
      isCardHovered = false;
    };

    card.addEventListener('mouseenter', handleEnter);
    card.addEventListener('mouseleave', handleLeave);
    cardListeners.push({ card, handleEnter, handleLeave });
  }

  if (particlesContainer && documentRef?.createElement) {
    for (let i = 0; i < particleCount; i += 1) {
      const particle = documentRef.createElement('div');
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

  if (cards) {
    Array.from(cards).forEach(registerCardHover);
  }

  updateMotionPreference();

  if (documentRef?.addEventListener) {
    documentRef.addEventListener('mousemove', handleMouseMove);
  }

  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', updateMotionPreference);
  } else if (typeof prefersReducedMotion.addListener === 'function') {
    prefersReducedMotion.addListener(updateMotionPreference);
  }

  return {
    updateMotionPreference,
    dispose() {
      if (scene) {
        scene.style.transform = '';
      }

      if (documentRef?.removeEventListener) {
        documentRef.removeEventListener('mousemove', handleMouseMove);
      }

      if (typeof prefersReducedMotion.removeEventListener === 'function') {
        prefersReducedMotion.removeEventListener('change', updateMotionPreference);
      } else if (typeof prefersReducedMotion.removeListener === 'function') {
        prefersReducedMotion.removeListener(updateMotionPreference);
      }

      cardListeners.forEach(({ card, handleEnter, handleLeave }) => {
        if (!card?.removeEventListener) return;
        card.removeEventListener('mouseenter', handleEnter);
        card.removeEventListener('mouseleave', handleLeave);
      });
      cardListeners.length = 0;

      toggleParticleAnimation(particleElements, false);

      if (particlesContainer) {
        particleElements.forEach(particle => {
          if (!particle) return;
          if (typeof particle.remove === 'function') {
            particle.remove();
          } else if (particle.parentNode === particlesContainer && particlesContainer.removeChild) {
            particlesContainer.removeChild(particle);
          }
        });
      }

      particleElements.length = 0;

      if (motionStatusLabel?.classList?.remove) {
        motionStatusLabel.classList.remove('reduced');
      }

      if (documentRef?.body?.classList?.remove) {
        documentRef.body.classList.remove('reduced-motion');
      }

      if (mouseXDisplay) {
        mouseXDisplay.textContent = 0;
      }

      if (mouseYDisplay) {
        mouseYDisplay.textContent = 0;
      }
    }
  };
}
