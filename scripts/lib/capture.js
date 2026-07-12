const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MACOS_BROWSER_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const LINUX_BROWSER_COMMANDS = ['chromium', 'google-chrome', 'chrome'];

function isExecutable(file) {
  if (!file) return false;
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveBrowserExecutable(env = process.env, platform = process.platform) {
  if (isExecutable(env.CHROME_PATH)) return env.CHROME_PATH;

  if (platform === 'darwin') {
    const macosBrowser = MACOS_BROWSER_PATHS.find(isExecutable);
    if (macosBrowser) return macosBrowser;
  }

  if (platform === 'linux') {
    for (const command of LINUX_BROWSER_COMMANDS) {
      try {
        const resolved = execFileSync('which', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (isExecutable(resolved)) return resolved;
      } catch {
        // Try the next executable name.
      }
    }
  }

  throw new Error(
    'No Chrome/Chromium browser executable found. Set CHROME_PATH to a Chrome, Chromium, or Edge executable, '
      + 'or install one of those browsers and run compare:score again.',
  );
}

async function findCaptureElement(page, { selector, sectionIndex }) {
  if (selector) {
    try {
      const element = await page.$(selector);
      return element
        ? { element, warning: null }
        : { element: null, warning: `selector "${selector}" did not match an element` };
    } catch (error) {
      return { element: null, warning: `selector "${selector}" is invalid: ${error.message}` };
    }
  }

  if (Number.isInteger(sectionIndex) && sectionIndex >= 0) {
    const handle = await page.evaluateHandle((index) => (
      Array.from(document.querySelectorAll('body section'))
        .filter((section) => !section.parentElement.closest('section'))[index] || null
    ), sectionIndex);
    const element = handle.asElement();
    if (element) return { element, warning: null };
    await handle.dispose();
    return {
      element: null,
      warning: `top-level section index ${sectionIndex} is out of range`,
    };
  }

  return { element: null, warning: null };
}

async function captureBreakpoints({
  liveUrl,
  breakpoints,
  outputPathFor,
  settleDelayMs = 250,
  selector = null,
  sectionIndex = null,
  sectionName = null,
  fullPage = false,
}) {
  const executablePath = resolveBrowserExecutable();
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const captures = {};

  try {
    for (const breakpoint of breakpoints) {
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: breakpoint.width,
          height: 800,
          deviceScaleFactor: 1,
        });
        // 'load' rather than networkidle: dev servers hold a live-reload
        // SSE/websocket connection open, so the network never goes idle.
        await page.goto(liveUrl, { waitUntil: 'load' });
        await page.evaluate(async () => {
          if (document.fonts?.ready) await document.fonts.ready;
          const images = Array.from(document.images);
          await Promise.all(images.map((img) => (img.complete
            ? Promise.resolve()
            : new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); }))));
        });
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              animation-delay: 0s !important;
              animation-duration: 0s !important;
              animation-iteration-count: 1 !important;
              scroll-behavior: auto !important;
              transition-delay: 0s !important;
              transition-duration: 0s !important;
              caret-color: transparent !important;
            }
          `,
        });
        await new Promise((resolve) => setTimeout(resolve, settleDelayMs));

        const outputPath = outputPathFor(breakpoint);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const captureTarget = fullPage
          ? { element: null, warning: null }
          : await findCaptureElement(page, { selector, sectionIndex });

        if (captureTarget.warning) {
          const targetLabel = sectionName ? ` for section "${sectionName}"` : '';
          console.warn(
            `Warning: ${captureTarget.warning}${targetLabel} at ${breakpoint.name}. Falling back to full-page capture.`,
          );
        }

        if (captureTarget.element) {
          try {
            const box = await captureTarget.element.boundingBox();
            if (!box) {
              console.warn(
                `Warning: scoped element has no bounding box at ${breakpoint.name}. Falling back to full-page capture.`,
              );
              await page.screenshot({ path: outputPath, fullPage: true });
            } else {
              if (box.width !== breakpoint.width) {
                console.warn(
                  `Warning: scoped element width ${box.width}px differs from viewport width ${breakpoint.width}px `
                    + `at ${breakpoint.name}.`,
                );
              }
              await captureTarget.element.screenshot({ path: outputPath });
            }
          } finally {
            await captureTarget.element.dispose();
          }
        } else {
          await page.screenshot({ path: outputPath, fullPage: true });
        }
        captures[breakpoint.name] = outputPath;
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return captures;
}

module.exports = {
  LINUX_BROWSER_COMMANDS,
  MACOS_BROWSER_PATHS,
  captureBreakpoints,
  findCaptureElement,
  resolveBrowserExecutable,
};
