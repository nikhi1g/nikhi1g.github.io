// Procedural impact cracks: jagged radial rays plus two staggered concentric
// rings around a dark punched-out chip. Regenerated per load, so every yank
// leaves a unique fracture.
export const glassHole = (w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.max(w, h) * 0.85;
    const jag = (r, a) => {
        const jitter = 0.82 + Math.random() * 0.36;
        return `${(cx + Math.cos(a) * r * jitter).toFixed(1)},${(cy + Math.sin(a) * r * jitter).toFixed(1)}`;
    };

    let inner = '';
    const rays = 10 + Math.floor(Math.random() * 3);
    for (let i = 0; i < rays; i += 1) {
        const a = (i / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const pts = [`${cx.toFixed(1)},${cy.toFixed(1)}`];
        const steps = 3;
        for (let s = 1; s <= steps; s += 1) {
            pts.push(jag((maxR * s) / steps, a + (Math.random() - 0.5) * 0.22));
        }
        inner += `<polyline class="glass-hole__crack" points="${pts.join(' ')}"></polyline>`;
    }
    for (const ringR of [maxR * 0.38, maxR * 0.68]) {
        const pts = [];
        const n = 14;
        for (let i = 0; i <= n; i += 1) {
            pts.push(jag(ringR, (i / n) * Math.PI * 2));
        }
        inner += `<polygon class="glass-hole__crack" points="${pts.join(' ')}"></polygon>`;
    }
    const chipR = Math.max(2.5, Math.min(w, h) * 0.16);
    inner += `<circle class="glass-hole__chip" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${chipR.toFixed(1)}"></circle>`;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${inner}</svg>`;
};
