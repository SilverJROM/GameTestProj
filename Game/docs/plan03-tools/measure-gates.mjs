// Slice 0 evidence: walk straight lines through each open gate in 12 px steps (as the server does)
// and count the walks that geometrically pass through the opening but get stopped by a "solid" wall.
import * as esbuild from 'esbuild';
const out = await esbuild.build({ entryPoints: ['src/rules/regions.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const r = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
const seg = (a, b, c, d) => { // proper intersection of ab and cd
  const o = (p, q, s) => (q[0]-p[0])*(s[1]-p[1]) - (q[1]-p[1])*(s[0]-p[0]);
  return o(a,b,c)*o(a,b,d) < 0 && o(c,d,a)*o(c,d,b) < 0;
};
function walk(from, to) { // server-style: 1 tick = 12 px at 120 px/s, 100 ms; stop at first solid crossing
  const step = 12; let [x, y] = from; const dist = Math.hypot(to[0]-x, to[1]-y);
  for (let moved = 0; moved < dist; moved += step) {
    const k = Math.min(step, dist - moved) / (dist - moved);
    const nx = x + (to[0]-x)*k, ny = y + (to[1]-y)*k;
    if (r.firstSolidWallCrossing([x, y], [nx, ny]) !== null) return [x, y, false];
    [x, y] = [nx, ny];
  }
  return [x, y, true];
}
function study(name, gate, near) {
  const [g0, g1] = gate; const mid = [(g0[0]+g1[0])/2, (g0[1]+g1[1])/2];
  const nx = -(g1[1]-g0[1]), ny = g1[0]-g0[0]; const len = Math.hypot(nx, ny);
  let through = 0, blocked = 0; const bad = [];
  for (let side of [-1, 1]) for (let da = -40; da <= 40; da += 5) for (let d1 = 40; d1 <= 120; d1 += 20) for (let off = -30; off <= 30; off += 10) {
    const a = (da * Math.PI) / 180, ux = (nx/len), uy = (ny/len);
    const rot = (vx, vy, t) => [vx*Math.cos(t) - vy*Math.sin(t), vx*Math.sin(t) + vy*Math.cos(t)];
    const [dx, dy] = rot(ux * side, uy * side, a);
    const from = [mid[0] - dx*d1 + (g1[0]-g0[0])/len*off, mid[1] - dy*d1 + (g1[1]-g0[1])/len*off];
    const to = [mid[0] + dx*d1 + (g1[0]-g0[0])/len*off, mid[1] + dy*d1 + (g1[1]-g0[1])/len*off];
    if (!seg(from, to, g0, g1)) continue; // line does not go through the opening
    through++;
    const [fx, fy, ok] = walk(from, to);
    if (!ok && Math.hypot(fx - mid[0], fy - mid[1]) < 45) { blocked++; if (bad.length < 6) bad.push({ from: from.map(Math.round), stoppedAt: [fx, fy].map(Math.round) }); }
  }
  console.log(`${name}: ${through} walks aim through the opening, ${blocked} stopped by a wall (${through ? Math.round(100*blocked/through) : 0}%)`, bad);
}
study('south town gate', r.limeTownGate);
study('cemetery gate', r.berryCemeteryGate);
