# Comparação e unificação local

## Qual era a diferença

A instalação ativa é `D:\Sistemas DEV\dominação\Simulator`, com o visual, o
catálogo calibrado, as notas reais e os demais ajustes aprovados. O VS Code pode
continuar aberto na pasta pai. O Live Server serve `/Simulator` na porta 5501;
o `index.html` da pasta pai apenas encaminha para essa aplicação.

A versão apagada foi localizada no outro repositório:
[Wallet-Simulator, revisão 278fa677ebc3fad33e2841c92722f017701c8137](https://github.com/Thilanguis/Wallet-Simulator/tree/278fa677ebc3fad33e2841c92722f017701c8137).
Ela foi clonada somente como referência. Os dois projetos usam o Firebase
`walletsumilator`, mas a integração em `dbFirebase/` não existia no repositório
`Simulator` utilizado na modernização.

O commit local `32eff73` criou uma conexão nova com outra coleção e autenticação
anônima. Após localizar a versão correta, a conexão principal foi adaptada para o
**mesmo documento da versão Firebase antiga**, sem exigir um provedor novo. O
commit existente foi preservado; não houve reset, publicação ou novo commit nesta
comparação. A conexão cifrada anterior continua compatível com aparelhos que já a
tenham configurado, mas não cria outra aplicação visível.

## Resultado da comparação

| Recurso                        | Wallet-Simulator encontrado                                                           | Versão única atual                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Projeto e documento            | `walletsumilator`, `usuarios/gabriel-local`                                           | Recuperados na conexão principal                                                                               |
| Atualização entre aparelhos    | `onSnapshot` e callbacks globais                                                      | Mesmo listener no documento existente, com atualização seletiva da interface                                   |
| Saldo, bônus e dados da roleta | Campos legíveis do documento                                                          | Mantidos em campos compatíveis; alterações válidas de saldo e bônus no console chegam ao Wallet                |
| Estado do cronômetro           | Quatro campos enviados a cada cinco segundos                                          | Campos compatíveis e estado preciso da sessão, incluindo unidades acumuladas e combo; sem dupla contagem       |
| Tarefas e histórico antigos    | Subcoleções próprias                                                                  | Preservados sem importação automática, exclusão ou reprecificação                                              |
| Histórico e tarefas atuais     | Não existiam nessa versão                                                             | Persistidos no estado atual cifrado, mantendo IDs, partes concluídas e arquivo                                 |
| Redutores                      | Múltiplos mecanismos e checkpoint incompleto                                          | Integração contínua já aprovada, com orçamento exato e recuperação após suspensão                              |
| Preços e ganhos                | Valores antigos fixos no HTML/JS                                                      | Catálogo atual editável em JSON, personalizações preservadas                                                   |
| Adicionais de ganho            | Checkboxes específicos no código antigo                                               | Estrutura genérica de `extras` no JSON; os presets e preços antigos não foram reimportados                     |
| Opções de jogos externas       | Buraco, Perfil, Match Masters e outras opções antigas                                 | Catálogo atual preservado, inclusive as remoções solicitadas para jogos que têm aplicativos próprios           |
| Roleta                         | Quatro dias, composição e pesos diferentes; resultados em lista; remoções definitivas | Três dias e probabilidades atuais preservadas; serviço gratuito vira tarefa real uma vez; histórico conservado |
| Notas e gastos reais           | Não existiam                                                                          | Oito grupos abertos, ordem, marcadores, equivalências, subtotais, resumo e total geral intactos                |
| Contrato                       | PDF original                                                                          | Contrato na tela derivado do catálogo e regras atuais; PDF de referência mantido                               |
| Confirmações e visual          | Alertas nativos, splash e layout antigo                                               | AppDialog, abertura direta, selo e demais refinamentos atuais preservados                                      |
| Concorrência                   | Gravações independentes e dois cronômetros possíveis                                  | Revisão transacional e controle de sessão para evitar sobrescritas e contagem duplicada                        |
| Privacidade                    | Documento existente aceita leitura sem login                                          | Notas e estado completo cifrados; campos básicos legados continuam sujeitos às regras existentes               |

Não foram copiados os valores, a interface, os pesos da roleta nem registros da
versão antiga. A referência foi usada para recuperar a conexão e mapear os campos.

## Como os dados são preservados

- A primeira conexão usa a carteira **atual deste navegador** como base, após a
  confirmação na tela. A lista antiga do Firebase não substitui a lista atual.
- O documento anterior é copiado atomicamente para
  `usuarios/gabriel-local/config/antesWalletAtualV3`, antes da primeira gravação.
  O backup não é substituído nas conexões seguintes.
- As subcoleções `tarefas`, `historico`, `debugRoleta`, `accelBoosts` e outros
  documentos existentes não são apagados, mesclados ou convertidos por esta tarefa.
- Campos desconhecidos do documento, inclusive o token de notificações existente,
  são preservados. O envelope atual é substituído integralmente em cada transação,
  sem deixar chaves obsoletas ao restaurar um backup.
- A cópia local anterior à conexão continua disponível em Configurações. A chave
  privada de vínculo permanece no navegador e não é enviada ao Firebase.
- O código legado apagava algumas tarefas e giros definitivamente. Esse
  comportamento não foi reintroduzido.

## Verificação do Firebase real

Foram feitas leituras de auditoria, sem autenticação e sem escrita, do documento
`usuarios/gabriel-local`, por REST e pelo SDK em navegador isolado. O servidor
respondeu HTTP 200 e o SDK confirmou a leitura do servidor usando somente o ID
público do projeto. Os nomes dos campos coincidiram com a implementação encontrada.
Uma cópia privada da resposta foi
guardada em `.local-backups/`; nenhum valor ou token real foi colocado no código,
na documentação ou nos testes. Não houve alteração das regras nem escrita de dados
de teste no projeto real.

## Instalação única e tablet

Há uma única fonte ativa: **Simulator/**. A cópia clonada e os arquivos consultados
foram arquivados em ZIPs privados em
`.local-backups/conciliacao-wallet-firebase-1793456267903/`. As cópias antigas de
aplicação que estavam soltas na pasta pai foram guardadas em `raiz-antiga/` nesse
mesmo backup. Nada foi descartado. O índice de encaminhamento, as instruções e a
configuração do VS Code permanecem na pasta pai; o servidor usa somente Simulator.
Não foi alterado o remoto do repositório ativo.

Ambos os repositórios GitHub (`Simulator` e `Wallet-Simulator`) tinham GitHub Pages
habilitado na consulta. A página `thilanguis.github.io/Wallet-Simulator/` ainda
continha o aplicativo antigo com splash e integração `dbFirebase/`, sem o painel
de notas. `thilanguis.github.io/Simulator/` já continha notas e abertura direta,
mas ainda não a conexão desta revisão local. Atualizar `127.0.0.1:5501` não publica
alterações em nenhum deles. Em 01/11/2026, o usuário confirmou que o tablet usa
`https://thilanguis.github.io/Wallet-Simulator/`. Esse é o endereço a considerar
para a futura publicação da versão unificada, preservando a origem e os dados do
navegador. Não é necessário limpar o armazenamento do tablet. Não houve deploy,
exclusão de repositórios nem push nesta unificação.

## Testes

A conexão foi testada com SDK simulado e perfis independentes em desktop, celular
e tablet: envio e recepção da carteira atual, transferência do controle,
recarregamento, queda de conexão, restauração de backup, preservação dos registros
antigos, alterações de saldo pelo console simulado, chave incorreta e ausência de
requisição ao provedor de autenticação. A comparação inclui a preservação exata do
estado financeiro e do texto exportado, sem reconstruir notas a cada segundo.

A inicialização publicada também foi testada sem `firebaseConfiguration.js`:
`firebase-connection.js` usa o ID público do projeto, sem adicionar credenciais ao
repositório. Quando a configuração local existe, ela continua sendo utilizada.

Validação em 31/10/2026:

- `npm test`: 56 testes aprovados, incluindo o build e a compatibilidade Firebase.
- Playwright Live Server: 79 cenários validados em desktop, celular e tablet.
  Na última execução completa, 78 passaram; o teste de ícone ainda consultava a
  raiz antiga. Foi corrigido para resolver a URL relativa à página e passou na
  repetição. Os testes com relógio simulado também foram estabilizados, sem
  alterar cronômetro ou roleta da aplicação.
- Playwright produção: 17 cenários validados. A atualização PWA excedeu o prazo
  de 35 segundos uma vez na suíte; repetida isoladamente com trace, passou em
  cinco segundos, incluindo conservação de saldo/notas e abertura offline.
- Formatação e `git diff --check` sem erros. Backups e configurações locais
  permanecem ignorados pelo Git. Nenhum staging, novo commit ou push foi feito
  nesta comparação/unificação.

Veja [FIREBASE-LOCAL.md](FIREBASE-LOCAL.md) para conectar a versão única.
