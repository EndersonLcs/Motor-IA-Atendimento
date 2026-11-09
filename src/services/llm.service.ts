import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Definição das ferramentas que a IA pode usar
const ferramentasDeclarations: FunctionDeclaration[] = [
  {
    name: "adicionar_tag",
    description: "Marca o lead (ex.: qualificado, desqualificado, cliente-antigo)",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { tag: { type: SchemaType.STRING } },
      required: ["tag"],
    },
  },
  {
    name: "mover_estagio",
    description: "Move no funil (ex.: Qualificacao -> Qualificado -> Agendado)",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { estagio: { type: SchemaType.STRING } },
      required: ["estagio"],
    },
  },
  {
    name: "atualizar_ficha",
    description: "Grava um dado do lead. Nunca invente dados, apenas grave o que o lead disse explicitamente.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { campo: { type: SchemaType.STRING }, valor: { type: SchemaType.STRING } },
      required: ["campo", "valor"],
    },
  },
  {
    name: "notificar_equipe",
    description: "Avisa a equipe de vendas com um resumo do lead",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { resumo: { type: SchemaType.STRING } },
      required: ["resumo"],
    },
  },
  {
    name: "transferir_humano",
    description: "Para a IA e passa para atendente humano",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { motivo: { type: SchemaType.STRING } },
      required: ["motivo"],
    },
  },
  {
    name: "consultar_agenda",
    description: "Retorna horários livres",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "marcar_agenda",
    description: "Agenda visita/reunião",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { horario: { type: SchemaType.STRING } },
      required: ["horario"],
    },
  }
];

export class LLMAdapter {
  private model;

  constructor() {
    this.model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      tools: [{ functionDeclarations: ferramentasDeclarations }],
    });
  }

  async processarMensagem(promptSistema: string, historico: any[], novaMensagem: string) {
    const chat = this.model.startChat({
      history: historico,
      systemInstruction: {
        role: "system",
        parts: [{ text: promptSistema }]
      },
    });

    const start = Date.now();
    const result = await chat.sendMessage(novaMensagem);
    const latencia = Date.now() - start;

    const functionCalls = result.response.functionCalls();
    const texto = result.response.text();

    return {
      texto,
      functionCalls: functionCalls || [],
      metricas: {
        tokens_in: result.response.usageMetadata?.promptTokenCount || 0,
        tokens_out: result.response.usageMetadata?.candidatesTokenCount || 0,
        latencia
      }
    };
  }
}
