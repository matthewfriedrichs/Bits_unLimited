import BaseTool from './BaseTool.js';
import { PixelBatchCommand } from '../commands/PixelCommands.js';
import { ToolIcon, ToolSidebar } from '../ui/components/ToolDef.js';

export default class BucketTool extends BaseTool {
    constructor(app) {
        super(app);
        this.currentSlot = 'primary';
    }

    // --- UI Definitions ---

    get iconDef() {
        return new ToolIcon({
            icon: 'fill-drip',
            label: 'Fill Tool',
            color: 'text-amber-400',
            hotkey: 'G'
        });
    }

    get sidebarDef() {
        const storeKey = this.currentSlot === 'primary' ? 'primarySettings' : 'secondarySettings';
        const settings = this.app.store.get(storeKey) || { bucket: { mode: 'normal', diagonal: false } };
        const config = settings.bucket || { mode: 'normal', diagonal: false };

        return new ToolSidebar()
            .addHeader('Fill Settings')
            .addSelect({
                id: 'mode',
                label: 'Fill Mode',
                value: config.mode,
                options: [
                    { id: 'normal', label: 'Normal' },
                    { id: 'smart', label: 'Smart (Close Gaps)' }
                ]
            })
            .addToggle({
                id: 'diagonal',
                label: '8-Way Connect',
                value: config.diagonal
            });
    }

    setSetting(key, val) {
        const storeKey = this.currentSlot === 'primary' ? 'primarySettings' : 'secondarySettings';
        const settings = { ...this.app.store.get(storeKey) };
        if (!settings.bucket) settings.bucket = {};
        settings.bucket[key] = val;
        this.app.store.set(storeKey, settings);
        if (key === 'mode') {
            this.app.bus.emit('tool:modeChanged', { toolId: 'bucket', mode: val });
        }
    }

    // --- Helper: Check for Tiled Border ---
    _getTiledBorder(x, y) {
        const project = this.app.store.activeProject;
        if (!project) return null;
        const frame = project.frames[project.currentFrameIndex];
        const borders = frame.borders || (frame.border ? [frame.border] : []);

        // Check distinct borders in reverse order (top-most first)
        for (let i = borders.length - 1; i >= 0; i--) {
            const b = borders[i];
            // Only apply logic if effect is specifically 'tiled'
            if (b.effect === 'tiled' && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
                return b;
            }
        }
        return null;
    }

    // --- Logic ---

    onPointerDown(p) {
        this.currentSlot = (p.button === 2) ? 'secondary' : 'primary';
        this.fill(p.x, p.y);
    }

    fill(startX, startY) {
        const projectService = this.app.services.get('project');
        const targetColor = projectService.getPixelColor(startX, startY);
        const replacementColor = this.app.store.get('primaryColor');

        if (targetColor === replacementColor) return;

        // 1. Determine Bounds and Tiled Mode
        let bounds;
        let isTiled = false;
        const tiledBorder = this._getTiledBorder(startX, startY);

        if (tiledBorder) {
            // Tiled Mode: Restrict bounds exactly to the border
            bounds = {
                minX: tiledBorder.x,
                maxX: tiledBorder.x + tiledBorder.w - 1,
                minY: tiledBorder.y,
                maxY: tiledBorder.y + tiledBorder.h - 1,
                width: tiledBorder.w,
                height: tiledBorder.h
            };
            isTiled = true;
        } else {
            // Normal Mode: Calculate bounds based on content
            let minX = startX, maxX = startX, minY = startY, maxY = startY;
            if (projectService.activeProject) {
                const frame = projectService.frames[projectService.currentFrameIndex];
                const layer = frame.layers.find(l => l.id === projectService.activeLayerId);
                if (layer) {
                    for (const key of layer.data.keys()) {
                        const [px, py] = key.split(',').map(Number);
                        if (px < minX) minX = px; if (px > maxX) maxX = px;
                        if (py < minY) minY = py; if (py > maxY) maxY = py;
                    }
                }
            }
            const PADDING = 64;
            bounds = {
                minX: minX - PADDING, maxX: maxX + PADDING,
                minY: minY - PADDING, maxY: maxY + PADDING,
                width: (maxX + PADDING) - (minX - PADDING) + 1,
                height: (maxY + PADDING) - (minY - PADDING) + 1
            };
        }

        // 2. Initialize Grid
        // 0 = Empty/Target (Fillable), 1 = Blocked (Different Color), 2 = Visited
        const grid = new Uint8Array(bounds.width * bounds.height);
        const frame = projectService.frames[projectService.currentFrameIndex];
        const layer = frame.layers.find(l => l.id === projectService.activeLayerId);

        if (targetColor === null) {
            // Filling empty space: existing pixels are obstacles
            if (layer) {
                for (const key of layer.data.keys()) {
                    const [px, py] = key.split(',').map(Number);
                    if (this.inBounds(px, py, bounds)) grid[this.idx(px, py, bounds)] = 1;
                }
            }
        } else {
            // Replacing color: everything is blocked (1) unless it matches target (0)
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

        const storeKey = this.currentSlot === 'primary' ? 'primarySettings' : 'secondarySettings';
        const settings = this.app.store.get(storeKey) || { bucket: { mode: 'normal', diagonal: false } };
        const config = settings.bucket || { mode: 'normal', diagonal: false };

        // Disable Smart Fill in Tiled Mode (complexity trade-off)
        if (config.mode === 'smart' && !isTiled) {
            this.closeGapsRaycast(grid, bounds, startX, startY);
        }

        // 3. Run Fill
        this.scanlineFill(grid, bounds, startX, startY, config.diagonal, isTiled);

        // 4. Commit Changes
        const pixelUpdates = [];
        const activeLayerId = projectService.activeLayerId;
        const currentFrameIndex = projectService.currentFrameIndex;

        for (let i = 0; i < grid.length; i++) {
            if (grid[i] === 2) { // Visited
                const x = (i % bounds.width) + bounds.minX;
                const y = Math.floor(i / bounds.width) + bounds.minY;
                const oldColor = projectService.getPixelColor(x, y);

                pixelUpdates.push({
                    x, y,
                    color: replacementColor,
                    oldColor: oldColor,
                    layerId: activeLayerId,
                    frameIndex: currentFrameIndex
                });
            }
        }

        if (pixelUpdates.length > 0) {
            const history = this.app.services.get('history');
            history.execute(new PixelBatchCommand(this.app, pixelUpdates));
        }
    }

    scanlineFill(grid, bounds, startX, startY, diagonal, isTiled = false) {
        const w = bounds.width;
        const h = bounds.height;
        // Convert world start pos to local grid pos
        const lx = startX - bounds.minX;
        const ly = startY - bounds.minY;

        const startIdx = ly * w + lx;
        if (startIdx < 0 || startIdx >= grid.length || grid[startIdx] !== 0) return;

        const stack = [startIdx];

        while (stack.length > 0) {
            let idx = stack.pop();
            if (grid[idx] !== 0) continue;

            let currX = idx % w;
            let currY = Math.floor(idx / w);

            // Find Left Edge of scanline segment
            let leftIdx = idx;
            while (currX > 0 && grid[leftIdx - 1] === 0) {
                leftIdx--;
                currX--;
            }

            // TILED: Check Left Wrap
            // If we hit the left edge (currX === 0) and it's tiled, 
            // check if the rightmost pixel (w-1) is fillable.
            if (isTiled && currX === 0) {
                const wrapX = w - 1;
                const wrapIdx = currY * w + wrapX;
                if (grid[wrapIdx] === 0) stack.push(wrapIdx);
            }

            // Scan Right
            let rightIdx = leftIdx;
            let rX = currX;
            let seedAbove = false;
            let seedBelow = false;

            while (rX < w && grid[rightIdx] === 0) {
                grid[rightIdx] = 2; // Mark Visited

                // Check Up
                let checkUp = false;
                let upIdx = -1;
                if (currY > 0) {
                    checkUp = true;
                    upIdx = rightIdx - w;
                } else if (isTiled) {
                    // Wrap Y Up: Top row checks Bottom row
                    checkUp = true;
                    upIdx = (h - 1) * w + rX;
                }

                if (checkUp) {
                    const isWalkable = grid[upIdx] === 0;
                    if (!seedAbove && isWalkable) {
                        stack.push(upIdx);
                        seedAbove = true;
                    } else if (seedAbove && !isWalkable) {
                        seedAbove = false;
                    }
                }

                // Check Down
                let checkDown = false;
                let downIdx = -1;
                if (currY < h - 1) {
                    checkDown = true;
                    downIdx = rightIdx + w;
                } else if (isTiled) {
                    // Wrap Y Down: Bottom row checks Top row
                    checkDown = true;
                    downIdx = rX; // 0 * w + rX
                }

                if (checkDown) {
                    const isWalkable = grid[downIdx] === 0;
                    if (!seedBelow && isWalkable) {
                        stack.push(downIdx);
                        seedBelow = true;
                    } else if (seedBelow && !isWalkable) {
                        seedBelow = false;
                    }
                }

                // TILED: Check Right Wrap
                // If we are at the right edge, check the left edge
                if (isTiled && rX === w - 1) {
                    const wrapX = 0;
                    const wrapIdx = currY * w + wrapX;
                    if (grid[wrapIdx] === 0) stack.push(wrapIdx);
                }

                // Diagonal Handling (Simplified for standard fill, ignored for Tiled to prevent leaks for now)
                if (diagonal && !isTiled) {
                    if (currY > 0) {
                        if (rX > 0 && grid[rightIdx - w - 1] === 0) stack.push(rightIdx - w - 1);
                        if (rX < w - 1 && grid[rightIdx - w + 1] === 0) stack.push(rightIdx - w + 1);
                    }
                    if (currY < h - 1) {
                        if (rX > 0 && grid[rightIdx + w - 1] === 0) stack.push(rightIdx + w - 1);
                        if (rX < w - 1 && grid[rightIdx + w + 1] === 0) stack.push(rightIdx + w + 1);
                    }
                }

                rightIdx++;
                rX++;
            }
        }
    }

    closeGapsRaycast(grid, bounds, startX, startY) {
        const RAYS = 32; const hits = []; const cx = startX - bounds.minX; const cy = startY - bounds.minY;
        let validHitDistSum = 0; let validHitCount = 0; let minValidDist = Infinity;
        for (let i = 0; i < RAYS; i++) { const angle = (i / RAYS) * Math.PI * 2; const hit = this.castRay(grid, bounds, cx, cy, Math.cos(angle), Math.sin(angle)); hits.push(hit); if (hit.found) { validHitDistSum += hit.dist; validHitCount++; if (hit.dist < minValidDist) minValidDist = hit.dist; } }
        if (validHitCount < 3) return; const leakThreshold = Math.max(minValidDist * 3.5, 8);
        for (let i = 0; i < RAYS; i++) { const curr = hits[i]; const nextIdx = (i + 1) % RAYS; const next = hits[nextIdx]; const isLeak = (h) => !h.found || h.dist > leakThreshold; if (!isLeak(curr) && isLeak(next)) { let gapEndIdx = nextIdx; while (isLeak(hits[gapEndIdx]) && gapEndIdx !== i) { gapEndIdx = (gapEndIdx + 1) % RAYS; } if (!isLeak(hits[gapEndIdx]) && gapEndIdx !== i) { this.drawLine(grid, bounds.width, curr.x, curr.y, hits[gapEndIdx].x, hits[gapEndIdx].y); } } }
    }
    castRay(grid, bounds, startX, startY, dx, dy) { let x = startX, y = startY, dist = 0; const maxDist = Math.max(bounds.width, bounds.height); while (dist < maxDist) { const ix = Math.round(x); const iy = Math.round(y); if (ix < 0 || ix >= bounds.width || iy < 0 || iy >= bounds.height) return { found: false, dist, x: ix, y: iy }; if (grid[iy * bounds.width + ix] === 1) return { found: true, dist, x: ix, y: iy }; x += dx; y += dy; dist++; } return { found: false, dist, x, y }; }
    drawLine(grid, w, x0, y0, x1, y1) { let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0); let sx = (x0 < x1) ? 1 : -1, sy = (y0 < y1) ? 1 : -1; let err = dx - dy; while (true) { const idx = y0 * w + x0; if (idx >= 0 && idx < grid.length) grid[idx] = 1; if (x0 === x1 && y0 === y1) break; let e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } } }
    inBounds(x, y, b) { return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY; }
    idx(x, y, b) { return (y - b.minY) * b.width + (x - b.minX); }
}