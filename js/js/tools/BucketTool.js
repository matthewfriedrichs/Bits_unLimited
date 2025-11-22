import BaseTool from './BaseTool.js';

export default class BucketTool extends BaseTool {
    constructor(app) {
        super(app);
        this.mode = 'normal'; // 'normal', 'smart'
        this.diagonal = false; // New Option
    }

    get availableModes() {
        return [
            { id: 'normal', label: 'Normal Fill', icon: 'fill-drip', color: 'text-amber-400', desc: 'Exact fill within bounds' },
            { id: 'smart', label: 'Smart Fill', icon: 'wand-magic-sparkles', color: 'text-fuchsia-400', desc: 'Auto-closes gaps in shapes' }
        ];
    }

    // NEW: Settings for the Slide-out Panel
    get settings() {
        return [
            { id: 'diagonal', type: 'toggle', label: 'Diagonal (8-way)', value: this.diagonal }
        ];
    }

    setSetting(key, val) {
        if (key === 'diagonal') this.diagonal = val;
    }

    setMode(modeId) {
        if (this.mode === modeId) return;
        this.mode = modeId;
        this.app.bus.emit('tool:modeChanged', { toolId: 'bucket', mode: this.mode });
    }

    toggleMode() {
        this.setMode(this.mode === 'normal' ? 'smart' : 'normal');
    }

    onPointerDown(p) {
        this.fill(p.x, p.y);
    }

    fill(startX, startY) {
        const projectService = this.app.services.get('project');
        const targetColor = projectService.getPixelColor(startX, startY);
        const replacementColor = this.app.store.get('primaryColor');

        if (targetColor === replacementColor) return;

        // 1. Calculate Safe Bounds
        let minX = startX, maxX = startX, minY = startY, maxY = startY;

        if (projectService.activeProject) {
            const frame = projectService.frames[projectService.currentFrameIndex];
            const layer = frame.layers.find(l => l.id === projectService.activeLayerId);
            if (layer) {
                for (const key of layer.data.keys()) {
                    const [px, py] = key.split(',').map(Number);
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            }
        }

        const PADDING = 64;
        const bounds = {
            minX: minX - PADDING, maxX: maxX + PADDING,
            minY: minY - PADDING, maxY: maxY + PADDING,
            width: (maxX + PADDING) - (minX - PADDING) + 1,
            height: (maxY + PADDING) - (minY - PADDING) + 1
        };

        // 2. Create Grid
        const grid = new Uint8Array(bounds.width * bounds.height);
        const frame = projectService.frames[projectService.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === projectService.activeLayerId);

        if (targetColor === null) {
            if (layer) {
                for (const key of layer.data.keys()) {
                    const [px, py] = key.split(',').map(Number);
                    if (this.inBounds(px, py, bounds)) grid[this.idx(px, py, bounds)] = 1;
                }
            }
        } else {
            grid.fill(1);
            if (layer) {
                for (const [key, color] of layer.data.entries()) {
                    const [px, py] = key.split(',').map(Number);
                    if (this.inBounds(px, py, bounds) && color === targetColor) {
                        grid[this.idx(px, py, bounds)] = 0;
                    }
                }
            }
        }

        // 3. Smart Mode Logic
        if (this.mode === 'smart') {
            this.closeGapsRaycast(grid, bounds, startX, startY);
        }

        // 4. Flood Fill (with Diagonal Support)
        const startIdx = this.idx(startX, startY, bounds);
        if (grid[startIdx] === 1) return;

        const filledIndices = new Set();
        const stack = [startIdx];
        filledIndices.add(startIdx);

        const w = bounds.width;
        const h = bounds.height;

        while (stack.length > 0) {
            const idx = stack.pop();
            const cx = idx % w;
            const cy = Math.floor(idx / w);

            const neighbors = [];

            // 4-Way Neighbors
            if (cx < w - 1) neighbors.push(idx + 1);
            if (cx > 0) neighbors.push(idx - 1);
            if (cy < h - 1) neighbors.push(idx + w);
            if (cy > 0) neighbors.push(idx - w);

            // 8-Way Neighbors (New Option)
            if (this.diagonal) {
                if (cx > 0 && cy > 0) neighbors.push(idx - w - 1);
                if (cx < w - 1 && cy > 0) neighbors.push(idx - w + 1);
                if (cx > 0 && cy < h - 1) neighbors.push(idx + w - 1);
                if (cx < w - 1 && cy < h - 1) neighbors.push(idx + w + 1);
            }

            for (const n of neighbors) {
                if (!filledIndices.has(n) && grid[n] === 0) {
                    filledIndices.add(n);
                    stack.push(n);
                }
            }
        }

        // 5. Commit
        const pixels = [];
        for (const idx of filledIndices) {
            const x = (idx % bounds.width) + bounds.minX;
            const y = Math.floor(idx / bounds.width) + bounds.minY;
            pixels.push({ x, y, color: replacementColor });
        }

        if (pixels.length > 0) {
            this.app.bus.emit('requestBatchPixels', pixels);
        }
    }

    // ... (Raycast Logic: closeGapsRaycast, castRay, drawLine, inBounds, idx unchanged) ...
    closeGapsRaycast(grid, bounds, startX, startY) {
        const RAYS = 32;
        const hits = [];
        const cx = startX - bounds.minX;
        const cy = startY - bounds.minY;
        let validHitDistSum = 0;
        let validHitCount = 0;
        let minValidDist = Infinity;

        for (let i = 0; i < RAYS; i++) {
            const angle = (i / RAYS) * Math.PI * 2;
            const hit = this.castRay(grid, bounds, cx, cy, Math.cos(angle), Math.sin(angle));
            hits.push(hit);

            if (hit.found) {
                validHitDistSum += hit.dist;
                validHitCount++;
                if (hit.dist < minValidDist) minValidDist = hit.dist;
            }
        }

        if (validHitCount < 3) return;
        const leakThreshold = Math.max(minValidDist * 3.5, 8);

        for (let i = 0; i < RAYS; i++) {
            const curr = hits[i];
            const nextIdx = (i + 1) % RAYS;
            const next = hits[nextIdx];
            const isLeak = (h) => !h.found || h.dist > leakThreshold;

            if (!isLeak(curr) && isLeak(next)) {
                let gapEndIdx = nextIdx;
                while (isLeak(hits[gapEndIdx]) && gapEndIdx !== i) {
                    gapEndIdx = (gapEndIdx + 1) % RAYS;
                }
                if (!isLeak(hits[gapEndIdx]) && gapEndIdx !== i) {
                    this.drawLine(grid, bounds.width, curr.x, curr.y, hits[gapEndIdx].x, hits[gapEndIdx].y);
                }
            }
        }
    }

    castRay(grid, bounds, startX, startY, dx, dy) {
        let x = startX, y = startY, dist = 0;
        const maxDist = Math.max(bounds.width, bounds.height);
        while (dist < maxDist) {
            const ix = Math.round(x);
            const iy = Math.round(y);
            if (ix < 0 || ix >= bounds.width || iy < 0 || iy >= bounds.height) return { found: false, dist, x: ix, y: iy };
            if (grid[iy * bounds.width + ix] === 1) return { found: true, dist, x: ix, y: iy };
            x += dx; y += dy; dist++;
        }
        return { found: false, dist, x, y };
    }

    drawLine(grid, w, x0, y0, x1, y1) {
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;
        while (true) {
            const idx = y0 * w + x0;
            if (idx >= 0 && idx < grid.length) grid[idx] = 1;
            if (x0 === x1 && y0 === y1) break;
            let e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    inBounds(x, y, b) { return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY; }
    idx(x, y, b) { return (y - b.minY) * b.width + (x - b.minX); }
}