// Impact fracture decal: a few long, slightly-curved cracks that radiate from
// the strike point and split into shorter branches, plus a punched-out chip.
// Deliberately NOT a radial spiderweb — no concentric rings, uneven spacing,
// and every crack tapers off instead of reaching the same radius.
const LEAD_CRACKS = 5;

export const glassHole = (w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.max(w, h) * 0.72;
    const pt = (r, a) => `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;

    // One crack: walk outward in a few segments, wandering a little each step
    // so the line reads as split glass rather than a drawn ray.
    const crack = (angle, reach, steps) => {
        const pts = [`${cx.toFixed(1)},${cy.toFixed(1)}`];
        let a = angle;
        let r = 0;
        for (let s = 0; s < steps; s += 1) {
            a += (Math.random() - 0.5) * 0.55;
            r += (reach / steps) * (0.7 + Math.random() * 0.6);
            pts.push(pt(Math.min(r, reach), a));
        }
        return {points: pts.join(' '), angle: a, radius: Math.min(r, reach)};
    };

    let inner = '';
    let spoke = Math.random() * Math.PI * 2;
    for (let i = 0; i < LEAD_CRACKS; i += 1) {
        // Uneven angular spacing keeps the impact from looking symmetrical.
        spoke += (Math.PI * 2) / LEAD_CRACKS * (0.55 + Math.random() * 0.9);
        const reach = maxR * (0.55 + Math.random() * 0.45);
        const lead = crack(spoke, reach, 3 + Math.floor(Math.random() * 2));
        inner += `<polyline class="glass-hole__crack" points="${lead.points}"></polyline>`;

        // A branch peels off partway along the lead crack.
        if (Math.random() < 0.75) {
            const branchR = lead.radius * (0.45 + Math.random() * 0.3);
            const branchA = lead.angle + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
            const from = pt(branchR, lead.angle);
            const to = pt(branchR + lead.radius * (0.3 + Math.random() * 0.3), branchA);
            inner += `<polyline class="glass-hole__crack glass-hole__crack--hair" points="${from} ${to}"></polyline>`;
        }
    }

    const chipR = Math.max(2, Math.min(w, h) * 0.13);
    inner += `<circle class="glass-hole__chip" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${chipR.toFixed(1)}"></circle>`;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">${inner}</svg>`;
};
