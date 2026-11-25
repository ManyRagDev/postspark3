// The DOM previews the drop. Only a completed gesture changes the document.
export function bindLayerOrder(root, commit) {
  let drag = null;
  let suppressClick = false;

  function bounds() {
    const list = drag.list.getBoundingClientRect();
    const port = drag.port.getBoundingClientRect();
    return {
      left: Math.max(0, list.left, port.left),
      right: Math.min(innerWidth, list.right, port.right),
      top: Math.max(0, list.top, port.top),
      bottom: Math.min(innerHeight, list.bottom, port.bottom),
    };
  }
  function preview() {
    const d = drag;
    const b = bounds();
    d.inside = d.x >= b.left && d.x <= b.right && d.y >= b.top - 4 && d.y <= b.bottom + 4;
    d.ghost.style.top = (d.y - d.offset) + "px";
    d.ghost.hidden = !d.inside;
    if (!d.inside) return;
    const before = Array.from(d.list.children).find(row => {
      if (row === d.row) return false;
      const r = row.getBoundingClientRect();
      return d.y < r.top + r.height / 2;
    }) || null;
    if (d.row.nextElementSibling !== before) d.list.insertBefore(d.row, before);

    const step = d.y < b.top + 20 ? -8 : d.y > b.bottom - 20 ? 8 : 0;
    if (step && !d.frame && (step < 0 ? d.port.scrollTop > 0 :
        d.port.scrollTop + d.port.clientHeight < d.port.scrollHeight - 1)) {
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        if (drag !== d) return;
        d.port.scrollTop += step;
        preview();
      });
    }
  }
  function finish(drop = false) {
    const d = drag;
    if (!d) return;
    drag = null;
    document.removeEventListener("keydown", escape, true);
    cancelAnimationFrame(d.frame);
    if (root.hasPointerCapture(d.pointer)) root.releasePointerCapture(d.pointer);
    if (!d.ghost) return;
    d.ghost.remove();
    d.row.classList.remove("cp-sort-placeholder");
    const index = Array.from(d.list.children).indexOf(d.row);
    // Restore the original DOM before committing, also on cancellation or a no-op.
    if (d.row.parentElement === d.list) d.list.insertBefore(d.row, d.originalNext);
    if (drop && d.inside && index !== d.index) {
      const scroll = d.port.scrollTop;
      commit(d.id, index);
      const port = root.querySelector(".cp-timing-rows") || d.port;
      port.scrollTop = scroll;
    }
  }
  function escape(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  }
  root.addEventListener("pointerdown", e => {
    if (drag || !e.isPrimary || e.button !== 0) return;
    suppressClick = false;
    const handle = e.target.closest("[data-cp-sort]");
    if (!handle || (e.pointerType === "touch" && !e.target.closest(".cp-grip") &&
        !handle.classList.contains("cp-timing-name"))) return;
    const row = handle.closest("[data-cp-stack-id]");
    const list = row.parentElement;
    if (list.children.length < 2) return;
    drag = {
      pointer: e.pointerId, id: row.dataset.cpStackId, row, list, handle,
      port: list.closest(".library-scroll,.cp-timing-rows"),
      originalNext: row.nextElementSibling, index: Array.from(list.children).indexOf(row),
      startX: e.clientX, startY: e.clientY, frame: 0,
    };
    handle.setPointerCapture(e.pointerId);
    document.addEventListener("keydown", escape, true);
  });
  root.addEventListener("pointermove", e => {
    const d = drag;
    if (!d || e.pointerId !== d.pointer) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
      const r = d.handle.getBoundingClientRect();
      root.setPointerCapture(d.pointer);
      d.ghost = d.handle.cloneNode(true);
      d.ghost.inert = true;
      d.ghost.setAttribute("aria-hidden", "true");
      d.ghost.classList.add("cp-sort-ghost");
      d.ghost.style.left = r.left + "px";
      d.ghost.style.width = r.width + "px";
      d.ghost.style.height = r.height + "px";
      document.body.append(d.ghost);
      d.offset = d.startY - r.top;
      d.row.classList.add("cp-sort-placeholder");
      suppressClick = true;
    }
    d.x = e.clientX;
    d.y = e.clientY;
    preview();
  });
  root.addEventListener("pointerup", e => {
    if (drag?.pointer !== e.pointerId) return;
    if (drag.ghost) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      preview();
    }
    finish(true);
  });
  root.addEventListener("pointercancel", e => {
    if (drag?.pointer === e.pointerId) finish();
  });
  root.addEventListener("lostpointercapture", e => {
    if (drag?.pointer === e.pointerId && !root.hasPointerCapture(e.pointerId)) finish();
  });
  root.addEventListener("click", e => {
    if (suppressClick && e.detail) {
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
  return finish;
}
