/**
 * Nimbus - AI-Powered Cloud Guardian
 * Interactive Effects & Animations
 *
 * A Paul Phillips Manifestation
 * Paul@clearseassolutions.com
 */

import { copyTextToClipboard } from './js/shared/clipboard.js';

// Particle System
function initParticles() {
    const container = document.getElementById('particles-container');
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Random starting position
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';

        // Random animation delay
        particle.style.animationDelay = Math.random() * 20 + 's';

        // Random animation duration
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';

        // Random opacity
        particle.style.opacity = 0.3 + Math.random() * 0.5;

        container.appendChild(particle);
    }
}

// Smooth scroll for anchor links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href !== '') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
}

// Parallax effect on scroll
function initParallax() {
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const scrolled = window.pageYOffset;
                const particles = document.querySelectorAll('.particle');

                particles.forEach((particle, index) => {
                    const speed = 0.5 + (index % 3) * 0.2;
                    particle.style.transform = `translateY(${scrolled * speed}px)`;
                });

                ticking = false;
            });
            ticking = true;
        }
    });
}

// Mouse move parallax effect
function initMouseParallax() {
    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    function animate() {
        // Smooth easing
        currentX += (mouseX - currentX) * 0.1;
        currentY += (mouseY - currentY) * 0.1;

        // Apply to feature cards
        const cards = document.querySelectorAll('.feature-card, .pricing-card');
        cards.forEach((card, index) => {
            const depth = (index % 3 + 1) * 5;
            card.style.transform = `
                translateX(${currentX * depth}px)
                translateY(${currentY * depth}px)
            `;
        });

        requestAnimationFrame(animate);
    }

    animate();
}

// Intersection Observer for fade-in animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all cards
    const cards = document.querySelectorAll('.feature-card, .step, .catch-card, .pricing-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(50px)';
        card.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });
}

// Copy code to clipboard
function initCodeCopy() {
    document.querySelectorAll('pre code').forEach((codeBlock) => {
        const button = document.createElement('button');
        button.className = 'copy-button';
        button.textContent = 'Copy';
        button.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(34, 211, 238, 0.2);
            border: 1px solid rgba(34, 211, 238, 0.5);
            color: #22d3ee;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.3s ease;
        `;

        const pre = codeBlock.parentElement;
        pre.style.position = 'relative';
        pre.appendChild(button);

        button.addEventListener('click', async () => {
            const code = codeBlock.textContent;
            try {
                await copyTextToClipboard(code, { documentRef: document, windowRef: window });
                button.textContent = '✓ Copied!';
                button.style.background = 'rgba(34, 211, 238, 0.4)';

                setTimeout(() => {
                    button.textContent = 'Copy';
                    button.style.background = 'rgba(34, 211, 238, 0.2)';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy code example', err);
                button.textContent = '✗ Failed';
                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 2000);
            }
        });

        button.addEventListener('mouseenter', () => {
            button.style.background = 'rgba(34, 211, 238, 0.3)';
            button.style.transform = 'scale(1.05)';
        });

        button.addEventListener('mouseleave', () => {
            if (button.textContent === 'Copy') {
                button.style.background = 'rgba(34, 211, 238, 0.2)';
            }
            button.style.transform = 'scale(1)';
        });
    });
}

// Stats counter animation
function initStatsCounter() {
    const stats = document.querySelectorAll('.stat-number');

    const observerOptions = {
        threshold: 0.5
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.counted) {
                entry.target.dataset.counted = 'true';
                animateCounter(entry.target);
            }
        });
    }, observerOptions);

    stats.forEach(stat => observer.observe(stat));
}

function animateCounter(element) {
    const text = element.textContent;
    const hasPercent = text.includes('%');
    const hasPlus = text.includes('+');
    const number = parseInt(text.replace(/[^\d]/g, ''));

    if (isNaN(number)) return;

    const duration = 2000;
    const steps = 60;
    const increment = number / steps;
    let current = 0;

    const timer = setInterval(() => {
        current += increment;
        if (current >= number) {
            current = number;
            clearInterval(timer);
        }

        let displayText = Math.floor(current).toString();
        if (text.includes('s')) displayText += 's';
        if (hasPercent) displayText += '%';
        if (hasPlus) displayText += '+';

        element.textContent = displayText;
    }, duration / steps);
}

// Add glow effect on hover
function initGlowEffects() {
    const buttons = document.querySelectorAll('.btn');

    buttons.forEach(button => {
        button.addEventListener('mouseenter', function(e) {
            const rect = this.getBoundingClientRect();
            const glow = document.createElement('div');
            glow.className = 'glow-effect';
            glow.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle at ${e.clientX - rect.left}px ${e.clientY - rect.top}px,
                    rgba(167, 139, 250, 0.4),
                    transparent 50%);
                pointer-events: none;
                border-radius: 12px;
            `;
            this.appendChild(glow);

            setTimeout(() => glow.remove(), 600);
        });
    });
}

// Initialize all effects when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('☁️ Nimbus - AI-Powered Cloud Guardian');
    console.log('Initializing holographic interface...');

    initParticles();
    initSmoothScroll();
    initParallax();
    initMouseParallax();
    initScrollAnimations();
    initCodeCopy();
    initStatsCounter();
    initGlowEffects();

    console.log('✨ All systems operational');
});

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K to focus search (if search exists)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"]');
        if (searchInput) searchInput.focus();
    }

    // Escape to close modals/overlays
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal, .overlay');
        modals.forEach(modal => modal.style.display = 'none');
    }
});

// Performance monitoring
if (window.performance && window.performance.timing) {
    window.addEventListener('load', () => {
        setTimeout(() => {
            const timing = window.performance.timing;
            const loadTime = timing.loadEventEnd - timing.navigationStart;
            console.log(`⚡ Page loaded in ${loadTime}ms`);
        }, 0);
    });
}