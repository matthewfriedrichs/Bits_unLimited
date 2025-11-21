export default class BrushGenerator {
    static generate(shape, size, customShapes = []) {
        // 1. Setup a canvas equal to the brush size
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // 2. Draw High-Res Shape
        const center = size / 2;
        const radius = size / 2;

        ctx.fillStyle = '#000000';
        ctx.save();
        ctx.translate(center, center);

        // Check for Custom Shape first
        const custom = customShapes.find(s => s.id === shape);

        if (custom) {
            ctx.restore();
            const srcSize = 32;
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = srcSize;
            srcCanvas.height = srcSize;
            const srcCtx = srcCanvas.getContext('2d');
            const imgData = srcCtx.createImageData(srcSize, srcSize);
            
            for (let i = 0; i < custom.data.length; i++) {
                const alpha = custom.data[i];
                imgData.data[i * 4 + 3] = alpha;
            }
            srcCtx.putImageData(imgData, 0, 0);

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(srcCanvas, 0, 0, size, size);
        } 
        else if (shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } 
        else if (shape === 'square') {
            ctx.fillRect(-radius, -radius, size, size);
            ctx.restore();
        } 
        else if (shape === 'diamond') {
            ctx.rotate(Math.PI / 4);
            const scale = 0.75; 
            ctx.scale(scale, scale);
            ctx.fillRect(-radius * 1.5, -radius * 1.5, size * 1.5, size * 1.5);
            ctx.restore();
        }
        else if (shape === 'star') {
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * radius,
                           -Math.sin((18 + i * 72) * Math.PI / 180) * radius);
                ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * radius * 0.4,
                           -Math.sin((54 + i * 72) * Math.PI / 180) * radius * 0.4);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else {
            ctx.restore();
        }

        // 3. Thresholding
        const imgData = ctx.getImageData(0, 0, size, size).data;
        const footprint = [];

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const alpha = imgData[(y * size + x) * 4 + 3];
                if (alpha > 80) { 
                    footprint.push({ 
                        x: x - Math.floor(size / 2), 
                        y: y - Math.floor(size / 2) 
                    });
                }
            }
        }
        
        if (footprint.length === 0) footprint.push({ x: 0, y: 0 });

        return footprint;
    }
}