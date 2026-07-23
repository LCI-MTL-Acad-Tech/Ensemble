// Classroom Live — built through an iterative collaboration between Elisa Schaeffer
// (Dean of Technology and Design, Collège LaSalle Montréal) and Claude (Anthropic).
// See index.html's footer for the full attribution note.
// Self-assessment: everyone rates themselves on the loaded axes; the
// chart shows the live spread across the room with the viewer's own
// rating drawn as a bold outline/needle on top. Three layouts depending
// on how many axes are loaded:
//   1 axis  -> a half-circle gauge (like a speedometer): a draggable
//              needle sets your own value, and the quartile spread is
//              drawn as colored zones along the arc instead of bands.
//   2 axes  -> the usual radar polygon, but with the first axis pointing
//              to the top-left (135°) and the second to the top-right
//              (45°) rather than the default even split (which would put
//              them straight up and straight down — not very readable).
//   3+ axes -> the standard evenly-spaced radar polygon.
// This is my own interpretation of a "quartile" view, not a pixel match
// to any existing dashboard — happy to adjust given a reference.
const SpiderModule = (() => {
  let lastState = null;
  let sendTimer = null;
  const pendingValues = {};
  let gaugeDragging = false;

  function escapeXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function axisStats(axisId, responses) {
    const vals = responses.map((r) => r.values[axisId]).filter((v) => typeof v === "number").sort((a, b) => a - b);
    return {
      min: vals.length ? vals[0] : 0,
      max: vals.length ? vals[vals.length - 1] : 0,
      q1: percentile(vals, 0.25),
      q3: percentile(vals, 0.75),
      median: percentile(vals, 0.5),
    };
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

  // ============================================================
  // Radar polygon mode (2+ axes)
  // ============================================================

  // 0 = straight up, increasing clockwise — matches how the axis labels
  // read naturally around the shape. Two axes are special-cased to
  // point up-left / up-right instead of straight up / straight down,
  // which is what the default even split would otherwise produce.
  function axisAngle(i, total) {
    if (total === 2) return i === 0 ? -Math.PI / 4 : Math.PI / 4;
    return (2 * Math.PI * i) / total;
  }

  function radarPoint(cx, cy, radius, angle, fraction) {
    const r = radius * Math.max(0, Math.min(1, fraction));
    return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
  }

  function polygonPoints(axes, cx, cy, radius, valuesByAxis) {
    return axes.map((ax, i) => {
      const angle = axisAngle(i, axes.length);
      const fraction = (valuesByAxis[ax.id] ?? 0) / ax.max;
      return radarPoint(cx, cy, radius, angle, fraction);
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

  function buildRadarSvg(fb, myClientId) {
    const axes = fb.axes;
    const size = 340, cx = size / 2, cy = size / 2, radius = size * 0.38;
    const responses = Object.values(fb.responses || {});

    let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:420px;">`;

    [0.25, 0.5, 0.75, 1].forEach((frac) => {
      const pts = axes.map((ax, i) => radarPoint(cx, cy, radius, axisAngle(i, axes.length), frac));
      svg += `<polygon points="${pointsToStr(pts)}" fill="none" stroke="var(--line)" stroke-width="1"></polygon>`;
    });

    axes.forEach((ax, i) => {
      const angle = axisAngle(i, axes.length);
      const [ex, ey] = radarPoint(cx, cy, radius, angle, 1);
      const [lx, ly] = radarPoint(cx, cy, radius * 1.16, angle, 1);
      svg += `<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="var(--line)" stroke-width="1"></line>`;
      svg += `<text x="${lx}" y="${ly}" font-size="11" fill="currentColor" text-anchor="middle" dominant-baseline="middle">${escapeXml(ax.label)}</text>`;
    });

    if (responses.length) {
      const stats = {};
      axes.forEach((ax) => { stats[ax.id] = axisStats(ax.id, responses); });

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

  // ============================================================
  // Half-circle gauge mode (1 axis)
  // ============================================================
  // Standard math convention here (0° = right/east, angles increase
  // counter-clockwise) because that's what makes a left-to-right
  // speedometer sweep simplest to reason about: angle = π at value 0
  // (pointing left), π/2 at the midpoint (pointing straight up), 0 at
  // the max value (pointing right).

  function gaugeAngleForValue(value, max) {
    const t = Math.max(0, Math.min(1, value / max));
    return Math.PI * (1 - t);
  }

  function gaugePoint(cx, cy, r, angle) {
    return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
  }

  // A "thick arc" (ring segment) built from straight segments rather than
  // SVG arc commands — sidesteps large-arc/sweep-flag bookkeeping
  // entirely, at the cost of being a very slightly faceted curve that's
  // invisible at this size.
  function ringSectorPoints(cx, cy, rInner, rOuter, angleA, angleB, steps = 24) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = angleA + (angleB - angleA) * (i / steps);
      pts.push(gaugePoint(cx, cy, rOuter, a));
    }
    for (let i = steps; i >= 0; i--) {
      const a = angleA + (angleB - angleA) * (i / steps);
      pts.push(gaugePoint(cx, cy, rInner, a));
    }
    return pointsToStr(pts);
  }

  function valueFromPointerAngle(clientX, clientY, svgEl, max) {
    const rect = svgEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom; // gauge center sits at the bottom-middle of its box
    let angle = Math.atan2(-(clientY - cy), clientX - cx); // standard math convention
    if (angle < 0) angle += 2 * Math.PI; // normalise into [0, 2π)
    // clamp to the visible half-circle (0..π); dragging below the baseline
    // just pins to whichever end is closer
    if (angle > Math.PI) angle = angle > (Math.PI + Math.PI / 2) ? 0 : Math.PI;
    const t = 1 - angle / Math.PI;
    return Math.max(0, Math.min(1, t)) * max;
  }

  function buildGaugeSvg(ax, fb, myClientId) {
    const size = 320, cx = size / 2, cy = size * 0.86;
    const rOuter = size * 0.42, rInner = size * 0.32;
    const responses = Object.values(fb.responses || {});
    const myVal = (fb.responses[myClientId] && fb.responses[myClientId].values[ax.id]) ?? ax.max / 2;

    let svg = `<svg id="spider-gauge-svg" viewBox="0 0 ${size} ${size * 0.62}" width="100%" style="max-width:380px; touch-action:none; cursor:pointer;">`;

    // base track (full 0..max range, neutral)
    svg += `<polygon points="${ringSectorPoints(cx, cy, rInner, rOuter, Math.PI, 0)}" fill="var(--line)" fill-opacity="0.35"></polygon>`;

    if (responses.length) {
      const stats = axisStats(ax.id, responses);
      const aMin = gaugeAngleForValue(stats.min, ax.max);
      const aMax = gaugeAngleForValue(stats.max, ax.max);
      const aQ1 = gaugeAngleForValue(stats.q1, ax.max);
      const aQ3 = gaugeAngleForValue(stats.q3, ax.max);
      const aMed = gaugeAngleForValue(stats.median, ax.max);

      // light band across the full class range, darker band across the IQR
      svg += `<polygon points="${ringSectorPoints(cx, cy, rInner, rOuter, aMin, aMax)}" fill="var(--accent)" fill-opacity="0.22"></polygon>`;
      svg += `<polygon points="${ringSectorPoints(cx, cy, rInner, rOuter, aQ1, aQ3)}" fill="var(--accent)" fill-opacity="0.55"></polygon>`;

      // median tick
      const [mx1, my1] = gaugePoint(cx, cy, rInner - 4, aMed);
      const [mx2, my2] = gaugePoint(cx, cy, rOuter + 4, aMed);
      svg += `<line x1="${mx1}" y1="${my1}" x2="${mx2}" y2="${my2}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3,2"></line>`;
    }

    // scale ticks + end labels
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const a = Math.PI * (1 - t);
      const [tx1, ty1] = gaugePoint(cx, cy, rInner - 6, a);
      const [tx2, ty2] = gaugePoint(cx, cy, rOuter + 2, a);
      svg += `<line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke="var(--ink-soft)" stroke-width="1"></line>`;
    });
    const [minLx, minLy] = gaugePoint(cx, cy, rOuter + 20, Math.PI);
    const [maxLx, maxLy] = gaugePoint(cx, cy, rOuter + 20, 0);
    svg += `<text x="${minLx}" y="${minLy}" font-size="12" fill="var(--ink-soft)" text-anchor="middle">0</text>`;
    svg += `<text x="${maxLx}" y="${maxLy}" font-size="12" fill="var(--ink-soft)" text-anchor="middle">${ax.max}</text>`;

    // needle: your own value
    const needleAngle = gaugeAngleForValue(myVal, ax.max);
    const [nx, ny] = gaugePoint(cx, cy, rOuter - 6, needleAngle);
    svg += `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"></line>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="var(--ink)"></circle>`;

    svg += "</svg>";
    return svg;
  }

  function wireGaugeDrag(container, ax, myClientId) {
    const svgEl = container.querySelector("#spider-gauge-svg");
    if (!svgEl) return;

    function setFromPointer(e) {
      const value = valueFromPointerAngle(e.clientX, e.clientY, svgEl, ax.max);
      const rounded = ax.max <= 5 ? Math.round(value * 2) / 2 : Math.round(value);
      scheduleSend(ax.id, rounded);
      // redraw just the needle for instant feedback without waiting on the server round-trip
      const needleAngle = gaugeAngleForValue(rounded, ax.max);
      const size = 320, cx = size / 2, cy = size * 0.86, rOuter = size * 0.42;
      const [nx, ny] = gaugePoint(cx, cy, rOuter - 6, needleAngle);
      const lines = svgEl.querySelectorAll('line[stroke-width="3"]');
      if (lines.length) {
        lines[lines.length - 1].setAttribute("x2", nx);
        lines[lines.length - 1].setAttribute("y2", ny);
      }
      const slider = document.getElementById("spider-gauge-slider");
      if (slider) {
        slider.value = rounded;
        document.getElementById("spider-gauge-value").textContent = rounded;
      }
    }

    svgEl.addEventListener("pointerdown", (e) => {
      gaugeDragging = true;
      svgEl.setPointerCapture(e.pointerId);
      setFromPointer(e);
    });
    svgEl.addEventListener("pointermove", (e) => {
      if (gaugeDragging) setFromPointer(e);
    });
    svgEl.addEventListener("pointerup", () => { gaugeDragging = false; });
    svgEl.addEventListener("pointercancel", () => { gaugeDragging = false; });
  }

  // ============================================================
  // Shared render/init
  // ============================================================

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

    if (!myResp) {
      fb.axes.forEach((ax) => WSHub.send({ type: "spider_set_value", axis_id: ax.id, value: ax.max / 2 }));
    }

    const respCount = Object.keys(fb.responses || {}).length;

    if (fb.axes.length === 1) {
      const ax = fb.axes[0];
      const currentVal = (myResp && myResp.values[ax.id]) ?? ax.max / 2;

      const panel = document.createElement("div");
      panel.className = "panel";
      if (fb.title) {
        const h = document.createElement("h2");
        h.textContent = fb.title;
        panel.appendChild(h);
      }
      const label = document.createElement("h3");
      label.textContent = ax.label;
      panel.appendChild(label);

      const countP = document.createElement("p");
      countP.className = "hint";
      countP.textContent = I18N.t("spider_respondents", { count: respCount });
      panel.appendChild(countP);

      const gaugeWrap = document.createElement("div");
      gaugeWrap.innerHTML = buildGaugeSvg(ax, fb, myId);
      panel.appendChild(gaugeWrap);

      const sliderRow = document.createElement("div");
      sliderRow.className = "field";
      sliderRow.innerHTML = `
        <label>${I18N.t("spider_your_ratings")} — <span id="spider-gauge-value">${currentVal}</span> / ${ax.max}</label>
        <input type="range" id="spider-gauge-slider" min="0" max="${ax.max}" step="${ax.max <= 5 ? 0.5 : 1}" value="${currentVal}">
      `;
      sliderRow.querySelector("input").addEventListener("input", (e) => {
        document.getElementById("spider-gauge-value").textContent = e.target.value;
        scheduleSend(ax.id, parseFloat(e.target.value));
      });
      panel.appendChild(sliderRow);

      const legend = document.createElement("div");
      legend.className = "spider-legend";
      legend.innerHTML = `
        <span><i class="swatch-range"></i>${I18N.t("spider_legend_range")}</span>
        <span><i class="swatch-iqr"></i>${I18N.t("spider_legend_iqr")}</span>
        <span><i class="swatch-median"></i>${I18N.t("spider_legend_median")}</span>
        <span><i class="swatch-you"></i>${I18N.t("spider_legend_you")}</span>
      `;
      panel.appendChild(legend);

      body.appendChild(panel);
      wireGaugeDrag(panel, ax, myId);
      return;
    }

    // 2+ axes: usual radar layout
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
    const countP = document.createElement("p");
    countP.className = "hint";
    countP.textContent = I18N.t("spider_respondents", { count: respCount });
    chartPanel.appendChild(countP);
    chartPanel.innerHTML += buildRadarSvg(fb, myId);
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
