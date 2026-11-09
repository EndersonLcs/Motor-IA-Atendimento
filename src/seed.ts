import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Tenant 1: Sol Nascente (Baseado no Anexo A)
  const configSolNascente = {
    tenant_id: "sol-nascente",
    nome_empresa: "Sol Nascente Energia Solar",
    tom: "informal",
    pode_dizer_que_e_ia: true,
    nome_assistente: "Luz",
    horario_atendimento_ia: "24h",
    telefone_notificacao: "5581988887777",
    cidades_atendidas: ["Recife", "Olinda", "Jaboatão dos Guararapes", "Caruaru"],
    estagios: ["Novo", "Qualificacao", "Qualificado", "Desqualificado", "Agendado", "Humano"],
    regras_gerais: [
      "Nunca prometer valor exato de economia; dizer que depende da visita técnica.",
      "Nunca informar preço final; dizer que o consultor apresenta o orçamento.",
      "Não pedir nem repetir senhas ou dados bancários.",
      "Se o lead disser que já é cliente, marcar 'cliente-antigo' e transferir para humano."
    ]
  };

  // Tenant 2: Solar Prime (configurações diferentes)
  const configSolarPrime = {
    tenant_id: "solar-prime",
    nome_empresa: "Solar Prime Solutions",
    tom: "formal",
    pode_dizer_que_e_ia: false,
    nome_assistente: "Roberto",
    horario_atendimento_ia: "24h",
    telefone_notificacao: "5511999998888",
    cidades_atendidas: ["São Paulo", "Campinas", "Santos", "Sorocaba"],
    estagios: ["Novo", "Qualificacao", "Qualificado", "Desqualificado", "Agendado", "Humano"],
    regras_gerais: [
      "Sempre trate o cliente por Senhor ou Senhora.",
      "Nunca prometer valor exato de economia; dizer que depende da visita técnica.",
      "Nunca informar preço final; dizer que o consultor apresenta o orçamento.",
      "Não pedir nem repetir senhas ou dados bancários.",
      "Se o lead disser que já é cliente, marcar 'cliente-antigo' e transferir para humano."
    ]
  };

  console.log("Limpando banco de dados...");
  await prisma.audit.deleteMany();
  await prisma.message.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.tenant.deleteMany();

  console.log("Inserindo tenants...");
  await prisma.tenant.create({
    data: {
      id: configSolNascente.tenant_id,
      config_json: JSON.stringify(configSolNascente)
    }
  });

  await prisma.tenant.create({
    data: {
      id: configSolarPrime.tenant_id,
      config_json: JSON.stringify(configSolarPrime)
    }
  });

  console.log("Tenants criados com sucesso!");
}

main()
  .catch(e => {
    console.error("Erro ao popular o banco:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  