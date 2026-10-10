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

- ~~Extração segura de ZIP e inspeção dos CSVs internos.~~ **Implementado** (seção 8): listagem de membros e leitura do cabeçalho em fluxo.
- Parser CSV completo para campos com quebras de linha dentro de aspas (multilinha é **bloqueado** com erro claro, não suportado).
- ~~Leitura seletiva de linhas de CSV/ZIP a partir de filtros de análise~~ **Implementado por coluna/valor** (seção 9b); ainda falta filtro por predicados compostos/faixas e agregação em fluxo.
- Staging analítico persistente e publicação versionada de agregados.
- ~~Armazenamento de objetos persistente para ambientes hospedados.~~ **Abstração implementada** (seção 7); R2 real depende de provisionamento.
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

## 7. Topologia real de deploy (Issue #2, Etapa 1 — auditado)

**O runtime real deste repositório NÃO é Cloudflare Workers.** A verificação local encontrou:

| Item | Estado real |
| --- | --- |
| Runtime | **Node.js + Express** (`server.ts`, executado via `tsx`); frontend Vite/React servido pelo mesmo processo |
| `wrangler.toml` / `wrangler.jsonc` | **Ausente** |
| Bindings R2 / `_worker.js` / `functions/` | **Ausentes** |
| Deploy Cloudflare (CI) | **Ausente** — `.github/workflows/ci.yml` só roda lint + build + testes |
| Variáveis de ambiente | `GEMINI_API_KEY`, `APP_URL` (padrão Google AI Studio / Cloud Run, ver `.env.example`) |
| Dependências Cloudflare/S3 | **Nenhuma** |

Consequência: **R2 não está provisionado nem acessível neste ambiente**. Conforme o protocolo da Issue, a implementação não simulou uma integração R2 real: criou uma **abstração testável** (`TseObjectStorage`) e documentou exatamente o que depende de provisionamento. Não houve alteração de arquitetura até esta documentação ser registrada.

## 8. Adaptador de armazenamento (Issue #2, Etapa 2)

`src/storage/tseStorageAdapter.ts`:

- Interface mínima `TseObjectStorage`: `put/get/head/list/delete` (streams, nunca arquivo inteiro em RAM).
- `LocalObjectStorage` — implementação real sobre `var/tse-downloads`; escrita atômica (`.part` + `rename`), falha de upload não deixa artefato parcial; manifesta sidecar por objeto.
- `R2ObjectStorage` — delega a um `R2S3Client` injetado (interface mínima, streams Node). **SigV4 NÃO implementado aqui**; produção precisa de bucket + token (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) + política GetObject/PutObject/ListObjects/DeleteObject + cliente com assinatura. Testes usam fake do cliente.
- **Chave determinística** `tse/<ano>/<resourceId>/<sha256>.<ext>` + manifesto `...<ext>.manifest.json` — função pura `tseObjectKey()` valida ano/recurso/sha256/extensão e rejeita path traversal. Nenhum caminho vem de usuário.
- **Hash:** calculado localmente durante o upload (`sha256` no fluxo); nunca apresentado como `VERIFIED` — a distinção `HASH_LOCAL_CALCULADO` vs verificação oficial permanece.
- **Reuso:** antes de baixar, consulta `head()`; reutiliza o objeto somente se `resource_url`, `package_modified_at`, `resource_modified_at` e `size_bytes` conferirem. Snapshot antigo é preservado.

### Setup de produção (R2) — pendente de provisionamento
1. Criar bucket R2 (ex.: `ie-tse-artifacts`).
2. Criar token de API S3 com permissões `Object Read & Write`.
3. Configurar env vars `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
4. Injetar um `R2S3Client` com assinatura SigV4 (fora de escopo desta etapa; os testes cobrem o contrato com fake).
5. Apontar `inspectStoredZip({ storage })` para o adaptador R2.

## 9. Inspeção segura de ZIP e leitura seletiva (Issue #2, Etapa 3)

`src/ingestion/tseZipReader.ts` (usa `yauzl` — leitor ZIP streaming mantido, único provider de parse correto de central directory/ZIP64/CRC/deflate; membro nunca é buffered inteiro) e `src/ingestion/tseCsvStream.ts` (leitura byte-a-byte, latin1/ISO-8859-1, O(1) memória por linha):

- **zip-slip:** nomes com `..`, absolutos, backslash ou `C:` → rejeitados (`assertSafeEntryName`).
- **Encriptação:** entrada com `generalPurposeBitFlag` bit 0 → rejeitada.
- **Métodos:** somente stored/deflate; demais → erro claro.
- **Limites configuráveis** (`DEFAULT_ZIP_LIMITS`): 200 entradas, 6 GiB compactado, 25 GiB descompactado, razão de expansão 100×, 3 GiB/membro (bloqueia o membro multi-GB).
- **Nunca extrai** para caminhos arbitrários: expõe apenas streams de membro. Fontes stream (remoto) são spooladas em arquivo temporário anônimo, removido após o uso.
- `inspectStoredZip(resourceId, year)` (local ou storage injetado): lista membros, seleciona CSVs por extensão + cabeçalho, valida layout contra o registry (amostras, sem autorizar ingestão). Endpoint: `POST /api/tse/inspect-zip`.
- **Leitura seletiva real:** ZIP não permite range query por membro sem percorrer o central directory; a leitura lista o diretório central e abre **em fluxo apenas o membro escolhido** — nada é prometido além disso.

## 9b. Leitura seletiva por filtro e preservação de valores (Issue #3)

`src/ingestion/tseSelectiveReader.ts` + ajustes em `tseCsvStream.ts`:

- **Preservação literal:** `parseCsvRecord` (antes `parseCsvLine`) **não aplica `trim`** às células; espaços internos/iniciais/finais são dado oficial. `normalizeHeaderName` (BOM + trim + uppercase) é usado **somente** para comparar nomes de coluna. `readCsvHeader` retorna `raw_header` (literal) + `header` (normalizado).
- **Leitura seletiva em streaming:** `selectZipCsvRows(source, memberName, options)` emite lotes (`batchSize`) filtrando por colunas em allowlist (`VOTACAO_NOMINAL_MUNICIPIO_ZONA_COLUMNS`), com `maxRows` (para cedo, `truncated: true`) e cancelamento seguro (destrói o stream e fecha o ZIP).
- **Contrato/erros:** `TseSelectError { code, details }` — `COLUMN_NOT_ALLOWED`, `COLUMN_NOT_FOUND`, `DUPLICATE_COLUMN`, `EMPTY_HEADER`, `MEMBER_NOT_FOUND`, `MEMBER_TOO_LARGE` (com `size_bytes`/`max_member_bytes`/`alternatives`), `ZIP_BOMB`, `ZIP_READ_ERROR`. Sem truncar silenciosamente.
- **Proveniência:** cada resumo inclui `source` (resource_id, year, resource_url, zip_sha256, membro, tamanho descompactado), `parser_version` (`tse-csv-stream/2-literal`), filtros e contagens lidas/aceitas/rejeitadas.
- **Endpoint:** `POST /api/tse/select-zip` (valida `resource_id`/`year`/`member_name`/`limit`; nunca aceita caminhos do cliente).
- **Limitação explícita:** filtrar linhas **não** evita baixar o ZIP original nem necessariamente descomprimir o membro por completo — o membro é lido sequencialmente em fluxo; não há consulta aleatória por linha. Campos com quebra de linha dentro de aspas continuam **bloqueados** (`MULTILINE_FIELD_ERROR`).
- **Limite de membro:** `maxMemberBytes` default 3 GiB permanece; membros maiores (ex.: `BRASIL.csv` 4,3 GiB) retornam erro estruturado com alternativa técnica, não truncamento.

## 10. Respostas do relatório da Issue #2

1. **Onde ficam os arquivos brutos em produção?** Hoje em `var/tse-downloads` (filesystem do processo — **efêmero em deploys**). Em R2, após provisionamento, na chave `tse/<ano>/<resourceId>/<sha256>.<ext>` (alta durabilidade). Supabase **não** recebe arquivos brutos.
2. **Como o Worker acessa os objetos?** Não há Worker nesta stack. O Node/Express usa `LocalObjectStorage` (default) ou `R2ObjectStorage` via `R2S3Client` injetado.
3. **Como a leitura seletiva evita carregar tudo em RAM?** ZIP: stream do membro exato; CSV: byte-a-byte por linha com limite. Upload/download: stream direto. Nada de `buffer integral`.
4. **Quais operações percorrem o arquivo inteiro?** SHA-256 do upload (necessário para o hash local); leitura de cabeçalho percorre só a primeira linha; listagem lê só o central directory. Análises que exijam todo o membro (contagem total, agregação) percorrerão o fluxo inteiro — ainda não implementadas.
5. **Limites e custos:** R2 cobra operações/armazenamento; limites de segurança em `DEFAULT_ZIP_LIMITS`; arquivos multi-GB (ex.: BRASIL.csv) são listados mas **não** têm conteúdo lido nesta etapa. Capacidade Node de processar membro de 4,3 GiB descompactado é viável em fluxo, mas custo/time fica pendente de política.
6. **O que foi realmente testado contra R2/Cloudflare vs mock:** **Nada real.** Não há credenciais/bucket neste ambiente. Testes usam `FakeR2Client` para `R2ObjectStorage` e `LocalObjectStorage` real em diretório temporário. Validação contra R2 real permanece pendente até provisionamento.
7. **O que falta antes de autorizar ingestão analítica:** provisionar R2 e validar contra o serviço real; parser CSV multilinha (RFC-4180) se surgir dataset com quebras; leitura seletiva de linhas por filtro de análise; reconciliação de totais/cobertura por ano, cargo, turno, território; revisão metodológica independente dos perfis de layout.
