import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { LLMAdapter } from '../services/llm.service';

const prisma = new PrismaClient();
const llm = new LLMAdapter();

const bufferRajada = new Map<string, { mensagens: string[], timer: NodeJS.Timeout, simulacao: boolean }>();

export const receberMensagem = async (req: Request, res: Response) => {
  const { message_id, tenant_id, telefone, texto, timestamp, simulacao = false } = req.body;

  // 1. Idempotência: Ignora se a mensagem já foi processada
  const msgExiste = await prisma.message.findUnique({ where: { message_id } });
  if (msgExiste) {
    res.status(200).json({ status: "ignorado", motivo: "idempotencia" });
    return;
  }

  // 2. Busca ou Cria o Lead
  let lead = await prisma.lead.findUnique({ where: { telefone_tenant_id: { telefone, tenant_id } } });
  if (!lead) {
    lead = await prisma.lead.create({ data: { telefone, tenant_id } });
  }

  // Se estiver com humano, salva a mensagem e não chama a IA
  if (lead.intervencao) {
    await prisma.message.create({ data: { message_id, lead_id: lead.id, texto, autor: "lead" } });
    res.status(200).send("Enviado ao humano");
    return;
  }

  // Salva a mensagem no banco
  await prisma.message.create({ data: { message_id, lead_id: lead.id, texto, autor: "lead" } });

  // 3. Controle de Rajada
  const chaveBuffer = `${tenant_id}:${telefone}`;
  
  if (bufferRajada.has(chaveBuffer)) {
    const atual = bufferRajada.get(chaveBuffer)!;
    clearTimeout(atual.timer);
    atual.mensagens.push(texto);
    atual.simulacao = simulacao; // Atualiza com a flag mais recente
    atual.timer = setTimeout(() => processarFilaIA(chaveBuffer, lead!.id), 8000);
  } else {
    bufferRajada.set(chaveBuffer, {
      mensagens: [texto],
      simulacao,
      timer: setTimeout(() => processarFilaIA(chaveBuffer, lead!.id), 8000)
    });
  }

  res.status(200).json({ status: "enfileirado" });
};

async function processarFilaIA(chave: string, leadId: number) {
  const buffer = bufferRajada.get(chave);
  if (!buffer) return;
  bufferRajada.delete(chave);

  const simulacao = buffer.simulacao;
  
  const textoCombinado = buffer.mensagens.join(" | ");
  console.log(`\n[⏱️] 8 segundos passaram. Processando mensagens para ${chave}...`);
  console.log(`[🗣️] Texto recebido: "${textoCombinado}"`);

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { tenant: true, mensagens: true } });
  if (!lead || !lead.tenant) return;

  const config = JSON.parse(lead.tenant.config_json);
  const ficha = JSON.parse(lead.ficha_json);

  const promptSistema = `
    Você é ${config.nome_assistente}, assistente virtual da ${config.nome_empresa}.
    Tom de voz: ${config.tom}. 
    Regras gerais: ${config.regras_gerais?.join(" ") || ""}.
    
    O que já sabemos do lead: ${JSON.stringify(ficha)}.
    
    OBJETIVO DE QUALIFICAÇÃO (Energia Solar Residencial):
    Você precisa descobrir as seguintes informações, fazendo uma pergunta de cada vez de forma natural:
    1. Qual o nome e a cidade?
    2. O imóvel é próprio ou alugado?
    3. É casa ou apartamento?
    4. Qual o valor médio da conta de luz por mês?
    5. Tem interesse em financiar ou pagar à vista?

    REGRAS DE DECISÃO:
    - Qualificado: imóvel próprio, casa, conta de luz acima de R$ 250, em cidade atendida. Mover para "Qualificado".
    - Desqualificado: imóvel alugado ou apartamento (oferecer assinatura sem instalação), ou conta de luz menor que R$ 250, ou fora da cidade atendida. Mover para "Desqualificado".
    
    INSTRUÇÕES CRÍTICAS:
    1. NUNCA invente dados. Use a ferramenta 'atualizar_ficha' APENAS quando o lead responder.
    2. Toda vez que você responder, ALÉM DE USAR FERRAMENTAS (Tools), VOCÊ DEVE OBRIGATORIAMENTE RETORNAR UM TEXTO DE RESPOSTA PARA O LEAD. Nunca deixe a resposta textual vazia.
    3. Faça no máximo uma ou duas perguntas por vez.
  `;

  const historico = lead.mensagens.slice(0, -buffer.mensagens.length).map(m => ({
    role: m.autor === 'ia' ? 'model' : 'user',
    parts: [{ text: m.texto }]
  }));

  try {
    console.log(`[🧠] Enviando para o LLM... Aguardando resposta...`);
    const resposta = await llm.processarMensagem(promptSistema, historico, textoCombinado);

    console.log(`[✅] Resposta da IA recebida em ${resposta.metricas.latencia}ms!`);

    for (const call of resposta.functionCalls) {
      console.log(`[🛠️] IA executou ação: ${call.name}`, call.args);
      // Passa a flag simulacao para a função abaixo
      await executarAcaoIA(call.name, call.args, lead.id, lead.tenant_id, simulacao);
      
      await prisma.audit.create({
        data: {
          tenant_id: lead.tenant_id,
          acao: call.name,
          detalhes_json: JSON.stringify(call.args),
          tokens_in: resposta.metricas.tokens_in,
          tokens_out: resposta.metricas.tokens_out,
          latencia_ms: resposta.metricas.latencia
        }
      });
    }

    if (resposta.texto) {
      console.log(`[💬] Texto da IA: "${resposta.texto}"`);
      await prisma.message.create({
        data: { message_id: `ia-${Date.now()}-${Math.random()}`, lead_id: lead.id, texto: resposta.texto, autor: "ia" }
      });
    }
  } catch (error) {
    console.error("[❌] Erro no LLM:", error);
  }
}

async function executarAcaoIA(acao: string, args: any, leadId: number, tenantId: string, simulacao: boolean) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  switch(acao) {
    case 'adicionar_tag':
      const tagsAtuais = lead.tags ? lead.tags.split(',') : [];
      if (!tagsAtuais.includes(args.tag)) tagsAtuais.push(args.tag);
      await prisma.lead.update({ where: { id: leadId }, data: { tags: tagsAtuais.join(',') } });
      break;
    case 'mover_estagio':
      await prisma.lead.update({ where: { id: leadId }, data: { estagio: args.estagio } });
      break;
    case 'atualizar_ficha':
      const ficha = JSON.parse(lead.ficha_json);
      ficha[args.campo] = args.valor;
      await prisma.lead.update({ where: { id: leadId }, data: { ficha_json: JSON.stringify(ficha) } });
      break;
    case 'transferir_humano':
      await prisma.lead.update({ where: { id: leadId }, data: { intervencao: true } });
      break;
    case 'notificar_equipe':
      if (simulacao) {
        console.log(`[SIMULAÇÃO] Modo Simulação Ativo. A equipe SERIA notificada com: ${args.resumo}`);
      } else {
        console.log(`[PRODUÇÃO] Notificando equipe real via WhatsApp/Email com: ${args.resumo}`);
      }
      break;
  }
}
