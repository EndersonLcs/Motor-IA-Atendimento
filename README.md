# Motor de IA de Atendimento - PixPro Capstone

Versão mínima (MVP) de um motor de IA multi-tenant para qualificação de leads via WhatsApp. Construído com Node.js, TypeScript, Express, Prisma (SQLite) e Google Gemini.

## 1. Como rodar

**Via Docker (Recomendado):**
Certifique-se de ter o Docker instalado e de configurar sua chave de API no arquivo `.env` na raiz:
`GEMINI_API_KEY="chave_da_API"`

### Execute o comando:
```bash
docker build -t motor-ia . && docker run -p 3000:3000 --env-file .env motor-ia
```

### Para Desenvolvimento Local:
```Bash
npm install
npx tsx src/seed.ts     # Cria o banco dev.db e insere os tenants do Anexo A
npm run dev             # Inicia o servidor na porta 3000
```
## 2. Arquitetura
**Webhook HTTP:** Ponto de entrada das mensagens. Implementa checagem de idempotência consultando a tabela Message antes do processamento.

**Debounce de Rajada (Memória):** Utiliza um Map do Node.js com setTimeout (8 segundos). Novas mensagens resetam o timer e acumulam no buffer antes de despachar um único payload para o LLM.

**Modo Simulação:** O webhook aceita a flag "simulacao": true no payload, impedindo disparos reais na ação notificar_equipe (apenas registrando no log).

**LLM Adapter:** Camada de abstração do modelo (gemini-flash-latest), isolando a regra de negócio do provedor. A IA opera via Tool Calling rigoroso.

**Persistência (Prisma + SQLite):** Modelagem com Tenant (configurações JSON), Lead (ficha/memória), Message (histórico) e Audit (métricas de tokens e latência).
## 3. Decisões Técnicas
**Prevenção de Alucinação:** O System Prompt proíbe a invenção de dados. O estado do lead (ficha_json) só é alterado através da tool atualizar_ficha.

**Obrigatoriedade de Resposta:** Para evitar que a IA encerre em silêncio ao chamar as tools, foi inserida uma instrução crítica forçando o retorno de texto combinado com a execução das tags.

**Solução de Rajada:** A escolha pelo setTimeout na memória simplifica o MVP sem a necessidade de introduzir um message broker nesta etapa, atendendo à volumetria inicial da avaliação de forma assíncrona.

## 4. Testes Automatizados (Jest)
A aplicação possui uma suíte de testes automatizados com o LLM mockado, validando a lógica de negócio sem consumir a API externa.

**Como rodar:**
```bash
npm run test
```

**Cobertura:** Idempotência, Intervenção Humana (assumir/religar), Prevenção de Alucinação (Tool Calling isolado) e Controle de Rajada (Debounce assíncrono).

## 5. Script de Avaliação
O script automatizado roda as conversas do Anexo C. Ele utiliza uma abordagem de Polling, consultando o SQLite a cada 2 segundos para validar as asserções sem sofrer com Race Conditions do tempo de resposta da API do Google.

**Execute com:**
```bash
npx tsx src/avaliador.ts
```

## 6. Custos e Otimização
O uso do modelo da família "Flash" (Google Gemini) foca em baixa latência e baixo custo.

**Estimativa:** Cada turno de conversa consome em média ~800 tokens de entrada e ~100 de saída. O custo por milhão de tokens gira em torno de $0.075 (in) e $0.30 (out). O custo por conversa é de frações de centavo.

**Otimização Futura:** Implementar cache local (Redis) para o System Prompt e configurações do tenant reduziria o payload de entrada, barateando ainda mais o processamento.

## 7. Limitações Conhecidas
O buffer de rajada depende da memória RAM da instância. Em um ambiente com múltiplos pods (escala horizontal), mensagens do mesmo lead poderiam ser roteadas para instâncias diferentes, quebrando o agrupamento se não houvesse Sticky Sessions.

As ações consultar_agenda e marcar_agenda são mockadas no banco sem integração com calendários reais.
## 8. Escalando para 100 Empresas
### Para um cenário de produção em alta escala, a arquitetura sofreria as seguintes evoluções:
**Fila de Mensageria:** Substituição do buffer em memória por AWS SQS ou RabbitMQ com chaves de partição baseadas no telefone, garantindo ordem e resiliência.

**Banco de Dados:** Migração do SQLite para PostgreSQL gerenciado (ex: AWS RDS).

**Cache de Idempotência:** Utilização de Redis (TTL de 24h) para validação instantânea de message_id, desonerando o banco relacional de leituras constantes.
