// Quarter circles tangent at the boundaries of consecutive Fibonacci squares.
import { createCanvas } from '@napi-rs/canvas';

export function blueprintSpiral(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  const unit = Math.min((width - 24) / 89, (height - 16) / 55);
  ctx.translate((width - 89 * unit) / 2, (height - 55 * unit) / 2);
  ctx.scale(unit, unit);
  let x = 0, y = 0, w = 89, h = 55;
  for (const [i, side] of [55,34,21,13,8,5,3,2,1,1].entries()) {
    const turn = i % 4;
    const left = turn === 2 ? x + w - side : x;
    const top = turn === 3 ? y + h - side : y;
    ctx.lineWidth = 1.5 / unit;
    ctx.strokeStyle = '#78b5de';
    ctx.strokeRect(left, top, side, side);
    const cx = left + ([0,3].includes(turn) ? side : 0);
    const cy = top + (turn < 2 ? side : 0);
    const start = Math.PI + turn * Math.PI / 2;
    ctx.lineWidth = 3.5 / unit;
    ctx.strokeStyle = '#eefaff';
    ctx.beginPath();
    ctx.arc(cx, cy, side, start, start + Math.PI / 2);
    ctx.stroke();
    if (turn === 0) { x += side; w -= side; }
    if (turn === 1) { y += side; h -= side; }
    if (turn === 2) w -= side;
    if (turn === 3) h -= side;
  }
  return canvas.toBuffer('image/png');
}
