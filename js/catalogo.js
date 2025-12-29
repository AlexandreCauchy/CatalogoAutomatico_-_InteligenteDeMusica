class AnalisadorAudio {
    constructor() {
        this.contexto = new (window.AudioContext || window.webkitAudioContext)();
    }

    async analisarArquivo(file) {
        try {
            const buffer = await file.arrayBuffer();
            const audioBuffer = await this.contexto.decodeAudioData(buffer);
            const canalData = audioBuffer.getChannelData(0);
            let somaEnergia = 0;
            const step = Math.max(1, Math.floor(canalData.length / 5000));
            let pontos = 0;
            for (let i = 0; i < canalData.length; i += step) {
                somaEnergia += Math.abs(canalData[i]);
                pontos++;
            }
            const energiaMedia = (somaEnergia / pontos).toFixed(6);
            return [
                parseFloat(energiaMedia),
                Math.abs(canalData[Math.floor(canalData.length * 0.2)]),
                Math.abs(canalData[Math.floor(canalData.length * 0.4)]),
                Math.abs(canalData[Math.floor(canalData.length * 0.6)]),
                Math.abs(canalData[Math.floor(canalData.length * 0.8)])
            ].map(Number);
        } catch (e) { return null; }
    }

    comparar(a1, a2) {
        if (!a1 || !a2) return 999;
        return Math.sqrt(a1.reduce((acc, val, i) => acc + Math.pow(val - a2[i], 2), 0));
    }
}

class CatalogoInteligente {
    constructor() {
        this.analisador = new AnalisadorAudio();
        this.musicas = [];
        this.perfisVocais = {};
    }

    async inicializar() {
        await bd.conectar();
        this.musicas = await bd.listar('musicas');
        await this.treinarTudo();
    }

    async treinarTudo() {
        this.perfisVocais = {};
        for (const m of this.musicas) {
            if (m.artista !== "Desconhecido") {
                if (!m.assinatura && m.arquivo) {
                    m.assinatura = await this.analisador.analisarArquivo(m.arquivo);
                    await bd.atualizar('musicas', m);
                }
                if (m.assinatura) {
                    if (!this.perfisVocais[m.artista]) this.perfisVocais[m.artista] = [];
                    this.perfisVocais[m.artista].push(m.assinatura);
                }
            }
        }
    }

    async adicionar(dados, arquivo) {
        // Normalização básica para checagem
        const artista = dados.artista || "Desconhecido";
        const titulo = dados.titulo || (arquivo ? arquivo.name.replace(/\.[^/.]+$/, "") : "Sem Título");

        // --- PREVENÇÃO DE DUPLICATAS ---
        const existe = this.musicas.find(m =>
            m.artista.toLowerCase().trim() === artista.toLowerCase().trim() &&
            m.titulo.toLowerCase().trim() === titulo.toLowerCase().trim()
        );
        if (existe) {
            console.log("Música já existente no catálogo:", titulo);
            return existe;
        }

        const assinatura = arquivo ? await this.analisador.analisarArquivo(arquivo) : null;

        let albumFinal = dados.album || "Sem Álbum";
        if (!dados.album && arquivo) {
            const partes = arquivo.name.split(' - ');
            if (partes.length > 2) albumFinal = partes[1].trim();
        }

        const novaMusica = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            titulo: titulo,
            artista: artista,
            album: albumFinal,
            capa: 'assets/img/hero.png',
            assinatura: assinatura,
            arquivo: arquivo,
            reproducoes: 0,
            dataAdicao: new Date()
        };

        await bd.atualizar('musicas', novaMusica);
        this.musicas.unshift(novaMusica);

        if (novaMusica.artista !== "Desconhecido" && novaMusica.assinatura) {
            if (!this.perfisVocais[novaMusica.artista]) this.perfisVocais[novaMusica.artista] = [];
            this.perfisVocais[novaMusica.artista].push(novaMusica.assinatura);
        }

        return novaMusica;
    }

    identificarPossivelAutor(assinatura) {
        if (!assinatura) return null;
        let melhorMatch = null;
        let menorDistancia = 0.1;
        for (const artista in this.perfisVocais) {
            for (const timbre of this.perfisVocais[artista]) {
                const dist = this.analisador.comparar(assinatura, timbre);
                if (dist < menorDistancia) {
                    menorDistancia = dist;
                    melhorMatch = artista;
                }
            }
        }
        return melhorMatch;
    }

    async confirmarIdentificacao(idMusica, novoAutor) {
        const index = this.musicas.findIndex(m => m.id === idMusica);
        if (index !== -1) {
            this.musicas[index].artista = novoAutor;
            await bd.atualizar('musicas', this.musicas[index]);
            await this.treinarTudo();
            return this.musicas[index];
        }
        return null;
    }

    getPorArtista(artista) { return this.musicas.filter(m => m.artista === artista); }
    getDesconhecidas() { return this.musicas.filter(m => m.artista === "Desconhecido"); }
    getAlbunsPorArtista(artista) {
        const musicas = this.getPorArtista(artista);
        return Array.from(new Set(musicas.map(m => m.album))).sort();
    }
    getMusicasPorAlbum(artista, album) {
        return this.musicas.filter(m => m.artista === artista && m.album === album);
    }
    getArtistas() { return Array.from(new Set(this.musicas.map(m => m.artista).filter(a => a !== "Desconhecido"))).sort(); }
    buscar(termo) {
        const b = termo.toLowerCase();
        return this.musicas.filter(m => m.titulo.toLowerCase().includes(b) || m.artista.toLowerCase().includes(b));
    }

    async exportarPastaZIP(artista, album = null) {
        if (typeof JSZip === 'undefined') return;
        const zip = new JSZip();
        const musicas = album ? this.getMusicasPorAlbum(artista, album) : this.getPorArtista(artista);
        const nomePasta = album ? `${artista} - ${album}` : artista;
        const pasta = zip.folder(nomePasta);
        musicas.forEach(m => { if (m.arquivo) pasta.file(`${m.titulo}.mp3`, m.arquivo); });
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `${nomePasta}.zip`;
        a.click();
    }
}

const catalogo = new CatalogoInteligente();
