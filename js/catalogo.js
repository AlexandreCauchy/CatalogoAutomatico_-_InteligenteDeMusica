class AnalisadorAudio {
    constructor() {
        this.contexto = new (window.AudioContext || window.webkitAudioContext)();
    }

    async analisarArquivo(file) {
        try {
            const buffer = await file.arrayBuffer();
            const audioBuffer = await this.contexto.decodeAudioData(buffer);

            // Análise Espectral (FFT) para Timbre mais preciso (Fingerprint)
            const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            const analyser = offlineCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(offlineCtx.destination);
            source.start(0);

            await offlineCtx.startRendering();

            // Captura snapshot de frequência
            const frequencyData = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(frequencyData);

            const assinatura = Array.from(frequencyData).filter((v, i) => i % 2 === 0).map(v => v / 255);
            return assinatura.length > 0 ? assinatura : null;
        } catch (e) {
            console.error("Erro na análise", e);
            return null;
        }
    }

    comparar(a1, a2) {
        if (!a1 || !a2 || a1.length !== a2.length) return 999;
        const somaQuad = a1.reduce((acc, val, i) => acc + Math.pow(val - a2[i], 2), 0);
        return Math.sqrt(somaQuad);
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
        await this.limparDuplicatasReais();
        await this.treinarTudo();
    }

    async limparDuplicatasReais() {
        const unicas = [];
        const idsParaRemover = [];
        const chavesVistas = new Set();

        for (const m of this.musicas) {
            const tituloNorm = m.titulo.toLowerCase().trim().replace(/\s+/g, ' ');
            const artistaNorm = m.artista.toLowerCase().trim().replace(/\s+/g, ' ');
            // Chave ignora álbum para evitar duplicação "Desconhecido" vs "Sem Álbum"
            const chave = `${artistaNorm}||${tituloNorm}`;

            if (chavesVistas.has(chave)) {
                idsParaRemover.push(m.id);
            } else {
                chavesVistas.add(chave);
                unicas.push(m);
            }
        }

        if (idsParaRemover.length > 0) {
            console.log(`Limpando duplicatas: ${idsParaRemover.length} itens removidos.`);
            for (const id of idsParaRemover) {
                await bd.remover('musicas', id);
            }
            this.musicas = unicas;
        }
    }

    async treinarTudo() {
        this.perfisVocais = {};
        for (const m of this.musicas) {
            if (m.artista !== "Desconhecido" && m.assinatura) {
                if (!this.perfisVocais[m.artista]) this.perfisVocais[m.artista] = [];
                if (this.perfisVocais[m.artista].length < 10) { // Aumentei limite para melhorar precisão
                    this.perfisVocais[m.artista].push(m.assinatura);
                }
            }
        }
    }

    async adicionar(dados, arquivo) {
        const artista = dados.artista ? dados.artista.trim() : "Desconhecido";
        let titulo = dados.titulo || (arquivo ? arquivo.name.replace(/\.[^/.]+$/, "") : "Sem Título");
        titulo = titulo.trim();

        // Tratamento robusto de álbum
        let albumFinal = dados.album || "Sem Álbum";
        if (!dados.album && arquivo) {
            const partes = arquivo.name.split(' - ');
            if (partes.length > 2) albumFinal = partes[1].trim();
        }
        if (albumFinal === "Desconhecido" || !albumFinal) albumFinal = "Sem Álbum";

        // Prevenção de Duplicatas
        const chaveNova = `${artista.toLowerCase()}||${titulo.toLowerCase()}`;
        const existe = this.musicas.find(m => {
            const chaveExistente = `${m.artista.toLowerCase().trim()}||${m.titulo.toLowerCase().trim()}`;
            return chaveExistente === chaveNova;
        });

        if (existe) {
            console.log("Duplicata detectada e ignorada:", titulo);
            return existe;
        }

        const assinatura = arquivo ? await this.analisador.analisarArquivo(arquivo) : null;

        const novaMusica = {
            id: Date.now() + Math.floor(Math.random() * 100000),
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
        let menorDistancia = 4.0; // Ajustado para tolerância FFT

        for (const artista in this.perfisVocais) {
            const distancias = this.perfisVocais[artista].map(t => this.analisador.comparar(assinatura, t));
            const mediaDist = distancias.reduce((a, b) => a + b, 0) / distancias.length;

            if (mediaDist < menorDistancia) {
                menorDistancia = mediaDist;
                melhorMatch = artista;
            }
        }
        return melhorMatch;
    }

    async confirmarIdentificacao(idMusica, novoAutor) {
        const index = this.musicas.findIndex(m => m.id === idMusica);
        if (index !== -1) {
            this.musicas[index].artista = novoAutor;
            // Opcional: tentar inferir álbum de outras músicas do mesmo autor
            const albumExistente = this.musicas.find(m => m.artista === novoAutor && m.album !== "Sem Álbum");
            if (albumExistente && this.musicas[index].album === "Sem Álbum") {
                this.musicas[index].album = albumExistente.album; // Sugestão simples
            }

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
        return this.musicas.filter(m => m.titulo.toLowerCase().includes(b) || m.artista.toLowerCase().includes(b) || m.album.toLowerCase().includes(b));
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
