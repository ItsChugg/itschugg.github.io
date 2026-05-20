(function () {
  'use strict';

  const PROMPT    = 'C:\\ITSCHU.GG> ';
  const CHAR_MIN  = 32;   // ms between keystrokes (min)
  const CHAR_MAX  = 78;   // ms between keystrokes (max)
  const OUT_DELAY = 52;   // ms between output lines
  const LOOP_WAIT = 6000; // ms idle at end before restarting

  // Script definition:
  //   t:'h' = header line (instant, no prompt)
  //   t:'b' = blank line
  //   t:'c' = command (typed character-by-character), p = pre-command pause ms
  //   t:'o' = output line (appears after OUT_DELAY)
  const SCRIPT = [
    { t:'h', s:'Microsoft Windows [Version 2.0.26200.8246]' },
    { t:'h', s:'(c) ItsChugg. All rights reserved.' },
    { t:'b' },
    { t:'c', s:'whoami',                   p:1000 },
    { t:'o', s:'HOST\\ITSCHUGG' },
    { t:'b' },
    { t:'c', s:'systeminfo',               p:750  },
    { t:'o', s:'Host Name:      ITSCHU.GG'        },
    { t:'o', s:'OS Version:     2.0.26200'         },
    { t:'o', s:'Build Type:     PUBLIC'            },
    { t:'o', s:'User Status:    ACTIVE'            },
    { t:'b' },
    { t:'c', s:'dir /b',                   p:650  },
    { t:'o', s:'evolutionary\\'                    },
    { t:'o', s:'globe\\'                           },
    { t:'o', s:'index.html'                        },
    { t:'b' },
    { t:'c', s:'sc query',                 p:800  },
    { t:'o', s:'SERVICE_NAME: EVOLUTIONARY.WIKI'  },
    { t:'o', s:'        STATE              : 4  RUNNING' },
    { t:'o', s:'SERVICE_NAME: GLOBE.VIEWER'        },
    { t:'o', s:'        STATE              : 4  RUNNING' },
    { t:'b' },
    { t:'c', s:'net user itschugg',        p:720  },
    { t:'o', s:'User name          ITSCHUGG'       },
    { t:'o', s:'Full Name          Russell G. Rinaldo' },
    { t:'o', s:'Comment            Host, Programmer, Creator' },
    { t:'o', s:'User active        Yes'            },
    { t:'b' },
    { t:'c', s:'ping evolutionary.itschu.gg', p:620 },
    { t:'o', s:'Pinging evolutionary.itschu.gg [185.199.108.153] with 32 bytes of data:' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'o', s:'Reply from 185.199.108.153: bytes=32 time<1ms TTL=128' },
    { t:'b' },
    { t:'o', s:'Ping statistics for 185.199.108.153:' },
    { t:'o', s:'    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)' },
    { t:'b' },
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand  = (a, b) => a + Math.random() * (b - a);

  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function runTerminal(el) {
    while (true) {
      let text = '';

      const render = () => {
        el.innerHTML =
          '<pre>' + esc(text) + '<span class="tcursor"> </span></pre>';
      };

      for (const item of SCRIPT) {
        switch (item.t) {

          case 'h':
            text += item.s + '\n';
            break;

          case 'b':
            text += '\n';
            break;

          case 'c':
            // Show everything accumulated so far, then pause before typing
            render();
            await sleep(item.p ?? 800);
            text += PROMPT;
            for (const ch of item.s) {
              text += ch;
              render();
              await sleep(rand(CHAR_MIN, CHAR_MAX));
            }
            text += '\n';
            render();
            break;

          case 'o':
            await sleep(OUT_DELAY);
            text += item.s + '\n';
            render();
            break;
        }
      }

      // Final idle prompt with blinking cursor
      text += PROMPT;
      render();
      await sleep(LOOP_WAIT);

      // Clear and restart
      el.innerHTML = '';
      await sleep(600);
    }
  }

  function init() {
    const el = document.getElementById('terminal-bg');
    if (el) runTerminal(el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
