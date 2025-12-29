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
        }
    }

    // --- UPLOAD ---
    async function processarArquivosComAnalise(arquivos) {
        if (feedbackAnalise) feedbackAnalise.style.display = 'flex';
        for (const arquivo of arquivos) {
            if (textoFeedbackAnalise) textoFeedbackAnalise.innerText = `Processando: ${arquivo.name}...`;

            const partes = arquivo.name.split(' - ');
            let artista = partes.length > 1 ? partes[0].trim() : 'Desconhecido';
            let album = partes.length > 2 ? partes[1].trim() : 'Sem Álbum';
            let titulo = partes.length > 1 ? partes[partes.length - 1].replace(/\.[^/.]+$/, "").trim() : arquivo.name.replace(/\.[^/.]+$/, "");

            const musica = await catalogo.adicionar({ artista, album, titulo }, arquivo);

            if (artista === 'Desconhecido' && musica.assinatura) {
                analisarTimbreManual(musica);
            }
        }
        if (feedbackAnalise) feedbackAnalise.style.display = 'none';
        atualizarInterface();
    }

    async function analisarTimbreManual(musica) {
        const match = catalogo.identificarPossivelAutor(musica.assinatura);
        if (match) {
            if (confirm(`A voz de "${match}" foi identificada na música "${musica.titulo}".\n\nDeseja organizar agora?`)) {
                await catalogo.confirmarIdentificacao(musica.id, match);
                adicionarMensagemChat('ia', `Música "${musica.titulo}" movida para ${match}.`);
                atualizarInterface();
            }
        } else if (abaAtual === 'desconhecidas') {
            alert(`Não foi possível identificar um autor conhecido para "${musica.titulo}".`);
        }
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
                ${m.artista === 'Desconhecido' ? `<button class="btn-analisar" style="margin-top:10px; font-size:0.7rem; background: var(--primaria); border:none; color:white; padding:5px; border-radius:4px; cursor:pointer; width:100%;">Analisar Voz</button>` : ''}
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
            `;
            card.onclick = () => {
                albumSelecionado = album;
                document.getElementById('tituloSecao').innerText = `${artista} > ${album}`;
                renderizarGrade(catalogo.getMusicasPorAlbum(artista, album));
            };
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
    document.getElementById('btnExportarPasta').onclick = () => {
        if (artistaSelecionado) catalogo.exportarPastaZIP(artistaSelecionado, albumSelecionado);
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
