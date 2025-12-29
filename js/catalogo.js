class AnalisadorAudio {
    constructor() {
        this.contexto = new (window.AudioContext || window.webkitAudioContext)();
    }

    async analisarArquivo(file) {
        try {
            const buffer = await file.arrayBuffer();
            const audioBuffer = await this.contexto.decodeAudioData(buffer);
            const canalData = audioBuffer.getChannelData(0);

            // 1. Busca por pico de energia (encontra parte "alta" da música)
            let maxEnergia = 0;
            let indicePico = 0;
            const stepBusca = 5000;

            for (let i = 0; i < canalData.length; i += stepBusca) {
                if (Math.abs(canalData[i]) > maxEnergia) {
                    maxEnergia = Math.abs(canalData[i]);
                    indicePico = i;
                }
            }

            // 2. Extrai amostra ao redor do pico (aprox 10000 amostras)
            const range = 10000;
            const inicio = Math.max(0, indicePico - range / 2);
            const fim = Math.min(canalData.length, indicePico + range / 2);
            const amostra = canalData.slice(inicio, fim);

            if (amostra.length === 0) return null;

            // 3. Extrai Energy Profile (divide em 10 segmentos)
            const assinatura = [];
            const segmentoSize = Math.floor(amostra.length / 10);

            for (let k = 0; k < 10; k++) {
                let soma = 0;
                for (let j = 0; j < segmentoSize; j++) {
                    const idx = k * segmentoSize + j;
                    if (idx < amostra.length) soma += Math.abs(amostra[idx]);
                }
                assinatura.push(parseFloat((soma / segmentoSize).toFixed(5)));
            }

            return assinatura;
        } catch (e) {
            console.error("Erro na análise PCM:", e);
            return null;
        }
    }

    comparar(a1, a2) {
        if (!a1 || !a2 || a1.length !== a2.length) return 999;
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
        await this.limparDuplicatasReais();
        await this.treinarTudo();
    }

    async limparDuplicatasReais() {
        const unicas = [];
        const idsParaRemover = [];
        const chavesVistas = new Set();
        const titulosConhecidos = new Set();

        // 1. Coleta títulos que já têm autor definido
        this.musicas.forEach(m => {
            if (m.artista !== "Desconhecido") {
                titulosConhecidos.add(m.titulo.toLowerCase().trim());
            }
        });

        // 2. Filtra duplicatas
        for (const m of this.musicas) {
            const tituloNorm = m.titulo.toLowerCase().trim();
            const artistaNorm = m.artista.toLowerCase().trim();

            // Regra: se é "Desconhecido" mas já existe esse título com autor, remove o desconhecido
            if (m.artista === "Desconhecido" && titulosConhecidos.has(tituloNorm)) {
                idsParaRemover.push(m.id);
                continue;
            }

            const chave = `${artistaNorm}||${tituloNorm}`; // Ignora álbum na chave
            if (chavesVistas.has(chave)) {
                idsParaRemover.push(m.id);
            } else {
                chavesVistas.add(chave);
                unicas.push(m);
            }
        }

        if (idsParaRemover.length > 0) {
            console.log(`Limpando ${idsParaRemover.length} duplicatas.`);
            for (const id of idsParaRemover) {
                await bd.remover('musicas', id);
            }
            this.musicas = unicas;
        }
    }

    async treinarTudo() {
        this.perfisVocais = {};
        for (const m of this.musicas) {
            if (m.artista !== "Desconhecido") {
                if (m.assinatura && Array.isArray(m.assinatura) && m.assinatura.length === 10) {
                    if (!this.perfisVocais[m.artista]) this.perfisVocais[m.artista] = [];
                    // Limite deslizante para manter a performance, mas com amostras recentes
                    if (this.perfisVocais[m.artista].length < 15) {
                        this.perfisVocais[m.artista].push(m.assinatura);
                    }
                }
            }
        }
    }

    async adicionar(dados, arquivo) {
        const artista = dados.artista ? dados.artista.trim() : "Desconhecido";
        let titulo = dados.titulo || (arquivo ? arquivo.name.replace(/\.[^/.]+$/, "") : "Sem Título");
        titulo = titulo.trim();

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

        if (existe) return existe;

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
        if (!assinatura || assinatura.length !== 10) return null;
        let melhorMatch = null;
        let menorDistancia = 0.05; // Sensibilidade ajustada para Energy Profile (valores normalizados)

        for (const artista in this.perfisVocais) {
            const perfis = this.perfisVocais[artista];
            if (perfis.length === 0) continue;

            // Compara com a média dos perfis ou o melhor perfil individual?
            // Melhor perfil individual é mais preciso para variabilidade vocal
            for (const perfil of perfis) {
                const dist = this.analisador.comparar(assinatura, perfil);
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
            // Tenta mover álbum se possível
            const exemplo = this.musicas.find(m => m.artista === novoAutor && m.album !== "Sem Álbum");
            if (exemplo && this.musicas[index].album === "Sem Álbum") {
                this.musicas[index].album = exemplo.album;
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
