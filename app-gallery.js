// app-gallery.js — vanilla renderer for the app-gallery block.
//
// Expects window.RW_APPS and window.RW_APP_GALLERY_UI_ICONS (both populated
// by apps.js). Finds any .rw-app-gallery element on the page and renders the
// card strip into it. Reads data-current to omit the active app.
//
// Usage:
//   <link rel="stylesheet" href="./app-gallery.css">
//   <script src="./apps.js" defer></script>
//   <script src="./app-gallery.js" defer></script>
//   ...
//   <div class="rw-app-gallery" data-current="wind-calculator"></div>
//
// Under the card strip it also renders the "Or get all my calculators on iPhone
// and iPad" panel (the Running Writings Lab iOS app pitch, 2026-10-25): band of
// five phones hosted once on the hub, the pitch, and Get the App / Learn more.
// Android browsers get the Google Play version of it (2026-11-18): "Or get all my
// calculators on your phone", a Play-bag glyph on Get the App.
// Opt out on a page with data-promo="false".

(function () {
  const HEADING_TEXT = 'Check out my other apps';

  // The iOS-app panel. Copy lives here (John's wording, 2026-10-25); the App Store
  // link carries its own campaign token (ct=rwlab-gallery) so App Analytics can
  // tell gallery clicks from the landing page's QR and buttons. The buttons also
  // carry Plausible tagged-event classes (every calculator page loads
  // script.tagged-events.js for apps.runningwritings.com): goals "CTA AppStore
  // Click" / "CTA LabSite Click" with placement=gallery, same names as lab-site.
  //
  // Android browsers (Chrome, Samsung Internet, Firefox: every one keeps "Android"
  // in its user agent, Chrome's reduced UA included; lab-site's nav uses the same
  // test) see the Google Play version (John, 2026-11-18): headingAndroid, a
  // Play-bag glyph on Get the App, the Play link with UTM tags (utm_campaign=
  // rwlab-gallery, the Play counterpart of ct=, shown in Play Console's store-
  // listing acquisition report) and Plausible goal "CTA PlayStore Click". The band
  // and the paragraph are the same on both.
  const PROMO = {
    heading: 'Or get all my calculators on iPhone and iPad',
    headingAndroid: 'Or get all my calculators on your phone',
    bandSrc: 'https://apps.runningwritings.com/images/rw-lab-band.png',
    bandAlt: 'Five Running Writings Lab calculators on iPhone',
    textHtml:
      '<b>Running Writings Lab</b> puts all of my training tools in one place, with features that are only possible in an app: live weather data, haptic inputs, and offline functionality. <b>$9.99</b> one-time purchase. No subscription and no ads.',
    appStoreHref:
      'https://apps.apple.com/app/apple-store/id6807671361?pt=129397724&ct=rwlab-gallery&mt=8',
    appStoreLabel: 'Get the App',
    playStoreHref:
      'https://play.google.com/store/apps/details?id=com.runningwritings.lab&utm_source=rw-apps&utm_campaign=rwlab-gallery',
    learnMoreHref: 'https://lab.runningwritings.com/',
    learnMoreLabel: 'Learn more',
  };
  const APPLE_GLYPH =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16.37 12.7c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.63 1.11 8.8.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.15.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.55zM14.18 6.22c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.58-2.57 1.32-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.59-1.24z"/></svg>';

  // Material Symbols "shop" (a bag with a play triangle; Apache 2.0, the gallery
  // cards' icon set) rather than Google's Android robot, whose CC BY 3.0 licence
  // would need a credit line in the panel (John, 2026-11-18). Not the Google Play
  // logo either: Google allows that only inside its official badge.
  const PLAY_GLYPH =
    '<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="m384-244 266-175-266-176v351ZM140-120q-24 0-42-18t-18-42v-540h240v-100q0-24 18-42t42-18h200q24 0 42 18t18 42v100h240v540q0 24-18 42t-42 18H140Zm0-60h680v-480H140v480Zm240-540h200v-100H380v100ZM140-180v-480 480Z"/></svg>';

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function svgElementFrom(svgString) {
    const tmp = document.createElement('div');
    tmp.innerHTML = svgString.trim();
    return tmp.firstElementChild;
  }

  function buildCard(app) {
    const a = document.createElement('a');
    a.className = 'rw-app-gallery__card';
    a.href = app.href;
    a.setAttribute('data-app-id', app.id);

    const iconWrap = document.createElement('span');
    iconWrap.className = 'rw-app-gallery__icon';
    iconWrap.setAttribute('aria-hidden', 'true');
    const svg = svgElementFrom(app.iconSvg);
    if (svg) iconWrap.appendChild(svg);

    const title = document.createElement('span');
    title.className = 'rw-app-gallery__title';
    title.textContent = app.title;

    a.appendChild(iconWrap);
    a.appendChild(title);

    // Optional badge (apps.js `badge`, e.g. 'Experimental'): a small pill in the card's top-right corner.
    if (app.badge) {
      const badge = document.createElement('span');
      badge.className = 'rw-app-gallery__badge';
      badge.textContent = app.badge;
      a.appendChild(badge);
    }
    return a;
  }

  function buildArrow(direction, uiIcons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'rw-app-gallery__arrow rw-app-gallery__arrow--' + direction;
    btn.setAttribute(
      'aria-label',
      direction === 'left' ? 'Scroll to previous apps' : 'Scroll to more apps'
    );
    const svgString =
      direction === 'left' ? uiIcons.chevronLeft : uiIcons.chevronRight;
    const svg = svgElementFrom(svgString);
    if (svg) {
      svg.setAttribute('aria-hidden', 'true');
      btn.appendChild(svg);
    }
    return btn;
  }

  function buildPromo() {
    const android = isAndroid();
    const section = document.createElement('section');
    section.className = 'rw-app-promo';
    section.setAttribute('aria-labelledby', 'rw-app-promo-heading');

    const heading = document.createElement('h2');
    heading.className = 'rw-app-promo__heading';
    heading.id = 'rw-app-promo-heading';
    heading.textContent = android ? PROMO.headingAndroid : PROMO.heading;
    section.appendChild(heading);

    const band = document.createElement('img');
    band.className = 'rw-app-promo__band';
    band.src = PROMO.bandSrc;
    band.alt = PROMO.bandAlt;
    band.width = 2000;
    band.height = 667;
    band.loading = 'lazy';
    band.decoding = 'async';
    section.appendChild(band);

    const body = document.createElement('div');
    body.className = 'rw-app-promo__body';

    const text = document.createElement('p');
    text.className = 'rw-app-promo__text';
    text.innerHTML = PROMO.textHtml;
    body.appendChild(text);

    const row = document.createElement('div');
    row.className = 'rw-app-promo__row';

    const primary = document.createElement('a');
    primary.className =
      'rw-app-promo__btn rw-app-promo__btn--primary plausible-event-name=' +
      (android ? 'CTA+PlayStore+Click' : 'CTA+AppStore+Click') +
      ' plausible-event-placement=gallery';
    primary.href = android ? PROMO.playStoreHref : PROMO.appStoreHref;
    primary.target = '_blank';
    primary.rel = 'noopener';
    const glyph = svgElementFrom(android ? PLAY_GLYPH : APPLE_GLYPH);
    if (glyph) primary.appendChild(glyph);
    const primaryLabel = document.createElement('span');
    primaryLabel.textContent = PROMO.appStoreLabel;
    primary.appendChild(primaryLabel);
    row.appendChild(primary);

    const secondary = document.createElement('a');
    secondary.className =
      'rw-app-promo__btn rw-app-promo__btn--secondary plausible-event-name=CTA+LabSite+Click plausible-event-placement=gallery';
    secondary.href = PROMO.learnMoreHref;
    secondary.target = '_blank';
    secondary.rel = 'noopener';
    secondary.textContent = PROMO.learnMoreLabel;
    row.appendChild(secondary);

    body.appendChild(row);
    section.appendChild(body);
    return section;
  }

  function updateOverflowState(viewport, strip) {
    const hasOverflow = strip.scrollWidth - strip.clientWidth > 1;
    const atStart = strip.scrollLeft <= 1;
    const atEnd = strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1;

    viewport.setAttribute('data-overflow', hasOverflow ? 'true' : 'false');
    viewport.setAttribute(
      'data-overflow-start',
      hasOverflow && !atStart ? 'true' : 'false'
    );
    viewport.setAttribute(
      'data-overflow-end',
      hasOverflow && !atEnd ? 'true' : 'false'
    );
  }

  function getCardWidth(strip) {
    const firstCard = strip.querySelector('.rw-app-gallery__card');
    if (!firstCard) return 160;
    const style = window.getComputedStyle(strip);
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
    return firstCard.getBoundingClientRect().width + gap;
  }

  function render(root) {
    const apps = window.RW_APPS || [];
    const uiIcons = window.RW_APP_GALLERY_UI_ICONS || {};
    const currentId = root.getAttribute('data-current') || '';
    const showAll = root.getAttribute('data-all') === 'true';

    const visible = showAll
      ? apps
      : apps.filter(function (a) {
          return a.id !== currentId;
        });

    // Clear any existing content (re-render safe).
    root.innerHTML = '';

    const heading = document.createElement('h2');
    heading.className = 'rw-app-gallery__heading';
    heading.textContent = root.getAttribute('data-heading') || HEADING_TEXT;
    root.appendChild(heading);

    const viewport = document.createElement('div');
    viewport.className = 'rw-app-gallery__viewport';

    const strip = document.createElement('div');
    strip.className = 'rw-app-gallery__strip';
    strip.setAttribute('role', 'region');
    strip.setAttribute('aria-label', 'Other Running Writings apps');

    visible.forEach(function (app) {
      strip.appendChild(buildCard(app));
    });

    const leftArrow = buildArrow('left', uiIcons);
    const rightArrow = buildArrow('right', uiIcons);

    viewport.appendChild(strip);
    viewport.appendChild(leftArrow);
    viewport.appendChild(rightArrow);
    root.appendChild(viewport);

    if (root.getAttribute('data-promo') !== 'false') {
      root.appendChild(buildPromo());
    }

    // Arrow click handlers — scroll by ~one card width.
    leftArrow.addEventListener('click', function () {
      strip.scrollBy({ left: -getCardWidth(strip), behavior: 'smooth' });
    });
    rightArrow.addEventListener('click', function () {
      strip.scrollBy({ left: getCardWidth(strip), behavior: 'smooth' });
    });

    // Boundary-state recomputation.
    const recompute = function () {
      updateOverflowState(viewport, strip);
    };
    strip.addEventListener('scroll', recompute, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(recompute);
      ro.observe(strip);
    } else {
      window.addEventListener('resize', recompute);
    }

    // Fonts / images can change the card size after the first layout; compute
    // again on the next frame and one more time after a beat.
    requestAnimationFrame(recompute);
    setTimeout(recompute, 250);
    recompute();
  }

  ready(function () {
    const roots = document.querySelectorAll('.rw-app-gallery');
    roots.forEach(render);
  });
})();
