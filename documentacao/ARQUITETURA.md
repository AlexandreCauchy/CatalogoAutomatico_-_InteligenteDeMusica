# Arquitetura Técnica - Análise de Timbre

Este documento descreve como o sistema de análise vocal foi implementado "na raça".

## Web Audio API
Utilizamos o `AudioContext` para processar arquivos de áudio binários.
1. **Decodificação**: O arquivo é decodificado em um `AudioBuffer`.
2. **FFT (Fast Fourier Transform)**: Analisamos as frequências do áudio.
3. **Assinatura Sonora**: Extraímos a média de energia em faixas específicas de frequência que definem o timbre vocal.

## Comparação de Autoria
A comparação é feita através do cálculo da **Distância Euclidiana** entre vetores de frequência:
- Se a distância for < 15%, o sistema identifica como o mesmo autor.

## Persistência
As assinaturas são salvas no `localStorage` junto com os dados do autor.
