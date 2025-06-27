// /components/sidebar/inject-sidebar.js
// Dynamically builds and centers a collapsible sidebar from pages.json

document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar-container");
  if (!sidebar) {
    console.error("Sidebar container (#sidebar-container) not found.");
    return;
  }

  fetch("/pages/evolutionary/pages.json")
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status} fetching pages.json`);
      return response.json();
    })
    .then(data => {
      const container = document.createElement("nav");
      container.className = "subpage-bar";

      const header = document.createElement("h3");
      header.textContent = "Page Index";
      container.appendChild(header);

      const currentPath = window.location.pathname;

      data.forEach(group => {
        // Section wrapper
        const section = document.createElement("div");
        section.style.display = "flex";
        section.style.flexDirection = "column";
        section.style.alignItems = "center";
        section.style.width = "100%";         // full sidebar width for consistency
        section.style.gap = "2px";            // tight space
        section.style.marginBottom = "2px";   // minimal group spacing

        // Toggle button
        const toggle = document.createElement("button");
        toggle.className = "dropdown-toggle";
        toggle.innerHTML = `${group.category} <span class=\"arrow\">▾</span>`;
        toggle.style.width = "auto";
        toggle.style.textAlign = "center";
        section.appendChild(toggle);

        // Dropdown list
        const list = document.createElement("ul");
        list.className = "dropdown";
        list.style.margin = "2px auto 0";
        list.style.paddingLeft = "0";

        let isCurrentCategory = false;
        group.pages.forEach(page => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.textContent = page.title;
          a.href = page.file;
          // handle long text
          a.style.wordBreak = "break-word";
          a.style.whiteSpace = "normal";
          a.style.textAlign = "center";
          if (currentPath.includes(page.file)) isCurrentCategory = true;
          li.appendChild(a);
          list.appendChild(li);
        });
        section.appendChild(list);

        // Divider line
        const hr = document.createElement("hr");
        hr.style.width = "80%";                // consistent length
        hr.style.margin = "2px auto 0";
        section.appendChild(hr);

        // Autoplay open if current category
        if (isCurrentCategory) {
          list.classList.add("open");
          toggle.classList.add("active");
        }

        // Toggle expand/collapse
        toggle.addEventListener("click", () => {
          list.classList.toggle("open");
          toggle.classList.toggle("active");
        });

        container.appendChild(section);
      });

      sidebar.appendChild(container);
    })
    .catch(err => console.error("Failed to load sidebar pages:", err));
});
