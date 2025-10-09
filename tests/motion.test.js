import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initMotionScene } from '../public/js/holographic/motion.js';

describe('initMotionScene', () => {
  let mediaQuery;
  let changeHandler;

  function setupMediaQuery(matches = false) {
    changeHandler = undefined;
    mediaQuery = {
      matches,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'change') {
          changeHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
      addListener: undefined,
      removeListener: undefined
    };

  }

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('responds to motion preference changes', () => {
    setupMediaQuery(true);

    const scene = document.createElement('div');
    const mouseXDisplay = document.createElement('span');
    const mouseYDisplay = document.createElement('span');
    const motionStatusLabel = document.createElement('span');

    document.body.append(scene, mouseXDisplay, mouseYDisplay, motionStatusLabel);

    const controls = initMotionScene({
      scene,
      mouseXDisplay,
      mouseYDisplay,
      motionStatusLabel,
      documentRef: document,
      matchMedia: () => mediaQuery,
      particleCount: 0
    });

    expect(motionStatusLabel.textContent).toBe('Reduced');
    expect(motionStatusLabel.classList.contains('reduced')).toBe(true);
    expect(document.body.classList.contains('reduced-motion')).toBe(true);

    mediaQuery.matches = false;
    expect(changeHandler).toBeTypeOf('function');
    changeHandler();

    expect(motionStatusLabel.textContent).toBe('Active');
    expect(motionStatusLabel.classList.contains('reduced')).toBe(false);
    expect(document.body.classList.contains('reduced-motion')).toBe(false);

    controls.dispose();

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('applies parallax transforms and cleans up on dispose', () => {
    setupMediaQuery(false);

    const scene = document.createElement('div');
    const mouseXDisplay = document.createElement('span');
    const mouseYDisplay = document.createElement('span');
    const particlesContainer = document.createElement('div');
    const card = document.createElement('div');

    document.body.append(scene, mouseXDisplay, mouseYDisplay, particlesContainer, card);

    const controls = initMotionScene({
      scene,
      mouseXDisplay,
      mouseYDisplay,
      particlesContainer,
      cards: [card],
      documentRef: document,
      matchMedia: () => mediaQuery,
      particleCount: 2
    });

    expect(particlesContainer.querySelectorAll('.particle')).toHaveLength(2);

    document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 100, clientY: 100 }));

    expect(scene.style.transform).not.toBe('');
    expect(mouseXDisplay.textContent).not.toBe('0');
    expect(mouseYDisplay.textContent).not.toBe('0');

    card.dispatchEvent(new window.Event('mouseenter'));
    const transformBeforeHover = scene.style.transform;
    document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 150, clientY: 150 }));
    expect(scene.style.transform).toBe(transformBeforeHover);

    card.dispatchEvent(new window.Event('mouseleave'));
    document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 200, clientY: 200 }));
    expect(scene.style.transform).not.toBe(transformBeforeHover);

    controls.dispose();

    expect(particlesContainer.querySelectorAll('.particle')).toHaveLength(0);
    expect(mouseXDisplay.textContent).toBe('0');
    expect(mouseYDisplay.textContent).toBe('0');

    document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

    expect(mouseXDisplay.textContent).toBe('0');
    expect(mouseYDisplay.textContent).toBe('0');
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
