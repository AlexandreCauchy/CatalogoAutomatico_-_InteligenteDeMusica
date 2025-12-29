class AnalisadorAudio {
    constructor() {
        this.contexto = new (window.AudioContext || window.webkitAudioContext)();
        this.modelo = null;
        this.carregandoModelo = false;
    }

    async carregarModelo() {
        if (this.modelo) return this.modelo;
        if (this.carregandoModelo) {
            // Aguarda carregamento se já estiver em andamento
            while (this.carregandoModelo) await new Promise(r => setTimeout(r, 100));
            return this.modelo;
        }

        try {
            this.carregandoModelo = true;
            console.log("Carregando modelo YAMNet local...");
            // Carrega o modelo graph model do diretório local
            // Ajuste o caminho conforme a estrutura exata. Se falhar, verifique se o servidor serve arquivos estáticos corretamente.
            this.modelo = await tf.loadGraphModel('modelos/yamnet/model.json');
            console.log("Modelo YAMNet carregado com sucesso.");
            return this.modelo;
        } catch (e) {
            console.error("Erro ao carregar YAMNet:", e);
            return null;
        } finally {
            this.carregandoModelo = false;
        }
    }

    async analisarArquivo(file) {
        try {
            if (this.contexto.state === 'suspended') await this.contexto.resume();
            if (!this.modelo) await this.carregarModelo();
            if (!this.modelo) return null; // Falha fatal no modelo

            const buffer = await file.arrayBuffer();
            const audioBuffer = await this.contexto.decodeAudioData(buffer);

            // YAMNet requer áudio a 16kHz Mono.
            const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineCtx.destination);
            source.start(0);

            const resampled = await offlineCtx.startRendering();
            const data = resampled.getChannelData(0);

            // Corta para caber na análise se for muito longo ou muito curto?
            // YAMNet aceita qualquer tamanho, mas retorna frames. Vamos pegar uma representação média.
            // Para simplificar e evitar estouro de memória, pegamos os primeiros 10-30 segundos se possível.
            // O modelo espera valores float32 entre -1 e 1.

            // Executa inferência
            // tf.tidy garante limpeza de tensores intermediários
            const signatures = tf.tidy(() => {
                const tensor = tf.tensor(data);
                // O modelo YAMNet retorna [scores, embeddings, log_mel_spectrogram]
                // Queremos as embeddings (segunda saída geralmente, ou nomeada)
                // Se executeAsync retornar array:
                return this.modelo.predict(tensor);
            });

            // YAMNet (tfjs graph model export) tipicamente retorna: [scores, embeddings, spectrogram]
            // Vamos assumir que retorna um array de Tensor. 
            // Precisamos descobrir qual index é a embedding. Geralmente é o index 1 (1024 dims).
            let embeddingsTensor;
            if (Array.isArray(signatures)) {
                embeddingsTensor = signatures[1];
            } else {
                embeddingsTensor = signatures; // Fallback se retornar só um
            }

            if (!embeddingsTensor) return null;

            // Media das embeddings ao longo do tempo para ter uma "Assinatura Global" da música
            const meanEmbedding = tf.tidy(() => embeddingsTensor.mean(0));
            const vetorAssinatura = await meanEmbedding.array();

            // Limpa tensores da memória
            tf.dispose(signatures);
            tf.dispose(meanEmbedding);

            return vetorAssinatura; // Array de floats (1024 dimensões)

        } catch (e) {
            console.error("Erro na análise YAMNet:", e);
            return null;
        }
    }

    comparar(a1, a2) {
        if (!a1 || !a2 || a1.length !== a2.length) return 999;

        // Similaridade de Cosseno para vetores de alta dimensão
        // dist = 1 - sim
        let dot = 0;
        let mag1 = 0;
        let mag2 = 0;

        for (let i = 0; i < a1.length; i++) {
            dot += a1[i] * a2[i];
            mag1 += a1[i] * a1[i];
            mag2 += a2[i] * a2[i];
        }

        mag1 = Math.sqrt(mag1);
        mag2 = Math.sqrt(mag2);

        if (mag1 === 0 || mag2 === 0) return 1; // Ortogonal/Erro

        const similarity = dot / (mag1 * mag2);
        // Retorna "distância" (menor é melhor para compatibilidade com código antigo que espera dist)
        // Cosine Sim vai de -1 a 1. 1 é identico.
        // Vamos converter para: 0 = identico, > 0 diferente.
        return 1 - similarity;
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
        const mapaUnicos = new Map();
        const idsParaRemover = [];

        // 1. Agrupar por chave única (Artista Normalizado + Título Normalizado)
        for (const m of this.musicas) {
            const tituloNorm = m.titulo.toLowerCase().trim().replace(/\s+/g, ' ');
            const artistaNorm = m.artista.toLowerCase().trim().replace(/\s+/g, ' ');
            const chave = `${artistaNorm}||${tituloNorm}`;

            if (!mapaUnicos.has(chave)) {
                mapaUnicos.set(chave, m);
            } else {
                // Conflito encontrado: Decidir qual manter e mesclar dados
                const existente = mapaUnicos.get(chave);

                // Estratégia de Merge: Manter a que tem mais informação
                let mudou = false;

                // 1. Preferir quem tem Álbum definido
                if ((!existente.album || existente.album === "Sem Álbum" || existente.album === "Desconhecido") && (m.album && m.album !== "Sem Álbum" && m.album !== "Desconhecido")) {
                    existente.album = m.album;
                    mudou = true;
                }

                // 2. Preferir quem tem Capa real (não hero.png)
                if (existente.capa && existente.capa.includes('hero.png') && m.capa && !m.capa.includes('hero.png')) {
                    existente.capa = m.capa;
                    mudou = true;
                }

                // 3. Preferir quem tem Assinatura Vocal
                if (!existente.assinatura && m.assinatura) {
                    existente.assinatura = m.assinatura;
                    mudou = true;
                }

                // Se houver mudança, atualiza o 'existente' no banco depois
                if (mudou) await bd.atualizar('musicas', existente);

                // Marca a duplicata 'm' para remoção (já que suas info úteis foram absorvidas)
                idsParaRemover.push(m.id);
            }
        }

        // 2. Varrer novamente para casos onde 'artista' era Desconhecido mas título era igual a um conhecido
        const titulosConhecidos = new Map(); // Mapa titulo -> itemConhecido
        for (const m of mapaUnicos.values()) {
            if (m.artista !== "Desconhecido") {
                titulosConhecidos.set(m.titulo.toLowerCase().trim(), m);
            }
        }

        for (const m of mapaUnicos.values()) {
            if (m.artista === "Desconhecido") {
                const possivelOriginal = titulosConhecidos.get(m.titulo.toLowerCase().trim());
                if (possivelOriginal) {
                    // Achamos uma versão "Desconhecido" de uma música que já temos com Artista.
                    // Mesclar info se útil
                    if (!possivelOriginal.assinatura && m.assinatura) {
                        possivelOriginal.assinatura = m.assinatura;
                        await bd.atualizar('musicas', possivelOriginal);
                    }
                    idsParaRemover.push(m.id);
                    mapaUnicos.delete(`${m.artista.toLowerCase().trim()}||${m.titulo.toLowerCase().trim()}`);
                }
            }
        }

        // 3. Executar remoção no banco
        if (idsParaRemover.length > 0) {
            console.log(`Limpando ${idsParaRemover.length} duplicatas consolidadas.`);
            for (const id of idsParaRemover) {
                await bd.remover('musicas', id);
            }
            // Atualiza lista em memória
            this.musicas = await bd.listar('musicas'); // Recarrega limpo
        } else {
            this.musicas = Array.from(mapaUnicos.values());
        }
    }

    async treinarTudo() {
        this.perfisVocais = {};
        let count = 0;
        for (const m of this.musicas) {
            if (m.artista && m.artista !== "Desconhecido") {
                // YAMNet usa 1024 dimensões. Ignora assinaturas antigas de 10.
                if (m.assinatura && Array.isArray(m.assinatura) && m.assinatura.length === 1024) {
                    if (!this.perfisVocais[m.artista]) this.perfisVocais[m.artista] = [];
                    // Limite deslizante para manter a performance
                    if (this.perfisVocais[m.artista].length < 20) {
                        this.perfisVocais[m.artista].push(m.assinatura);
                        count++;
                    }
                }
            }
        }
        console.log(`Banco de Voz Reconstruído (YAMNet): ${Object.keys(this.perfisVocais).length} artistas, ${count} amostras.`);
    }

    /**
     * Processa automaticamente o timber vocal de músicas que já estão no catálogo (arquivos carregados),
     * mas ainda não possuem assinatura (ou possuem a antiga).
     * @param {Function} onProgress callback(progresso, total, atual) para atualizar UI
     */
    async processarPerfisVocais(onProgress = null) {
        // Inclui músicas sem assinatura OU com assinatura antiga (length 10)
        const pendentes = this.musicas.filter(m => m.arquivo && (!m.assinatura || m.assinatura.length === 10));
        let processados = 0;
        const total = pendentes.length;

        console.log(`Iniciando extração de voz (YAMNet) para ${total} músicas.`);

        for (const m of pendentes) {
            try {
                // Resume contexto se necessário antes de cada arquivo crítico
                if (this.analisador.contexto.state === 'suspended') await this.analisador.contexto.resume();

                // Se temos o arquivo em memória (Blob/File), processamos
                const assinatura = await this.analisador.analisarArquivo(m.arquivo);

                if (assinatura) {
                    m.assinatura = assinatura;
                    // Atualiza no banco
                    await bd.atualizar('musicas', m);
                } else {
                    console.warn(`Não foi possível extrair assinatura YAMNet para: ${m.titulo}`);
                }
            } catch (err) {
                console.error(`Erro ao processar áudio de ${m.titulo}:`, err);
            }

            processados++;
            if (onProgress) onProgress(processados, total, m.titulo);

            // Pequeno delay para liberar a thread UI e GC
            await new Promise(r => setTimeout(r, 50));
        }

        // Reconstrói cache de perfis
        await this.treinarTudo();
        return processados;
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

        // Prevenção de Duplicatas Imediata
        // Agora verificamos se já existe no array em memória atualizado
        const chaveNova = `${artista.toLowerCase()}||${titulo.toLowerCase()}`;
        const existe = this.musicas.find(m => {
            const chaveExistente = `${m.artista.toLowerCase().trim()}||${m.titulo.toLowerCase().trim()}`;
            return chaveExistente === chaveNova;
        });

        if (existe) {
            // Se já existe, verificamos se podemos melhorar o registro existente com os dados novos
            let mudou = false;
            if ((!existe.album || existe.album === "Sem Álbum") && albumFinal !== "Sem Álbum") {
                existe.album = albumFinal;
                mudou = true;
            }
            // Se estamos subindo o arquivo novamente, talvez queiramos atualizar a assinatura?
            // Se a assinatura for antiga (10) ou inexistente, reprocessa.
            if ((!existe.assinatura || existe.assinatura.length === 10) && arquivo) {
                existe.assinatura = await this.analisador.analisarArquivo(arquivo);
                mudou = true;
            }

            if (mudou) await bd.atualizar('musicas', existe);
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
        if (!assinatura || assinatura.length !== 10) return null;
        let melhorMatch = null;
        let menorDistancia = 0.05; // Sensibilidade ajustada para Energy Profile (valores normalizados)

        for (const artista in this.perfisVocais) {
            const perfis = this.perfisVocais[artista];
            if (perfis.length === 0) continue;

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
