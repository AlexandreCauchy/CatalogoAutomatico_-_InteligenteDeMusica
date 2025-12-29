class BancoDados {
    constructor() {
        this.nomeDB = 'SonicHubDB';
        this.versao = 1;
        this.db = null;
    }

    async conectar() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.nomeDB, this.versao);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tabela de Músicas
                if (!db.objectStoreNames.contains('musicas')) {
                    const store = db.createObjectStore('musicas', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('artista', 'artista', { unique: false });
                    store.createIndex('reproducoes', 'reproducoes', { unique: false });
                }

                // Tabela de Usuários
                if (!db.objectStoreNames.contains('usuarios')) {
                    db.createObjectStore('usuarios', { keyPath: 'email' });
                }

                // Tabela de Chat/Histórico
                if (!db.objectStoreNames.contains('chat')) {
                    db.createObjectStore('chat', { keyPath: 'id', autoIncrement: true });
                }

                // Tabela de Preferências
                if (!db.objectStoreNames.contains('preferencias')) {
                    db.createObjectStore('preferencias', { keyPath: 'chave' });
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onerror = () => reject('Erro ao abrir IndexedDB');
        });
    }

    async adicionar(storeName, objeto) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(objeto);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async listar(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async atualizar(storeName, objeto) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(objeto);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deletar(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

const bd = new BancoDados();
