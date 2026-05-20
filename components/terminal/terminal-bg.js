(function () {
  'use strict';

  const PROMPT     = 'C:\\ITSCHU.GG> ';
  const CHAR_MIN   = 32;  // ms between typed characters (min)
  const CHAR_MAX   = 78;  // ms between typed characters (max)
  const OUT_DELAY  = 52;  // ms between output lines appearing
  const FADE_START = 5;   // lines from bottom before fade begins
  const FADE_RANGE = 22;  // lines over which to go from clear → nearly invisible

  const SCRIPT = [
    { t:'h', s:'Microsoft Windows [Version 2.0.26200.8246]' },
    { t:'h', s:'(c) ItsChugg. All rights reserved.'         },
    { t:'b' },
    { t:'c', s:'whoami',                    p:1000 },
    { t:'o', s:'HOST\\ITSCHUGG'                    },
    { t:'b' },
    { t:'c', s:'systeminfo',                p:750  },
    { t:'o', s:'Host Name:      ITSCHU.GG'         },
    { t:'o', s:'OS Version:     2.0.26200'          },
    { t:'o', s:'Build Type:     PUBLIC'             },
    { t:'o', s:'User Status:    ACTIVE'             },
    { t:'b' },
    { t:'c', s:'dir /b',                    p:650  },
    { t:'o', s:'evolutionary\\'                     },
    { t:'o', s:'globe\\'                            },
    { t:'o', s:'index.html'                         },
    { t:'b' },
    { t:'c', s:'sc query',                  p:800  },
    { t:'o', s:'SERVICE_NAME: EVOLUTIONARY.WIKI'   },
    { t:'o', s:'        STATE              : 4  RUNNING' },
    { t:'o', s:'SERVICE_NAME: GLOBE.VIEWER'         },
    { t:'o', s:'        STATE              : 4  RUNNING' },
    { t:'b' },
    { t:'c', s:'net user itschugg',         p:720  },
    { t:'o', s:'User name          ITSCHUGG'        },
    { t:'o', s:'Full Name          Russell G. Rinaldo' },
    { t:'o', s:'Comment            Host, Programmer, Creator' },
    { t:'o', s:'User active        Yes'             },
    { t:'b' },
    { t:'c', s:'ping evolutionary.itschu.gg', p:620 },
    { t:'o', s:'Pinging evolutionary.itschu.gg [185.199.108.153]:' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'b' },
    { t:'o', s:'Ping statistics for 185.199.108.153:'              },
    { t:'o', s:'    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)' },
    { t:'b' },
  ];

  /* ── helpers ──────────────────────────────────────────────────────────── */

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── state ────────────────────────────────────────────────────────────── */

  let lines      = [];   // committed lines (strings), index 0 = oldest
  let cursorLine = '';   // currently-typing line; shown with blinking cursor
  let container  = null; // #terminal-bg element

  /* ── render ───────────────────────────────────────────────────────────── */

  function render() {
    if (!container) return;

    const n = lines.length;
    let html = '';

    lines.forEach((text, i) => {
      // age: 0 = newest (bottom of array), n-1 = oldest (top)
      const age = n - 1 - i;
      const t   = clamp((age - FADE_START) / FADE_RANGE, 0, 1);

      // Opacity: 1 → ~0.08 (the CSS color already sets baseline transparency)
      // Blur:    0 → 3 px
      const opacity = 1 - t * 0.92;
      const blur    = t * 3;

      const style = t > 0
        ? ` style="opacity:${opacity.toFixed(3)};filter:blur(${blur.toFixed(2)}px)"`
        : '';

      html += `<div class="tline"${style}>${esc(text)}</div>`;
    });

    // Active cursor line always at the bottom, never faded
    if (cursorLine !== null) {
      html += `<div class="tline">${esc(cursorLine)}<span class="tcursor"> </span></div>`;
    }

    container.innerHTML = `<div class="terminal-inner">${html}</div>`;
  }

  function pushLine(text) {
    lines.push(text);
    // No need to trim — fixed container clips overflow at the top
  }

  /* ── main sequence (runs once, no loop) ──────────────────────────────── */

  async function runTerminal() {
    for (const item of SCRIPT) {
      switch (item.t) {

        case 'h':
          pushLine(item.s);
          render();
          break;

        case 'b':
          pushLine('');
          render();
          break;

        case 'c': {
          // Show current state, pause, then type the command
          render();
          await sleep(item.p ?? 800);
          cursorLine = PROMPT;
          render();

          for (const ch of item.s) {
            cursorLine += ch;
            render();
            await sleep(rand(CHAR_MIN, CHAR_MAX));
          }

          // Promote typed command into committed lines
          const done = cursorLine;
          cursorLine = '';
          pushLine(done);
          render();
          break;
        }

        case 'o':
          await sleep(OUT_DELAY);
          pushLine(item.s);
          render();
          break;
      }
    }

    // Idle: show prompt with blinking cursor forever
    cursorLine = PROMPT;
    render();
  }

  /* ── bootstrap ────────────────────────────────────────────────────────── */

  function init() {
    container = document.getElementById('terminal-bg');
    if (container) runTerminal();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
}());
