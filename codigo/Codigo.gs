const CONFIG = {
  ABA: 'Resumo_IA',
  MODELOS: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
  DESTINATARIOS: ['exemplo@gmail.com', 'exemplo2@gmail.com'],
  ASSUNTO: 'Resumo semanal do comercial',
  FECHO: 'Atenciosamente,\nAssistente de Gestão Comercial (relatório automático)',
  DIA: ScriptApp.WeekDay.FRIDAY,
  HORA: 8
};

function enviarResumoSemanal() {
  const chave = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!chave) throw new Error('De GEMINI_API_KEY nas propriedades do script.');

  const dados = lerResumo_();
  const texto = chamarGemini_(montarPrompt_(dados), chave);
    GmailApp.sendEmail(
    CONFIG.DESTINATARIOS.join(','),
    CONFIG.ASSUNTO,
    texto.trim() + '\n\n' + CONFIG.FECHO
  );
}
function lerResumo_() {
  const aba = SpreadsheetApp.getActive().getSheetByName(CONFIG.ABA);
  if (!aba) throw new Error('Aba não encontrada: ' + CONFIG.ABA);
  return aba.getDataRange().getDisplayValues()
    .slice(1)
    .filter(l => l[0] !== '')
    .map(l => l[0] + ': ' + l[1] + (l[2] ? ' (' + l[2] + ')' : ''))
    .join('\n');
}

function montarPrompt_(dados) {
  return `PAPEL
Você é o assistente de gestão comercial de uma pequena empresa.
Toda sexta-feira de manhã, você prepara para o diretor um e-mail
curto com o andamento dos atendimentos da equipe comercial na semana.

DADOS (use somente estes dados)
Abaixo está o conteúdo da planilha de resumo do funil de vendas.
Cada linha tem: Indicador, Valor e Observação.

${dados}

REGRAS
1. Nunca invente números, nomes ou fatos. Se um dado não estiver
   na planilha, diga que não está disponível.
2. Não cite nomes ou dados pessoais de clientes.
3. Não repita todos os números: destaque o que importa para uma
   decisão do diretor.
4. Tom: profissional, direto e cordial, sem jargão.
5. Máximo de 200 palavras, em português do Brasil, em texto simples
   (sem tabelas e sem símbolos de formatação como # ou **).
6. Se algum indicador estiver vazio ou indisponível, simplesmente
   não o mencione. Nunca cite erros, falhas ou problemas técnicos.

ESTRUTURA
1. Saudação ao diretor (1 frase).
2. Resumo da semana: 2 ou 3 frases com os números principais
   (total de leads, novos, em andamento, matrículas, taxa).
3. Ponto de atenção: o principal risco (ex.: follow-ups atrasados,
   perdas por motivo, origem de leads com baixa conversão).
4. Destaque positivo: 1 frase sobre o que está funcionando.
5. Ações sugeridas para a próxima semana: 2 ou 3 itens práticos.
   As ações devem ser específicas e ter um número ou um alvo, por
   exemplo "Retomar contato com os N follow-ups atrasados até
   quarta-feira".
6. Não escreva despedida, assinatura nem frases como "fico à
   disposição". Termine o texto na última ação sugerida.`;
}

function chamarGemini_(prompt, chave) {
  const TENTATIVAS_POR_MODELO = 3;
  const ERROS_TEMPORARIOS = [429, 500, 503, 504];
  let ultimoErro = '';

  for (const modelo of CONFIG.MODELOS) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
      + modelo + ':generateContent';

    for (let i = 1; i <= TENTATIVAS_POR_MODELO; i++) {
      const resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': chave },
        payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        muteHttpExceptions: true
      });
      const codigo = resp.getResponseCode();

      if (codigo === 200) {
        const json = JSON.parse(resp.getContentText());
        const texto = json.candidates && json.candidates[0] && json.candidates[0].content
          && json.candidates[0].content.parts[0].text;
        if (texto) return texto;
        ultimoErro = modelo + ': resposta vazia';
      } else if (codigo === 404) {
        ultimoErro = modelo + ': modelo não encontrado (404)';
        break; 
      } else if (ERROS_TEMPORARIOS.indexOf(codigo) === -1) {
        
        throw new Error('Erro do Gemini (' + codigo + '): ' + resp.getContentText());
      } else {
        ultimoErro = modelo + ': erro temporário ' + codigo;
      }
      Utilities.sleep(i * 5000); 
    }
  }
  throw new Error('Gemini indisponível após várias tentativas. Último erro: ' + ultimoErro);
}
function criarGatilhoSemanal() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarResumoSemanal')
    .timeBased().onWeekDay(CONFIG.DIA).atHour(CONFIG.HORA).create();
}