export default class DomBuilder {
    /**
     * @param {string} tag - HTML tag (e.g., 'div', 'button')
     * @param {Object} attrs - Attributes (class, id, style) and Events (onClick, onInput)
     * @param  {...(string|Node|Node[])} children - Child elements or text
     */
    static create(tag, attrs = {}, ...children) {
        const el = document.createElement(tag);

        // 1. Attributes & Events
        for (const [key, val] of Object.entries(attrs)) {
            // Handle Events (e.g., onClick -> click)
            if (key.startsWith('on') && typeof val === 'function') {
                const eventName = key.substring(2).toLowerCase();
                el.addEventListener(eventName, val);
            }
            // Handle Class
            else if (key === 'class' || key === 'className') {
                el.className = val;
            }
            // Handle Style Object
            else if (key === 'style' && typeof val === 'object') {
                Object.assign(el.style, val);
            }
            // Standard Attributes (id, type, value, etc.)
            else if (val !== null && val !== undefined && val !== false) {
                el.setAttribute(key, val === true ? '' : val);
            }
        }

        // 2. Children
        const append = (child) => {
            if (typeof child === 'string' || typeof child === 'number') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                el.appendChild(child);
            } else if (Array.isArray(child)) {
                child.forEach(append);
            }
        };
        children.forEach(append);

        return el;
    }

    // Helper for FontAwesome icons
    static icon(name, extraClass = '') {
        return this.create('i', { class: `fas fa-${name} ${extraClass}` });
    }
}