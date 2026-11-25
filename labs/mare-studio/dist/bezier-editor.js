// Display the incoming segment in normalized time/value coordinates. The scale
// is captured on pointerdown so an overshooting handle stays under the pointer.
export function bezierEditor(ease) {
  const low = Math.min(-0.35, ease[1] - 0.2, ease[3] - 0.2);
  const high = Math.max(1.35, ease[1] + 0.2, ease[3] + 0.2);
  const fields = ["Tempo 1", "Valor 1", "Tempo 2", "Valor 2"].map((label, i) =>
    '<label>' + label + '<input type="number" data-bezier-value="' + i + '" min="' +
    (i % 2 ? -3 : 0) + '" max="' + (i % 2 ? 4 : 1) + '" step="any" value="' + ease[i] + '"></label>');
  return '<fieldset class="cp-bezier"><legend>Alças Bézier</legend>' +
    '<div class="cp-bezier-plot" data-low="' + low + '" data-high="' + high + '">' +
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<path class="cp-bezier-guides"/><path class="cp-bezier-line"/></svg>' +
    [0, 1].map(i => '<button type="button" data-bezier-handle="' + i +
      '" aria-label="Alça ' + (i + 1) + '"></button>').join("") +
    '</div><div class="cp-bezier-fields">' + fields.join("") + '</div></fieldset>';
}

export function paintBezier(plot, ease) {
  const low = Number(plot.dataset.low), high = Number(plot.dataset.high);
  const y = value => 100 * (high - value) / (high - low);
  const p = (x, value) => (x * 100) + ' ' + y(value);
  const a = p(ease[0], ease[1]), b = p(ease[2], ease[3]);
  plot.querySelector(".cp-bezier-line").setAttribute("d", 'M ' + p(0, 0) + ' C ' + a + ' ' + b + ' ' + p(1, 1));
  plot.querySelector(".cp-bezier-guides").setAttribute("d", 'M ' + p(0, 0) + ' L ' + a + ' M ' + p(1, 1) + ' L ' + b);
  for (const button of plot.querySelectorAll('[data-bezier-handle]')) {
    const k = Number(button.dataset.bezierHandle) * 2;
    button.style.left = ease[k] * 100 + '%';
    button.style.top = y(ease[k + 1]) + '%';
  }
}
