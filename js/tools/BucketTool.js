import BaseTool from './BaseTool.js';

export default class BucketTool extends BaseTool {
    constructor(app) {
        super(app);
        this.currentSlot = 'primary';
    }

    get availableModes() {
        return [
            { id: 'normal', label: 'Normal Fill', icon: 'fill-drip', color: 'text-amber-400', desc: 'Exact fill within bounds' },
            { id: 'smart', label: 'Smart Fill', icon: 'wand-magic-sparkles', color: 'text-fuchsia-400', desc: 'Auto-closes gaps in shapes' }
        ];
    }

    getSettings(slot = 'primary') {
        const config = this.app.store.get(slot === 'primary' ? 'primarySettings' : 'secondarySettings').bucket;
        return [
            { id: 'diagonal', type: 'toggle', label: 'Diagonal (8-way)', value: config.diagonal }
        ];
    }

    setSetting(key, val, slot = 'primary') {
        const storeKey = slot === 'primary' ? 'primarySettings' : 'secondarySettings';
        const settings = { ...this.app.store.get(storeKey) };
        settings.bucket = { ...settings.bucket, [key]: val };
        this.app.store.set(storeKey, settings);
    }

    setMode(modeId) {
        const storeKey = this.currentSlot === 'primary' ? 'primarySettings' : 'secondarySettings';
        const settings = { ...this.app.store.get(storeKey) };
        settings.bucket = { ...settings.bucket, mode: modeId };
        this.app.store.set(storeKey, settings);

        this.app.bus.emit('tool:modeChanged', { toolId: 'bucket', mode: modeId });
    }

    onPointerDown(p) {
        this.currentSlot = (p.button === 2) ? 'secondary' : 'primary';
        this.fill(p.x, p.y);
    }

    fill(startX, startY) {
        const projectService = this.app.services.get('project');
        const targetColor = projectService.getPixelColor(startX, startY);
        const replacementColor = this.app.store.get('primaryColor');

        if (targetColor === replacementColor) return;

        // 1. Calculate Safe Bounds
        // Optimization: We restrict the fill to the area occupied by the layer + padding
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

        // 2. Create Grid (0=Walkable, 1=Wall, 2=Filled)
        const grid = new Uint8Array(bounds.width * bounds.height);
        const frame = projectService.frames[projectService.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === projectService.activeLayerId);

        if (targetColor === null) {
            // Empty Target: Everything existing is a Wall
            if (layer) {
                for (const key of layer.data.keys()) {
                    const [px, py] = key.split(',').map(Number);
                    if (this.inBounds(px, py, bounds)) grid[this.idx(px, py, bounds)] = 1;
                }
            }
        } else {
            // Color Target: Everything NOT target is a Wall
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

        // 3. Apply Smart Mode
        const config = this.app.store.get(this.currentSlot === 'primary' ? 'primarySettings' : 'secondarySettings').bucket;
        if (config.mode === 'smart') {
            this.closeGapsRaycast(grid, bounds, startX, startY);
        }

        // 4. Scanline Flood Fill
        // Uses 'grid' directly: 0 -> 2 (Filled)
        this.scanlineFill(grid, bounds, startX, startY, config.diagonal);

        // 5. Commit
        const pixels = [];
        // Iterate grid to find filled pixels (marked as 2)
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === 2) {
                const x = (i % bounds.width) + bounds.minX;
                const y = Math.floor(i / bounds.width) + bounds.minY;
                pixels.push({ x, y, color: replacementColor });
            }
        }

        if (pixels.length > 0) {
            this.app.bus.emit('requestBatchPixels', pixels);
        }
    }

    // --- New Scanline Algorithm ---
    scanlineFill(grid, bounds, startX, startY, diagonal) {
        const w = bounds.width;
        const h = bounds.height;

        // Local coordinates
        const lx = startX - bounds.minX;
        const ly = startY - bounds.minY;

        const startIdx = ly * w + lx;
        if (grid[startIdx] !== 0) return; // Hit wall or OOB

        // Stack of seed points (just indexes)
        const stack = [startIdx];

        while (stack.length > 0) {
            let idx = stack.pop();

            // Move Up to find top edge of span (if we popped from below) 
            // OR just process. Standard scanline processes the popped pixel's row.

            // 1. Check if valid
            if (grid[idx] !== 0) continue;

            // 2. Find Left Edge of Span
            let currX = idx % w;
            let currY = Math.floor(idx / w);

            // Move Left
            let leftIdx = idx;
            while (currX > 0 && grid[leftIdx - 1] === 0) {
                leftIdx--;
                currX--;
            }

            // 3. Scan Right, Filling and Seeding
            // We scan from Left Edge until we hit a wall on the Right
            let rightIdx = leftIdx;
            let rX = currX;

            // Flags to track if we need to seed a new span above/below
            let seedAbove = false;
            let seedBelow = false;

            while (rX < w && grid[rightIdx] === 0) {
                // FILL PIXEL
                grid[rightIdx] = 2;

                // Check Row Above
                if (currY > 0) {
                    const upIdx = rightIdx - w;
                    const isWalkable = grid[upIdx] === 0;
                    if (!seedAbove && isWalkable) {
                        stack.push(upIdx);
                        seedAbove = true;
                    } else if (seedAbove && !isWalkable) {
                        seedAbove = false;
                    }
                }

                // Check Row Below
                if (currY < h - 1) {
                    const downIdx = rightIdx + w;
                    const isWalkable = grid[downIdx] === 0;
                    if (!seedBelow && isWalkable) {
                        stack.push(downIdx);
                        seedBelow = true;
                    } else if (seedBelow && !isWalkable) {
                        seedBelow = false;
                    }
                }

                // Check Diagonals (If Enabled)
                if (diagonal) {
                    // If we are at a wall boundary above/below, and diagonal is open, push it
                    // Simple hack: Just push diagonals if they are 0. The main loop handles validity.
                    // This is less efficient than pure scanline but works for 8-way.
                    if (currY > 0) {
                        if (rX > 0 && grid[rightIdx - w - 1] === 0) stack.push(rightIdx - w - 1); // Up-Left
                        if (rX < w - 1 && grid[rightIdx - w + 1] === 0) stack.push(rightIdx - w + 1); // Up-Right
                    }
                    if (currY < h - 1) {
                        if (rX > 0 && grid[rightIdx + w - 1] === 0) stack.push(rightIdx + w - 1); // Down-Left
                        if (rX < w - 1 && grid[rightIdx + w + 1] === 0) stack.push(rightIdx + w + 1); // Down-Right
                    }
                }

                // Move Right
                rightIdx++;
                rX++;
            }
        }
    }

    // --- Raycast Logic (Unchanged) ---
    closeGapsRaycast(grid, bounds, startX, startY) {
        const RAYS = 32; const hits = []; const cx = startX - bounds.minX; const cy = startY - bounds.minY;
        let validHitDistSum = 0; let validHitCount = 0; let minValidDist = Infinity;
        for (let i = 0; i < RAYS; i++) {
            const angle = (i / RAYS) * Math.PI * 2;
            const hit = this.castRay(grid, bounds, cx, cy, Math.cos(angle), Math.sin(angle));
            hits.push(hit);
            if (hit.found) { validHitDistSum += hit.dist; validHitCount++; if (hit.dist < minValidDist) minValidDist = hit.dist; }
        }
        if (validHitCount < 3) return;
        const leakThreshold = Math.max(minValidDist * 3.5, 8);
        for (let i = 0; i < RAYS; i++) {
            const curr = hits[i]; const nextIdx = (i + 1) % RAYS; const next = hits[nextIdx]; const isLeak = (h) => !h.found || h.dist > leakThreshold;
            if (!isLeak(curr) && isLeak(next)) {
                let gapEndIdx = nextIdx;
                while (isLeak(hits[gapEndIdx]) && gapEndIdx !== i) { gapEndIdx = (gapEndIdx + 1) % RAYS; }
                if (!isLeak(hits[gapEndIdx]) && gapEndIdx !== i) { this.drawLine(grid, bounds.width, curr.x, curr.y, hits[gapEndIdx].x, hits[gapEndIdx].y); }
            }
        }
    }
    castRay(grid, bounds, startX, startY, dx, dy) {
        let x = startX, y = startY, dist = 0; const maxDist = Math.max(bounds.width, bounds.height);
        while (dist < maxDist) {
            const ix = Math.round(x); const iy = Math.round(y);
            if (ix < 0 || ix >= bounds.width || iy < 0 || iy >= bounds.height) return { found: false, dist, x: ix, y: iy };
            if (grid[iy * bounds.width + ix] === 1) return { found: true, dist, x: ix, y: iy };
            x += dx; y += dy; dist++;
        } return { found: false, dist, x, y };
    }
    drawLine(grid, w, x0, y0, x1, y1) {
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0); let sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1; let err = dx - dy;
        while (true) {
            const idx = y0 * w + x0; if (idx >= 0 && idx < grid.length) grid[idx] = 1;
            if (x0 === x1 && y0 === y1) break;
            let e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; }
        }
    }
    inBounds(x, y, b) { return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY; }
    idx(x, y, b) { return (y - b.minY) * b.width + (x - b.minX); }
}