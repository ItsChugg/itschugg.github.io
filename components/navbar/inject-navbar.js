// Inject navbar and set up theme switcher
fetch("/components/navbar/navbar.html")
  .then(res => res.text())
  .then(html => {
    // Inject navbar HTML
    document.body.insertAdjacentHTML("afterbegin", html);

    const toggle = document.querySelector('#theme-toggle');
    if (!toggle) {
      console.warn("Theme toggle not found in navbar.");
      return;
    }

    // Apply stored theme or default to dark
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.classList.add(savedTheme);
    toggle.checked = savedTheme === 'light';

    // Listen for toggle change
    toggle.addEventListener('change', () => {
      const newTheme = toggle.checked ? 'light' : 'dark';

      // Add smooth cross-fade helper
      document.body.classList.add('theme-transition');

      // Replace theme class
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(newTheme);

      // Store new theme
      localStorage.setItem('theme', newTheme);

      // Remove transition class after animation completes
      setTimeout(() => {
        document.body.classList.remove('theme-transition');
      }, 450); // Matches .45s from CSS
    });
  })
  .catch(err => console.error("Navbar injection failed:", err));
