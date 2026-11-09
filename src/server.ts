import express from 'express';
import { PrismaClient } from '@prisma/client';
import { receberMensagem } from './controllers/webhook.controller';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
app.use(express.json());

// Rota de Webhook
app.post('/webhook/mensagem', receberMensagem);

// Consulta de Conversas
app.get('/conversas/:tenant_id/:telefone', async (req, res) => {
  const { tenant_id, telefone } = req.params;
  const lead = await prisma.lead.findUnique({
    where: { telefone_tenant_id: { telefone, tenant_id } },
    include: { mensagens: { orderBy: { timestamp: 'asc' } } }
  });
  
  if (!lead) {
    res.status(404).json({ erro: "Lead não encontrado" });
    return;
  }
  res.json(lead.mensagens);
});

// Intervenção Humana
app.post('/intervencao', async (req, res) => {
  const { tenant_id, telefone, acao } = req.body;
  const lead = await prisma.lead.findUnique({ where: { telefone_tenant_id: { telefone, tenant_id } } });
  
  if (!lead) {
    res.status(404).json({ erro: "Lead não encontrado" });
    return;
  }

  if (acao === "assumir") {
    await prisma.lead.update({ where: { id: lead.id }, data: { intervencao: true } });
  } else if (acao === "religar") {
    await prisma.lead.update({ where: { id: lead.id }, data: { intervencao: false } });
  }
  res.json({ status: "sucesso", acao });
});

// Métricas e Observabilidade
app.get('/metricas/:tenant_id', async (req, res) => {
  const { tenant_id } = req.params;
  
  const leads = await prisma.lead.findMany({ where: { tenant_id } });
  const auditorias = await prisma.audit.findMany({ where: { tenant_id } });

  const totalConversas = leads.length;
  const qualificados = leads.filter(l => l.tags?.includes('qualificado')).length;
  const transferidos = leads.filter(l => l.intervencao).length;

  res.json({
    total_conversas: totalConversas,
    percentual_qualificados: totalConversas ? (qualificados / totalConversas) * 100 : 0,
    percentual_transferidos: totalConversas ? (transferidos / totalConversas) * 100 : 0,
    auditorias_total: auditorias.length
  });
});

export { app };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Motor de IA rodando na porta ${PORT}`);
});
}
