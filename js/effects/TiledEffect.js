export default class TiledEffect {
    apply({ ctx, border, renderService, width, height, camera, activeInteractionBorderId }) {
        // [Req 2] Condition: Only show effect if we are actively drawing/interacting with THIS border
        if (activeInteractionBorderId !== border.id) return;

        const zoom = camera.zoom;
        // Calculate Screen Coordinates of the Border (Source Region)
        const sx = Math.floor((border.x * zoom) + (width / 2 + camera.x));
        const sy = Math.floor((border.y * zoom) + (height / 2 + camera.y));
        const sw = Math.ceil(border.w * zoom);
        const sh = Math.ceil(border.h * zoom);

        if (sw < 1 || sh < 1) return;

        // 1. Extract the Region to a Temporary Canvas
        const pCan = document.createElement('canvas');
        pCan.width = sw;
        pCan.height = sh;
        const pCtx = pCan.getContext('2d');

        // Copy existing committed pixels
        pCtx.drawImage(
            renderService.compositeCanvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        // [Req 1] Live Update: Overlay the active tool buffer
        // We need to fetch the tool that is currently being used
        const app = renderService.app;
        const toolService = app.services.get('tools');

        // We check the active tool (via ID) for any pending pixels
        const currentTool = toolService.tools[toolService.currentToolId];

        if (currentTool && currentTool.buffer && currentTool.buffer.length > 0) {
            const originX = width / 2 + camera.x;
            const originY = height / 2 + camera.y;

            pCtx.save();
            for (const p of currentTool.buffer) {
                // Convert World Pixel -> Screen Space
                const screenX = (p.x * zoom) + originX;
                const screenY = (p.y * zoom) + originY;

                // Map Screen Space -> Pattern Canvas Space
                // Since we copied from (sx, sy), we subtract that offset
                const drawX = screenX - sx;
                const drawY = screenY - sy;

                // Only draw if it falls inside the pattern source (optimization)
                if (drawX >= -zoom && drawX < sw && drawY >= -zoom && drawY < sh) {
                    if (p.color) {
                        pCtx.fillStyle = p.color;
                        pCtx.fillRect(drawX, drawY, zoom, zoom);
                    } else {
                        // Handle Eraser (Clear the pixel on the pattern)
                        pCtx.clearRect(drawX, drawY, zoom, zoom);
                    }
                }
            }
            pCtx.restore();
        }

        // 2. Create and Apply Pattern
        const pattern = ctx.createPattern(pCan, 'repeat');

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = pattern;

        const matrix = new DOMMatrix().translate(sx, sy);
        pattern.setTransform(matrix);

        ctx.fillRect(0, 0, width, height);

        ctx.restore();

        // Visual Feedback: Active Border Outline
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.restore();
    }
}