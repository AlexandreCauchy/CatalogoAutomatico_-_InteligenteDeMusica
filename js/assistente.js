class AssistenteVirtual {
    constructor() {
        this.regras = [
            { padrao: /oi|olá/i, resposta: "Olá! Como posso ajudar você hoje com sua música?" },
            { padrao: /quem é você/i, resposta: "Eu sou o SonicAssist, seu ajudante pessoal de música." }
        ];
    }

    async processarMensagem(texto) {
        let resposta = "Ainda estou aprendendo a responder isso, mas posso ajudar a organizar suas músicas!";
        for (const regra of this.regras) {
            if (regra.padrao.test(texto)) {
                resposta = regra.resposta;
                break;
            }
        }
        return new Promise(resolve => setTimeout(() => resolve(resposta), 500));
    }
}

const assistente = new AssistenteVirtual();
