import BaseTool from './BaseTool.js';

export default class BucketTool extends BaseTool {
    onPointerDown(p) {
        this.fill(p.x, p.y);
    }

    fill(startX, startY) {
        const targetColor = this.app.dataAccess.getPixelColor(startX, startY);
        const replacementColor = this.app.state.primaryColor;

        // Optimization: Don't fill if color is the same
        if (targetColor === replacementColor) return;

        // 1. Calculate Safe Bounds (Guardrails)
        const da = this.app.dataAccess;
        let minX = startX, maxX = startX, minY = startY, maxY = startY;

        // Expand bounds to include existing content
        if (da.activeProject) {
            const frame = da.frames[da.currentFrameIndex];
            const layer = frame.layers.find(l => l.id === da.activeLayerId);
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
        const safeRect = {
            minX: minX - PADDING,
            maxX: maxX + PADDING,
            minY: minY - PADDING,
            maxY: maxY + PADDING
        };

        // 2. Flood Fill Algorithm
        const pixels = [];
        const stack = [{ x: startX, y: startY }];
        const seen = new Set([`${startX},${startY}`]);
        
        let iterations = 0;
        const maxPixels = (safeRect.maxX - safeRect.minX) * (safeRect.maxY - safeRect.minY);

        while (stack.length > 0 && iterations < maxPixels) {
            const { x, y } = stack.pop();
            iterations++;

            pixels.push({ x, y, color: replacementColor });

            const neighbors = [
                { x: x + 1, y: y }, { x: x - 1, y: y },
                { x: x, y: y + 1 }, { x: x, y: y - 1 }
            ];

            for (const n of neighbors) {
                // Check Guardrails
                if (n.x < safeRect.minX || n.x > safeRect.maxX || n.y < safeRect.minY || n.y > safeRect.maxY) continue;

                const key = `${n.x},${n.y}`;
                if (seen.has(key)) continue;

                const nColor = this.app.dataAccess.getPixelColor(n.x, n.y);
                if (nColor === targetColor) {
                    seen.add(key);
                    stack.push(n);
                }
            }
        }

        if (pixels.length > 0) {
            this.app.bus.emit('requestBatchPixels', pixels);
        }
    }
}