// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Self-assessment radar: everyone rates themselves on the loaded axes with
// sliders; the chart shows the live spread across the room (min-max band,
// interquartile band, median line) with the viewer's own polygon drawn as
// a bold unfilled outline on top. This is my own interpretation of a
// "quartile polygon" view, not a pixel match to any existing dashboard —
// happy to adjust once there's a reference to match exactly.
const SpiderModule = (() => {
  let lastState = null;
  let sendTimer = null;
  const pendingValues = {};

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function axisPoint(cx, cy, radius, angle, fraction) {
    const r = radius * Math.max(0, Math.min(1, fraction));
    return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
  }

  function polygonPoints(axes, cx, cy, radius, valuesByAxis) {
    return axes.map((ax, i) => {
      const angle = (2 * Math.PI * i) / axes.length;
      const fraction = (valuesByAxis[ax.id] ?? 0) / ax.max;
      return axisPoint(cx, cy, radius, angle, fraction);
    });
  }

  function pointsToStr(points) {
    return points.map((p) => p.join(",")).join(" ");
  }

  function bandPath(outerPoints, innerPoints) {
    const outer = "M" + outerPoints.map((p) => p.join(",")).join("L") + "Z";
    const inner = "M" + innerPoints.slice().reverse().map((p) => p.join(",")).join("L") + "Z";
    return outer + " " + inner;
  }

  function buildSvg(fb, myClientId) {
    const axes = fb.axes;
    const size = 340, cx = size / 2, cy = size / 2, radius = size * 0.38;
    const responses = Object.values(fb.responses || {});

    let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:420px;">`;

    // grid rings at 25/50/75/100%
    [0.25, 0.5, 0.75, 1].forEach((frac) => {
      const pts = axes.map((ax, i) => axisPoint(cx, cy, radius, (2 * Math.PI * i) / axes.length, frac));
      svg += `<polygon points="${pointsToStr(pts)}" fill="none" stroke="var(--line)" stroke-width="1"></polygon>`;
    });

    // axis lines + labels
    axes.forEach((ax, i) => {
      const angle = (2 * Math.PI * i) / axes.length;
      const [ex, ey] = axisPoint(cx, cy, radius, angle, 1);
      const [lx, ly] = axisPoint(cx, cy, radius * 1.16, angle, 1);
      svg += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="var(--line)" stroke-width="1"></line>`;
      svg += `<text x="${lx}" y="${ly}" font-size="11" fill="currentColor" text-anchor="middle" dominant-baseline="middle">${escapeXml(ax.label)}</text>`;
    });

    if (responses.length) {
      const stats = {};
      axes.forEach((ax) => {
        const vals = responses.map((r) => r.values[ax.id]).filter((v) => typeof v === "number").sort((a, b) => a - b);
        stats[ax.id] = {
          min: vals.length ? vals[0] : 0,
          max: vals.length ? vals[vals.length - 1] : 0,
          q1: percentile(vals, 0.25),
          q3: percentile(vals, 0.75),
          median: percentile(vals, 0.5),
        };
      });

      const minPts = polygonPoints(axes, cx, cy, radius, Object.fromEntries(axes.map((a) => [a.id, stats[a.id].min])));
      const maxPts = polygonPoints(axes, cx, cy, radius, Object.fromEntries(axes.map((a) => [a.id, stats[a.id].max])));
      const q1Pts = polygonPoints(axes, cx, cy, radius, Object.fromEntries(axes.map((a) => [a.id, stats[a.id].q1])));
      const q3Pts = polygonPoints(axes, cx, cy, radius, Object.fromEntries(axes.map((a) => [a.id, stats[a.id].q3])));
      const medPts = polygonPoints(axes, cx, cy, radius, Object.fromEntries(axes.map((a) => [a.id, stats[a.id].median])));

      svg += `<path d="${bandPath(maxPts, minPts)}" fill="var(--accent)" fill-opacity="0.12" fill-rule="evenodd"></path>`;
      svg += `<path d="${bandPath(q3Pts, q1Pts)}" fill="var(--accent)" fill-opacity="0.32" fill-rule="evenodd"></path>`;
      svg += `<polygon points="${pointsToStr(medPts)}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4,3"></polygon>`;
    }

    const myResp = fb.responses && fb.responses[myClientId];
    if (myResp) {
      const myPts = polygonPoints(axes, cx, cy, radius, myResp.values);
      svg += `<polygon points="${pointsToStr(myPts)}" fill="none" stroke="var(--ink)" stroke-width="2.5"></polygon>`;
    }

    svg += "</svg>";
    return svg;
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function scheduleSend(axisId, value) {
    pendingValues[axisId] = value;
    if (sendTimer) return;
    sendTimer = setTimeout(() => {
      Object.entries(pendingValues).forEach(([id, v]) => {
        WSHub.send({ type: "spider_set_value", axis_id: id, value: v });
      });
      for (const k in pendingValues) delete pendingValues[k];
      sendTimer = null;
    }, 120);
  }

  function render(fb) {
    lastState = fb;
    const body = document.getElementById("spider-body");
    body.innerHTML = "";

    if (!fb || !fb.loaded || !fb.axes.length) {
      body.innerHTML = `<p class="hint">${I18N.t("spider_no_axes")}</p>`;
      return;
    }

    const myId = WSHub.getClientId();
    const myResp = fb.responses && fb.responses[myId];

    // First time seeing this template: seed my own values at the midpoint
    // so I'm counted in the aggregate immediately, and so my sliders have
    // a sensible starting position.
    if (!myResp) {
      fb.axes.forEach((ax) => WSHub.send({ type: "spider_set_value", axis_id: ax.id, value: ax.max / 2 }));
    }

    const wrap = document.createElement("div");
    wrap.className = "spider-layout";

    const slidersPanel = document.createElement("div");
    slidersPanel.className = "panel";
    if (fb.title) {
      const h = document.createElement("h2");
      h.textContent = fb.title;
      slidersPanel.appendChild(h);
    }
    const slidersTitle = document.createElement("h3");
    slidersTitle.textContent = I18N.t("spider_your_ratings");
    slidersPanel.appendChild(slidersTitle);

    fb.axes.forEach((ax) => {
      const currentVal = (myResp && myResp.values[ax.id]) ?? ax.max / 2;
      const row = document.createElement("div");
      row.className = "field";
      row.innerHTML = `
        <label>${escapeXml(ax.label)} — <span class="slider-value">${currentVal}</span> / ${ax.max}</label>
        <input type="range" min="0" max="${ax.max}" step="${ax.max <= 5 ? 0.5 : 1}" value="${currentVal}">
      `;
      const input = row.querySelector("input");
      const valueLabel = row.querySelector(".slider-value");
      input.addEventListener("input", () => {
        valueLabel.textContent = input.value;
        scheduleSend(ax.id, parseFloat(input.value));
      });
      slidersPanel.appendChild(row);
    });
    wrap.appendChild(slidersPanel);

    const chartPanel = document.createElement("div");
    chartPanel.className = "panel";
    const chartTitle = document.createElement("h3");
    chartTitle.textContent = I18N.t("spider_group_view");
    chartPanel.appendChild(chartTitle);
    const respCount = Object.keys(fb.responses || {}).length;
    const countP = document.createElement("p");
    countP.className = "hint";
    countP.textContent = I18N.t("spider_respondents", { count: respCount });
    chartPanel.appendChild(countP);
    chartPanel.innerHTML += buildSvg(fb, myId);
    const legend = document.createElement("div");
    legend.className = "spider-legend";
    legend.innerHTML = `
      <span><i class="swatch-range"></i>${I18N.t("spider_legend_range")}</span>
      <span><i class="swatch-iqr"></i>${I18N.t("spider_legend_iqr")}</span>
      <span><i class="swatch-median"></i>${I18N.t("spider_legend_median")}</span>
      <span><i class="swatch-you"></i>${I18N.t("spider_legend_you")}</span>
    `;
    chartPanel.appendChild(legend);
    wrap.appendChild(chartPanel);

    body.appendChild(wrap);
  }

  function init() {
    WSHub.on("session_state", (msg) => render(msg.state.spider));
    WSHub.on("spider_update", (msg) => render(msg.spider));
    I18N.onChange(() => render(lastState));
  }

  return { init };
})();
