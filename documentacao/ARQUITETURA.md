# Arquitetura do Sistema SonicHub

O SonicHub é uma aplicação web progressiva (PWA) focada na gestão inteligente de catálogos musicais locais, operando totalmente offline no navegador do cliente (Client-Side).

## 1. Visão Geral
O sistema permite que usuários carreguem pastas de música locais, organizem automaticamente por artista/álbum e utilizem Inteligência Artificial para identificar timbres vocais e sugerir correções de metadados.

## 2. Componentes Principais

### A. Front-end (UI/UX)
- Basedo em HTML5, CSS3 Moderno (Variáveis CSS, Flexbox, Grid) e JavaScript Puro (Vanilla JS).
- **Design System**: Tema escuro, responsivo, com foco em usabilidade (Modais, Chat, Sidebar).
- **Player de Áudio**: Elemento nativo `<audio>` controlado via JS com suporte a playlist, loop e navegação (Next/Prev).

### B. Camada de Dados (`bd.js`)
- **IndexedDB**: Banco de dados NoSQL transacional no navegador.
- Armazena objetos de música completos, incluindo o arquivo binário (Blob/File), metadados e assinaturas biométricas.
- Operações CRUD assíncronas encapsuladas em Promises.

### C. Núcleo de Inteligência (`catalogo.js`)
Este é o cérebro da aplicação, responsável por:

#### 1. Análise de Áudio (PCM Energy Scan)
Utilizamos a API `AudioContext` para decodificar o áudio e analisar os dados brutos PCM (Time Domain).
- **Algoritmo**: 
    1. Varre o arquivo em busca do ponto de maior energia (pico), geralmente o refrão ou parte densa.
    2. Extrai uma janela de ~10.000 amostras ao redor desse pico.
    3. Calcula um perfil de energia segmentado (10 bandas) que serve como "assiantura biométrica" do timbre/estilo.
- **Vantagem**: Extremamente rápido e robusto contra silêncios iniciais em gravações.

#### 2. Prevenção e Limpeza de Duplicatas
Implementamos uma lógica agressiva de fusão de dados ("Merge"):
- Identificamos unicidade pela chave composta: `Artista` (normalizado) + `Título` (normalizado).
- Se uma música é carregada novamente com informações parciais (ex: sem álbum), o sistema a ignora.
- Se a nova versão tem **mais** informações (ex: Álbum que faltava), a versão antiga é atualizada e a nova descartada.
- Resolve conflitos de "Desconhecido" vs "Artista Real".

#### 3. Banco de Voz (Voice Bank)
- Armazena vetores de assinatura de artistas conhecidos.
- Permite comparar uma música desconhecida com todos os perfis salvos usando Distância Euclidiana.

### D. Interface de Assistente (`assistente.js`)
- Simula um agente de chat inteligente que responde a comandos naturais do usuário.
- Integrado às funções do catálogo (tocar, buscar, listar).

## 3. Fluxo de Dados
1. **Upload**: Usuário seleciona pasta -> Arquivos são lidos.
2. **Processamento**: 
    - Metadados extraídos do nome do arquivo.
    - Áudio analisado para gerar Assinatura.
    - Verificação de Duplicatas (Merge se necessário).
3. **Persistência**: Dados salvos no IndexedDB.
4. **Renderização**: UI atualiza grades de álbuns/artistas.

## 4. Tecnologias
- **IndexedDB API**: Armazenamento persistente.
- **Web Audio API**: Processamento de sinal digital (DSP).
- **File API**: Leitura de sistema de arquivos local.
- **JSZip**: Exportação de pacotes de música.
