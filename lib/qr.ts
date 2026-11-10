// QR codes as plain module grids, drawn by whoever needs them: filled squares in the certificate PDF,
// an SVG path on screen. Client-safe.
import qrcode from 'qrcode-generator';

/** The QR modules for `text` (true = dark), medium error correction, smallest version that fits. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** Each row's runs of dark modules as [row, firstColumn, length]. */
export function qrRuns(modules: boolean[][]): [number, number, number][] {
  const runs: [number, number, number][] = [];
  modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c += 1;
      runs.push([r, start, c - start]);
    }
  });
  return runs;
}

/** SVG path data, one unit per module, inset by a `quiet`-module margin. The viewBox is size + 2 × quiet. */
export function qrPath(modules: boolean[][], quiet = 4): string {
  return qrRuns(modules)
    .map(([r, c, len]) => `M${c + quiet} ${r + quiet}h${len}v1h-${len}z`)
    .join('');
}
