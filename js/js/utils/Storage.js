export default class Storage {
    constructor(dbName = 'PixelForgeDB', storeName = 'projects') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.dbPromise = this.initDB();
    }

    initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject('DB Open Failed');
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async save(key, data) {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.put(data, key); // 'put' updates or inserts
            req.onsuccess = () => resolve();
            req.onerror = () => reject('Save Failed');
        });
    }

    async load(key) {
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject('Load Failed');
        });
    }
}