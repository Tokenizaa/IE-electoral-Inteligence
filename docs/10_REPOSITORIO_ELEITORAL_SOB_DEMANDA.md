# Caderno 10 — Repositório Eleitoral e Leitura sob Demanda

**Estado:** arquitetura-alvo documentada; primeira etapa de inventário local e reutilização de downloads implementada.  
**Escopo:** arquivos oficiais do TSE, armazenamento fora do Supabase e aquisição sem duplicação desnecessária.

## 1. Decisão arquitetural

Os arquivos brutos oficiais do TSE não devem ser copiados indiscriminadamente para tabelas do Supabase. Eles devem permanecer em um repositório de arquivos persistente, com manifesto de proveniência. A aplicação consulta o catálogo, adquire os recursos necessários, e a camada analítica lê ou transforma apenas o que a pergunta exige.

O fluxo desejado é:

```text
Catálogo oficial TSE
       |
       v
Planejador de aquisição por ano/recurso/granularidade
       |
       v
Repositório persistente de arquivos oficiais + manifestos
       |
       v
Leitor seletivo / extração controlada / staging analítico
       |
       v
Motor determinístico e validações
       |
       v
Projeções compactas e metadados no Supabase
```

O arquivo bruto é uma fonte imutável de reprodução; os dados tratados, os indicadores e as interpretações são camadas distintas.

## 2. Responsabilidade de cada componente

| Componente | Responsabilidade |
| --- | --- |
| Catálogo CKAN do TSE | Descobrir conjuntos e recursos publicados, sem assumir que todos os recursos sejam filtráveis no servidor. |
| Repositório de arquivos | Guardar os arquivos oficiais selecionados, separados por ano e com manifesto, hash, URL e metadados de origem. |
| Leitor e extrator | Ler CSV em fluxo e, após implementação de extração ZIP segura, acessar os arquivos internos sem carregar conjuntos inteiros na memória. |
| Staging / motor analítico | Normalizar dados e executar agregações e regras versionadas sobre universos explicitamente definidos. |
| Supabase | Autenticação, permissões, configuração, metadados resumidos, pesquisas salvas e resultados agregados necessários à interface. Não usar como depósito indiscriminado dos arquivos brutos. |

## 3. Política de aquisição

1. Consultar o catálogo para descobrir o recurso oficial apropriado.
2. Adquirir somente os conjuntos necessários para os casos de uso priorizados; não baixar automaticamente todos os anos, UFs e granularidades.
3. Reutilizar o arquivo retido quando o recurso, a URL e os metadados de publicação não tiverem mudado e o tamanho local continuar consistente com o manifesto.
4. Quando a publicação mudar, preservar o snapshot anterior e obter um novo artefato, com novo hash e manifesto.
5. Não considerar um arquivo validado para análise apenas porque o download e o hash foram concluídos.
6. Não inserir arquivos brutos no Git. O diretório local de downloads permanece ignorado pelo repositório.
7. Para produção, usar armazenamento persistente de objetos ou volume persistente. O diretório `var/tse-downloads` em um ambiente efêmero pode desaparecer em reinicializações ou redeploys.

## 4. Inventário local implementado

A camada de aquisição expõe:

- `GET /api/tse/catalog?year=2022`: consulta metadados oficiais.
- `POST /api/tse/download`: adquire um recurso escolhido pelo identificador CKAN; não aceita URL arbitrária do cliente.
- `GET /api/tse/downloads?year=2022`: lista os manifestos locais e informa se o arquivo existe e se o tamanho coincide com o registrado.
- `POST /api/tse/inspect`: inspeciona cargos em arquivos CSV já baixados.
- `POST /api/tse/validate-layout`: compara cabeçalhos com perfis existentes, que continuam não autorizando ingestão.

O inventário lê manifestos e metadados de tamanho; não varre o conteúdo de arquivos grandes nem recalcula o SHA-256 a cada listagem. Ao solicitar novamente um recurso, o cliente reutiliza o artefato quando URL e metadados de publicação coincidem e o tamanho confere. A reutilização não é prova de autenticidade externa; o SHA-256 armazenado identifica o conteúdo calculado no momento do download.

## 5. O que ainda não está implementado

- Extração segura de ZIP e inspeção dos CSVs internos.
- Parser CSV completo para campos com quebras de linha dentro de aspas.
- Leitura seletiva de linhas de CSV/ZIP a partir de filtros de análise.
- Staging analítico persistente e publicação versionada de agregados.
- Armazenamento de objetos persistente para ambientes hospedados.
- Reconciliação de totais e cobertura por ano, cargo, turno e território.

Até esses itens serem implementados e validados, não declarar a ingestão histórica completa nem usar a existência de um arquivo como prova de cobertura.

## 6. Critérios para avançar

Uma implementação futura de leitura sob demanda deve:

- identificar previamente o conjunto mínimo de recursos exigido por uma consulta;
- suportar arquivos grandes com streaming e limites explícitos de recursos;
- evitar extrair arquivos ZIP para caminhos arbitrários e impedir zip-slip e expansão descontrolada;
- preservar snapshots e manifestos para reprodução;
- validar layout, ano, turno, cargo e granularidade;
- distinguir ausência de registro de zero;
- registrar exatamente quais recursos e versões sustentam cada resultado;
- não publicar resultados como completos se a cobertura necessária estiver ausente.

**Princípio:** adquirir uma vez, preservar a fonte, processar seletivamente e reutilizar com proveniência — sem presumir que toda fonte seja filtrável remotamente ou que todo arquivo adquirido esteja metodologicamente validado.
