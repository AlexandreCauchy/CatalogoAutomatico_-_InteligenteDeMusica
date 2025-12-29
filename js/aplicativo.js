document.addEventListener('DOMContentLoaded', async () => {
    await catalogo.inicializar();

    const gradeCatalogo = document.getElementById('gradeCatalogo');
    const inputPasta = document.getElementById('inputPasta');
    const campoPesquisa = document.getElementById('campoPesquisa');
    const feedbackAnalise = document.getElementById('feedbackAnalise');
    const textoFeedbackAnalise = document.getElementById('textoFeedbackAnalise');
    const btnVoltarNivel = document.getElementById('btnVoltarNivel');

    // Player
    const btnPlay = document.getElementById('btnPlay');
    const btnVoltar = document.getElementById('btnVoltar');
    const btnAvancar = document.getElementById('btnAvancar');
    const playerTitulo = document.getElementById('playerTitulo');
    const playerArtista = document.getElementById('playerArtista');
    const playerCapa = document.getElementById('playerCapa');
    const progressoAtual = document.getElementById('progressoAtual');

    let somAtual = new Audio();
    let abaAtual = 'catalogo';
    let artistaSelecionado = null;
    let albumSelecionado = null;
    let playlistAtual = [];
    let indiceAtual = 0;

    // --- PESQUISA ---
    if (campoPesquisa) {
        campoPesquisa.oninput = (e) => {
            const resultados = catalogo.buscar(e.target.value);
            renderizarGrade(resultados);
        };
    }

    // --- NAVEGAÇÃO ---
    document.querySelectorAll('.item-navegacao').forEach(item => {
        item.onclick = () => {
            document.querySelectorAll('.item-navegacao').forEach(i => i.classList.remove('ativo'));
            item.classList.add('ativo');
            abaAtual = item.dataset.aba;
            resetarNavegacao();
            atualizarInterface();
        };
    });

    function resetarNavegacao() {
        artistaSelecionado = null;
        albumSelecionado = null;
        btnVoltarNivel.style.display = 'none';
    }

    btnVoltarNivel.onclick = () => {
        if (albumSelecionado) {
            albumSelecionado = null;
            renderizarAlbuns(artistaSelecionado);
        } else if (artistaSelecionado) {
            artistaSelecionado = null;
            btnVoltarNivel.style.display = 'none';
            renderizarPastas();
        }
    };

    function atualizarInterface() {
        document.getElementById('controlesPasta').style.display = 'none';
        btnVoltarNivel.style.display = 'none';

        switch (abaAtual) {
            case 'catalogo':
                document.getElementById('tituloSecao').innerText = 'Meu Catálogo';
                playlistAtual = catalogo.musicas;
                renderizarGrade(playlistAtual);
                break;
            case 'pastas':
                document.getElementById('tituloSecao').innerText = 'Pastas de Artistas';
                renderizarPastas();
                break;
            case 'desconhecidas':
                document.getElementById('tituloSecao').innerText = 'Músicas Desconhecidas';
                playlistAtual = catalogo.getDesconhecidas();
                renderizarGrade(playlistAtual);
                break;
            case 'bancoVoz':
                document.getElementById('tituloSecao').innerText = 'Banco de Voz (Perfis Biométricos)';
                renderizarBancoVoz();
                break;
        }
    }

    // --- UPLOAD ---
    async function processarArquivosComAnalise(arquivos) {
        if (feedbackAnalise) {
            feedbackAnalise.style.display = 'flex';
            feedbackAnalise.style.opacity = '1';
        }

        for (const arquivo of arquivos) {
            if (textoFeedbackAnalise) textoFeedbackAnalise.innerText = `Analisando espectro vocal: ${arquivo.name}...`;

            const partes = arquivo.name.split(' - ');
            let artista = partes.length > 1 ? partes[0].trim() : 'Desconhecido';
            let album = partes.length > 2 ? partes[1].trim() : 'Sem Álbum';
            let titulo = partes.length > 1 ? partes[partes.length - 1].replace(/\.[^/.]+$/, "").trim() : arquivo.name.replace(/\.[^/.]+$/, "");

            const musica = await catalogo.adicionar({ artista, album, titulo }, arquivo);

            if (artista === 'Desconhecido' && musica.assinatura) {
                // Tenta identificar automaticamente primeiro
                const match = catalogo.identificarPossivelAutor(musica.assinatura);
                if (match) {
                    abrirModalAnalise(musica, match);
                }
            }
        }

        if (feedbackAnalise) feedbackAnalise.style.display = 'none';
        atualizarInterface();
    }

    // --- MODAL & ANÁLISE MANUAL/AUTO ---
    const modalAnalise = document.getElementById('modalAnaliseVocal');
    const conteudoAnalise = document.getElementById('conteudoAnaliseResultado');
    const acoesAnalise = document.getElementById('acoesAnalise');

    async function analisarTimbreManual(musica) {
        if (feedbackAnalise) feedbackAnalise.style.display = 'flex';
        textoFeedbackAnalise.innerText = 'Comparando assinaturas biométricas...';

        // Simula delay para percepção de análise complexa
        await new Promise(r => setTimeout(r, 800));

        const match = catalogo.identificarPossivelAutor(musica.assinatura);
        if (feedbackAnalise) feedbackAnalise.style.display = 'none';

        abrirModalAnalise(musica, match);
    }

    function abrirModalAnalise(musica, match) {
        if (!modalAnalise) return;

        if (match) {
            conteudoAnalise.innerHTML = `
                <p>Identificamos com <strong>alta precisão</strong> que a voz nesta música pertence a:</p>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--destaque); margin: 10px 0;">${match}</div>
                <p>Deseja mover a música para a discografia deste artista?</p>
            `;
            acoesAnalise.innerHTML = `
                <button class="botao-acao" id="btnConfirmarMatch">Confirmar e Organizar</button>
                <button class="botao-acao" style="background: transparent; border: 1px solid var(--texto-secundario);" onclick="document.getElementById('modalAnaliseVocal').style.display='none'">Ignorar</button>
            `;
            document.getElementById('btnConfirmarMatch').onclick = async () => {
                await catalogo.confirmarIdentificacao(musica.id, match);
                modalAnalise.style.display = 'none';
                adicionarMensagemChat('ia', `Organizado: "${musica.titulo}" agora está na pasta de ${match}.`);
                atualizarInterface();
            };
        } else {
            conteudoAnalise.innerHTML = `
                <p>Analisamos o espectro vocal, mas <strong>não encontramos correspondência exata</strong> com os perfis cadastrados no Banco de Voz.</p>
                <p style="font-size: 0.9rem; margin-top: 10px; color: var(--texto-secundario);">A assinatura desta música foi salva e ajudará a identificar este artista no futuro assim que você o nomear manualmente.</p>
            `;
            acoesAnalise.innerHTML = `<button class="botao-acao" onclick="document.getElementById('modalAnaliseVocal').style.display='none'">Entendido</button>`;
        }

        modalAnalise.style.display = 'block';
    }

    if (inputPasta) {
        inputPasta.onchange = (e) => {
            processarArquivosComAnalise(Array.from(e.target.files).filter(f => f.type.startsWith('audio/')));
            inputPasta.value = '';
        };
    }

    const formularioMusica = document.getElementById('formularioMusica');
    const modalMusica = document.getElementById('modalMusica');
    if (formularioMusica) {
        formularioMusica.onsubmit = async (e) => {
            e.preventDefault();
            const inputAudio = document.getElementById('inputAudio');
            if (inputAudio.files[0]) {
                modalMusica.style.display = 'none';
                await processarArquivosComAnalise([inputAudio.files[0]]);
                formularioMusica.reset();
            }
        };
    }

    // --- RENDERIZAÇÃO ---
    function renderizarGrade(musicas) {
        gradeCatalogo.innerHTML = '';
        if (musicas.length === 0) {
            gradeCatalogo.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--texto-secundario); padding: 3rem;">Vazio.</p>';
            return;
        }
        musicas.forEach((m, index) => {
            const card = document.createElement('div');
            card.className = 'cartao-musica';
            card.innerHTML = `
                <img src="${m.capa}" class="imagem-cartao" onerror="this.src='assets/img/hero.png'">
                <div class="titulo-cartao">${m.titulo}</div>
                <div class="artista-cartao">${m.artista}</div>
                <div style="font-size: 0.7rem; color: var(--primaria); opacity: 0.8; margin-top: 4px;">${m.album}</div>
                ${m.artista === 'Desconhecido' ? `<button class="btn-analisar" style="margin-top:10px; font-size:0.75rem; background: var(--primaria); border:none; color:white; padding:6px 10px; border-radius:15px; cursor:pointer; width:100%; transition:0.2s;">🔍 Analisar Voz</button>` : ''}
            `;

            card.onclick = (e) => {
                if (e.target.classList.contains('btn-analisar')) {
                    analisarTimbreManual(m);
                    return;
                }
                playlistAtual = musicas;
                tocarMusica(m, index);
            };
            gradeCatalogo.appendChild(card);
        });
    }

    function renderizarPastas() {
        gradeCatalogo.innerHTML = '';
        btnVoltarNivel.style.display = 'none';
        const artistas = catalogo.getArtistas();
        artistas.forEach(artista => {
            const card = document.createElement('div');
            card.className = 'cartao-musica';
            card.innerHTML = `
                <i class="fas fa-user-circle" style="font-size: 3rem; color: var(--primaria); display: block; margin: 10px auto;"></i>
                <div class="titulo-cartao">${artista}</div>
                <div style="font-size: 0.8rem; color: var(--texto-secundario); margin-top: 5px;">${catalogo.getPorArtista(artista).length} faixas</div>
            `;
            card.onclick = () => renderizarAlbuns(artista);
            gradeCatalogo.appendChild(card);
        });
    }

    function renderizarAlbuns(artista) {
        artistaSelecionado = artista;
        btnVoltarNivel.style.display = 'block';
        document.getElementById('tituloSecao').innerText = `Discografia: ${artista}`;
        document.getElementById('controlesPasta').style.display = 'block';
        gradeCatalogo.innerHTML = '';
        const albuns = catalogo.getAlbunsPorArtista(artista);
        albuns.forEach(album => {
            const card = document.createElement('div');
            card.className = 'cartao-musica';
            card.innerHTML = `
                <i class="fas fa-compact-disc" style="font-size: 3rem; color: var(--destaque); display: block; margin: 10px auto;"></i>
                <div class="titulo-cartao">${album}</div>
                <div style="font-size: 0.8rem; color: var(--texto-secundario); margin-top: 5px;">${catalogo.getMusicasPorAlbum(artista, album).length} faixas</div>
            `;
            card.onclick = () => {
                albumSelecionado = album;
                document.getElementById('tituloSecao').innerText = `${artista} > ${album}`;
                renderizarGrade(catalogo.getMusicasPorAlbum(artista, album));
            };
            gradeCatalogo.appendChild(card);
        });
    }

    function renderizarBancoVoz() {
        gradeCatalogo.innerHTML = '';
        const artistas = Object.keys(catalogo.perfisVocais).sort();
        if (artistas.length === 0) {
            gradeCatalogo.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--texto-secundario);">Nenhum perfil vocal treinado ainda.</p>';
            return;
        }

        artistas.forEach(artista => {
            const card = document.createElement('div');
            card.className = 'cartao-musica';
            card.style.cursor = 'default';
            card.innerHTML = `
                <div style="position: relative; width: 60px; height: 60px; margin: 0 auto 10px; background: rgba(99, 102, 241, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-fingerprint" style="font-size: 1.5rem; color: var(--destaque);"></i>
                    <div style="position: absolute; bottom: 0; right: 0; width: 15px; height: 15px; background: #10b981; border: 2px solid var(--fundo-card); border-radius: 50%;" title="Perfil Ativo"></div>
                </div>
                <div class="titulo-cartao" style="font-size: 1.1rem;">${artista}</div>
                <div style="font-size: 0.8rem; color: var(--texto-secundario); margin-top: 8px;">
                    ${catalogo.perfisVocais[artista].length} amostras biométricas
                </div>
                <div style="margin-top: 10px; height: 30px; display: flex; align-items: flex-end; justify-content: center; gap: 2px; opacity: 0.5;">
                    <!-- Visualização fake de espectro -->
                    <div style="width: 3px; height: 40%; background: var(--primaria);"></div>
                    <div style="width: 3px; height: 70%; background: var(--primaria);"></div>
                    <div style="width: 3px; height: 100%; background: var(--primaria);"></div>
                    <div style="width: 3px; height: 60%; background: var(--primaria);"></div>
                    <div style="width: 3px; height: 80%; background: var(--primaria);"></div>
                    <div style="width: 3px; height: 50%; background: var(--primaria);"></div>
                </div>
            `;
            gradeCatalogo.appendChild(card);
        });
    }

    // --- PLAYER LÓGICA ---
    function tocarMusica(m, index) {
        if (!m || !m.arquivo) return;
        indiceAtual = index;
        somAtual.pause();
        somAtual.src = URL.createObjectURL(m.arquivo);
        somAtual.play().catch(e => console.error(e));
        playerTitulo.innerText = m.titulo;
        playerArtista.innerText = m.artista;
        playerCapa.src = m.capa;
        btnPlay.className = 'fas fa-pause';
    }

    btnPlay.onclick = () => {
        if (somAtual.paused) { somAtual.play(); btnPlay.className = 'fas fa-pause'; }
        else { somAtual.pause(); btnPlay.className = 'fas fa-play'; }
    };
    btnAvancar.onclick = () => {
        if (playlistAtual.length > 0) {
            indiceAtual = (indiceAtual + 1) % playlistAtual.length;
            tocarMusica(playlistAtual[indiceAtual], indiceAtual);
        }
    };
    btnVoltar.onclick = () => {
        if (playlistAtual.length > 0) {
            indiceAtual = (indiceAtual - 1 + playlistAtual.length) % playlistAtual.length;
            tocarMusica(playlistAtual[indiceAtual], indiceAtual);
        }
    };
    somAtual.onended = () => btnAvancar.onclick();
    somAtual.ontimeupdate = () => {
        if (somAtual.duration) progressoAtual.style.width = (somAtual.currentTime / somAtual.duration) * 100 + '%';
    };

    // Export & Outros
    document.getElementById('btnExportarTudo').onclick = async () => {
        // Exportar todo o catálogo como ZIP contendo pastas por artista
        const artistas = catalogo.getArtistas();
        for (const artista of artistas) {
            await catalogo.exportarPastaZIP(artista);
        }
    };

    document.getElementById('btnAdicionarMusica').onclick = () => modalMusica.style.display = 'block';
    document.getElementById('btnFecharModal').onclick = () => modalMusica.style.display = 'none';

    async function enviar() {
        const val = document.getElementById('inputChat').value.trim();
        if (!val) return;
        adicionarMensagemChat('usuario', val);
        document.getElementById('inputChat').value = '';
        const res = await assistente.processarMensagem(val);
        adicionarMensagemChat('ia', res);
    }
    function adicionarMensagemChat(autor, texto) {
        const div = document.createElement('div');
        div.className = `mensagem ${autor}`;
        div.innerText = texto;
        document.getElementById('mensagensChat').appendChild(div);
        document.getElementById('mensagensChat').scrollTop = document.getElementById('mensagensChat').scrollHeight;
    }
    document.getElementById('btnEnviarChat').onclick = enviar;
    document.getElementById('inputChat').onkeypress = (e) => { if (e.key === 'Enter') enviar(); };
    document.getElementById('btnFecharChat').onclick = () => { document.getElementById('janelaChat').style.display = 'none'; document.getElementById('btnAbrirChat').style.display = 'flex'; };
    document.getElementById('btnAbrirChat').onclick = () => { document.getElementById('janelaChat').style.display = 'flex'; document.getElementById('btnAbrirChat').style.display = 'none'; };

    atualizarInterface();
});
